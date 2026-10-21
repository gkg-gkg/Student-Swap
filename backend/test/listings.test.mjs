import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, STUDENT, OTHER, ADMIN, DAY } from './helpers.mjs';
import { qrPng, qrPdf, patternPng } from './fixtures.mjs';
import { scanUpload } from '../src/scan/scan.mjs';

/** Presign, "PUT" the bytes, run the scan, like the browser + S3 + scan Lambda would. */
async function upload(
  /** @type {any} */ t,
  /** @type {any} */ as,
  /** @type {Uint8Array} */ bytes,
  contentType = 'image/png',
) {
  const pre = await t.call('POST', '/uploads/presign', {
    as,
    body: { fileName: 'ticket.png', contentType, size: bytes.byteLength, purpose: 'ticket' },
  });
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  t.storage.put(pre.body.key, bytes);
  await scanUpload({ db: t.db, storage: t.storage }, pre.body.key);
  return pre.body.key;
}

/** @param {any} e @param {Record<string, unknown>} [over] */
const pdfListing = (e, over = {}) => ({
  eventId: e.id,
  tierId: e.tiers[1].id,
  quantity: 2,
  pricePence: 1200,
  delivery: 'pdf',
  declarationsAccepted: true,
  ...over,
});

test('a clean ticket goes live; buyers see it without private fields; the event stats update', async () => {
  const t = await setup();
  const e = await t.createEvent();
  const key = await upload(t, STUDENT, await qrPng('TKT-0001-ROSIES'));
  assert.equal((await t.call('GET', '/uploads/check', { as: STUDENT, query: { key } })).body.result, 'passed');

  const res = await t.call('POST', '/listings', { as: STUDENT, body: pdfListing(e, { fileKey: key }) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'active');
  assert.equal(res.body.fileKey, key); // the seller sees their own file key
  assert.equal(res.body.event.id, e.id);
  assert.equal(res.body.tier.name, 'General release');

  const pub = (await t.call('GET', `/listings/${res.body.id}`)).body;
  assert.equal(pub.fileKey, undefined);
  assert.equal(pub.reviewReasons, undefined);
  assert.equal(pub.seller.email, undefined);

  const ev = (await t.call('GET', '/events')).body[0];
  assert.equal(ev.ticketsAvailable, 2);
  assert.equal(ev.lowestPricePence, 1200);
  assert.equal(ev.sellingFast, true);
  assert.equal((await t.call('GET', `/events/${e.id}`)).body.listings.length, 1);
});

test('the same ticket again is blocked: at the scan, and at publish even if listed in between', async () => {
  const t = await setup();
  const e = await t.createEvent();
  const ticket = await qrPdf('TKT-0002-DUP');
  const first = await upload(t, STUDENT, ticket, 'application/pdf');
  // A second copy uploaded BEFORE the first is listed passes its scan...
  const second = await upload(t, OTHER, ticket, 'application/pdf');
  assert.equal(
    (await t.call('POST', '/listings', { as: STUDENT, body: pdfListing(e, { fileKey: first }) })).body.status,
    'active',
  );
  // ...but publish re-checks against what is listed now.
  const dup = await t.call('POST', '/listings', { as: OTHER, body: pdfListing(e, { fileKey: second }) });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'duplicate_ticket');
  // A third copy, after the listing exists, fails at the scan. Same QR in a different file (a PNG) counts too.
  const third = await upload(t, OTHER, await qrPng('TKT-0002-DUP'));
  const check = (await t.call('GET', '/uploads/check', { as: OTHER, query: { key: third } })).body;
  assert.equal(check.result, 'rejected');
  assert.equal(check.reasons[0].code, 'duplicate');
});

test('a delisted ticket can be listed again; a sold or expired one would still count as a duplicate', async () => {
  const t = await setup();
  const e = await t.createEvent();
  const bytes = await qrPng('TKT-0003-RELIST');
  const l = (
    await t.call('POST', '/listings', {
      as: STUDENT,
      body: pdfListing(e, { fileKey: await upload(t, STUDENT, bytes) }),
    })
  ).body;
  assert.equal((await t.call('DELETE', `/listings/${l.id}`, { as: STUDENT })).body.status, 'removed');
  const again = await t.call('POST', '/listings', {
    as: STUDENT,
    body: pdfListing(e, { fileKey: await upload(t, STUDENT, bytes) }),
  });
  assert.equal(again.body.status, 'active');
  await t.db.query(`update listings set status = 'sold' where id = $1`, [again.body.id]);
  const resold = await upload(t, OTHER, bytes);
  assert.equal((await t.call('GET', '/uploads/check', { as: OTHER, query: { key: resold } })).body.result, 'rejected');
});

test('near-identical image and unreadable barcode go to review; admin approves or rejects with a reason', async () => {
  const t = await setup();
  const e = await t.createEvent();
  // No barcode readable -> review.
  const k1 = await upload(t, STUDENT, patternPng(600, 900, 4));
  const c1 = (await t.call('GET', '/uploads/check', { as: STUDENT, query: { key: k1 } })).body;
  assert.equal(c1.result, 'needs_review');
  const l1 = (await t.call('POST', '/listings', { as: STUDENT, body: pdfListing(e, { fileKey: k1 }) })).body;
  assert.equal(l1.status, 'under_review');
  assert.equal(l1.reviewReasons[0].source, 'barcode');
  // A resized copy of that same picture -> near duplicate.
  const k2 = await upload(t, OTHER, patternPng(450, 675, 4));
  const l2 = (await t.call('POST', '/listings', { as: OTHER, body: pdfListing(e, { fileKey: k2 }) })).body;
  assert.equal(l2.status, 'under_review');
  assert.ok(l2.reviewReasons.some((/** @type {any} */ r) => r.code === 'near_duplicate'));

  const queue = (await t.call('GET', '/admin/listings/review', { as: ADMIN })).body;
  assert.deepEqual(
    queue.map((/** @type {any} */ l) => l.id),
    [l1.id, l2.id],
  ); // oldest first
  assert.equal(queue[0].file.name, 'ticket.png');
  assert.equal((await t.call('GET', '/admin/listings/review', { as: STUDENT })).status, 403);
  const url = (await t.call('POST', `/admin/listings/${l1.id}/file-url`, { as: ADMIN })).body;
  assert.equal(url.expiresInSeconds, 60);

  assert.equal(
    (await t.call('POST', `/admin/listings/${l2.id}/review`, { as: ADMIN, body: { decision: 'reject' } })).status,
    400,
  );
  const rej = (
    await t.call('POST', `/admin/listings/${l2.id}/review`, {
      as: ADMIN,
      body: { decision: 'reject', note: 'Looks like a copy of another ticket.' },
    })
  ).body;
  assert.equal(rej.status, 'removed');
  assert.equal(rej.reviewNote, 'Looks like a copy of another ticket.');
  assert.equal(
    (await t.call('POST', `/admin/listings/${l1.id}/review`, { as: ADMIN, body: { decision: 'approve' } })).body.status,
    'active',
  );
  assert.equal(
    (await t.call('POST', `/admin/listings/${l1.id}/review`, { as: ADMIN, body: { decision: 'approve' } })).status,
    409,
  );
});

test('server rules: price cap, quantity, declarations, finished events, listing window, ownership of the file', async () => {
  const t = await setup();
  const e = await t.createEvent();
  const key = await upload(t, STUDENT, await qrPng('TKT-0004-RULES'));
  const post = (/** @type {Record<string, unknown>} */ over, as = STUDENT) =>
    t.call('POST', '/listings', { as, body: pdfListing(e, { fileKey: key, ...over }) });

  const above = await post({ pricePence: 1201 });
  assert.equal(above.status, 400);
  assert.equal(above.body.code, 'above_cap');
  assert.equal((await post({ pricePence: 99 })).body.code, 'too_low');
  assert.equal((await post({ quantity: 7 })).status, 400);
  assert.equal((await post({ declarationsAccepted: false })).status, 400);
  assert.equal((await post({ tierId: 'nope' })).status, 400);
  assert.equal((await post({}, OTHER)).status, 400); // someone else's upload
  assert.equal((await post({ fileKey: undefined })).status, 400);
  assert.equal((await t.call('POST', '/listings', { body: pdfListing(e, { fileKey: key }) })).status, 401);

  const far = await t.createEvent({ startsAt: new Date(t.clock.now.getTime() + 100 * DAY).toISOString() });
  const tooEarly = await t.call('POST', '/listings', { as: STUDENT, body: pdfListing(far, { fileKey: key }) });
  assert.equal(tooEarly.body.code, 'too_early');

  t.clock.now = new Date(t.clock.now.getTime() + 10 * DAY); // the event is over
  assert.equal((await post({})).status, 400);
});

test('payouts must be set up first when REQUIRE_PAYOUTS is on', async () => {
  const t = await setup({ requirePayouts: true });
  const e = await t.createEvent();
  const body = {
    eventId: e.id,
    tierId: e.tiers[0].id,
    quantity: 1,
    pricePence: 800,
    delivery: 'transfer',
    transferPlatform: 'Fixr',
    declarationsAccepted: true,
  };
  const blocked = await t.call('POST', '/listings', { as: STUDENT, body });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'payouts_required');
  await t.payoutsReady(STUDENT.sub);
  assert.equal((await t.call('POST', '/listings', { as: STUDENT, body })).body.status, 'active');
});

test('a file still being scanned can not be published yet', async () => {
  const t = await setup();
  const e = await t.createEvent();
  const pre = await t.call('POST', '/uploads/presign', {
    as: STUDENT,
    body: { fileName: 'a.png', contentType: 'image/png', size: 100, purpose: 'ticket' },
  });
  assert.equal(
    (await t.call('GET', '/uploads/check', { as: STUDENT, query: { key: pre.body.key } })).body.result,
    'checking',
  );
  const res = await t.call('POST', '/listings', { as: STUDENT, body: pdfListing(e, { fileKey: pre.body.key }) });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'scan_pending');
});

test('editing and delisting: only the seller, only while active or under review, cap re-checked', async () => {
  const t = await setup();
  const e = await t.createEvent();
  const l = (
    await t.call('POST', '/listings', {
      as: STUDENT,
      body: pdfListing(e, { fileKey: await upload(t, STUDENT, await qrPng('TKT-0005-EDIT')) }),
    })
  ).body;
  assert.equal((await t.call('PATCH', `/listings/${l.id}`, { as: OTHER, body: { pricePence: 1000 } })).status, 404);
  assert.equal(
    (await t.call('PATCH', `/listings/${l.id}`, { as: STUDENT, body: { pricePence: 5000 } })).body.code,
    'above_cap',
  );
  assert.equal(
    (await t.call('PATCH', `/listings/${l.id}`, { as: STUDENT, body: { pricePence: 1000 } })).body.pricePence,
    1000,
  );
  assert.equal((await t.call('DELETE', `/listings/${l.id}`, { as: OTHER })).status, 404);
  await t.call('DELETE', `/listings/${l.id}`, { as: STUDENT });
  assert.equal((await t.call('PATCH', `/listings/${l.id}`, { as: STUDENT, body: { pricePence: 900 } })).status, 409);
  const mine = (await t.call('GET', '/me/listings', { as: STUDENT })).body;
  assert.deepEqual(
    mine.map((/** @type {any} */ x) => x.status),
    ['removed'],
  );
});

test('the database itself refuses a price above face value', async () => {
  const t = await setup();
  const e = await t.createEvent();
  await t.call('GET', '/me', { as: STUDENT });
  await assert.rejects(
    t.db.query(
      `insert into listings (id, event_id, tier_id, seller_id, quantity, price_pence, face_value_pence, delivery, status)
       values ('x', $1, $2, $3, 1, 1300, 1200, 'transfer', 'active')`,
      [e.id, e.tiers[1].id, STUDENT.sub],
    ),
  );
});

test('uploads: type and size limits, keys are namespaced by user, checks only show your own files', async () => {
  const t = await setup();
  const presign = (/** @type {Record<string, unknown>} */ over) =>
    t.call('POST', '/uploads/presign', {
      as: STUDENT,
      body: { fileName: 'x.pdf', contentType: 'application/pdf', size: 1000, purpose: 'ticket', ...over },
    });
  assert.equal((await presign({ contentType: 'image/gif' })).status, 400);
  assert.equal((await presign({ size: 11 * 1024 * 1024 })).status, 400);
  assert.equal((await presign({ purpose: 'other' })).status, 400);
  const ok = (await presign({})).body;
  assert.match(ok.key, new RegExp(`^tickets/${STUDENT.sub}/[0-9a-f-]{36}\\.pdf$`));
  assert.match(ok.uploadUrl, /ct=application%2Fpdf&len=1000/);
  assert.equal((await t.call('GET', '/uploads/check', { as: OTHER, query: { key: ok.key } })).status, 404);
});
