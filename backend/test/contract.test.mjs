// The mock API (src/api/*.mock.js) is the contract the UI was built against. Every field the mock returns must also
// come back from the real backend, or a page would break when USE_MOCKS is switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, STUDENT } from './helpers.mjs';
import { qrPng } from './fixtures.mjs';
import { scanUpload } from '../src/scan/scan.mjs';

// Just enough browser for the mock modules: they read location.search and keep their DB in localStorage.
/** @type {any} */ (globalThis).location = { search: '' };
/** @type {any} */ (globalThis).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const eventsMock = await import('../../src/api/events.mock.js');
const listingsMock = await import('../../src/api/listings.mock.js');

/** Keys (one level deep, and inside nested objects) that `mock` has and `real` lacks. @param {any} mock @param {any} real */
function missingKeys(mock, real, path = '') {
  /** @type {string[]} */
  const out = [];
  for (const k of Object.keys(mock)) {
    if (mock[k] === undefined) continue;
    if (!(k in real)) out.push(path + k);
    else if (
      mock[k] &&
      typeof mock[k] === 'object' &&
      !Array.isArray(mock[k]) &&
      real[k] &&
      typeof real[k] === 'object'
    )
      out.push(...missingKeys(mock[k], real[k], `${path}${k}.`));
  }
  return out;
}

test('GET /events and /events/:id return every field the mock does', async () => {
  const t = await setup();
  const e = await t.createEvent();
  const [mockEvent] = await eventsMock.listEvents();
  const [realEvent] = (await t.call('GET', '/events')).body;
  assert.deepEqual(missingKeys(mockEvent, realEvent), []);
  const mockOne = await eventsMock.getEvent(mockEvent.id);
  const realOne = (await t.call('GET', `/events/${e.id}`)).body;
  assert.deepEqual(missingKeys({ ...mockOne, listings: undefined }, realOne), []);
  assert.deepEqual(missingKeys(mockEvent.tiers[0], realEvent.tiers[0]), []);
});

test("a seller's own listing has every field the mock's does", async () => {
  const t = await setup();
  const e = await t.createEvent();
  const pre = await t.call('POST', '/uploads/presign', {
    as: STUDENT,
    body: { fileName: 't.png', contentType: 'image/png', size: 9, purpose: 'ticket' },
  });
  t.storage.put(pre.body.key, await qrPng('TKT-CONTRACT-1'));
  await scanUpload({ db: t.db, storage: t.storage }, pre.body.key);
  const real = (
    await t.call('POST', '/listings', {
      as: STUDENT,
      body: {
        eventId: e.id,
        tierId: e.tiers[0].id,
        quantity: 1,
        pricePence: 800,
        delivery: 'pdf',
        fileKey: pre.body.key,
        declarationsAccepted: true,
      },
    })
  ).body;
  const { listEvents } = eventsMock;
  const anyEvent = (await listEvents()).find((x) => x.ticketsAvailable > 0);
  const mockListing = (await eventsMock.getEvent(anyEvent.id)).listings[0];
  // The mock leaves out fields that don't apply (e.g. transferPlatform on PDF listings), so compare those present.
  const ignore = new Set(['transferPlatform', 'reviewNote', 'fileKey', 'fileName', 'barcodeCheck', 'reviewReasons']);
  const missing = missingKeys(mockListing, real).filter((k) => !ignore.has(k));
  assert.deepEqual(missing, []);
  assert.equal(typeof listingsMock.createListing, 'function');
});
