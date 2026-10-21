import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, STUDENT } from './helpers.mjs';
import { qrPng, qrPdf, patternPng } from './fixtures.mjs';
import { fingerprintTicket, sniffType } from '../src/scan/fingerprint.mjs';
import { scanUpload } from '../src/scan/scan.mjs';
import { hammingDistance } from '../../src/lib/ticket-fingerprint.js';

test('reads QR codes from PNGs and PDFs and normalises them the same way', async () => {
  const png = (await fingerprintTicket(await qrPng('tkt-77/88-zz'))).fingerprint;
  const pdf = (await fingerprintTicket(await qrPdf('TKT 77 88 ZZ'))).fingerprint;
  assert.deepEqual(png.codes, ['TKT7788ZZ']);
  assert.deepEqual(pdf.codes, ['TKT7788ZZ']);
  assert.notEqual(png.fileHash, pdf.fileHash);
  assert.match(png.imageHash ?? '', /^[0-9a-f]{16}$/);
});

test('perceptual hash: a resized copy is near, a different image is far', async () => {
  const a = (await fingerprintTicket(patternPng(600, 900, 4))).fingerprint;
  const b = (await fingerprintTicket(patternPng(300, 450, 4))).fingerprint;
  const c = (await fingerprintTicket(patternPng(600, 900, 9))).fingerprint;
  assert.ok(hammingDistance(/** @type {string} */ (a.imageHash), /** @type {string} */ (b.imageHash)) <= 10);
  assert.ok(hammingDistance(/** @type {string} */ (a.imageHash), /** @type {string} */ (c.imageHash)) > 10);
});

test('sniffs the real file type from its bytes', () => {
  assert.equal(sniffType(new TextEncoder().encode('%PDF-1.7')), 'application/pdf');
  assert.equal(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'image/png');
  assert.equal(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffType(new TextEncoder().encode('<html>')), null);
});

/** @param {any} t @param {Uint8Array} bytes @param {string} contentType */
async function scanned(t, bytes, contentType) {
  const pre = await t.call('POST', '/uploads/presign', {
    as: STUDENT,
    body: { fileName: 'f', contentType, size: bytes.byteLength, purpose: 'ticket' },
  });
  t.storage.put(pre.body.key, bytes);
  return { key: pre.body.key, result: await scanUpload({ db: t.db, storage: t.storage }, pre.body.key) };
}

test('rejects files that are not what they claim, or not tickets at all', async () => {
  const t = await setup();
  assert.equal(
    (await scanned(t, new TextEncoder().encode('<script>alert(1)</script>'), 'application/pdf')).result?.status,
    'rejected',
  );
  assert.equal((await scanned(t, await qrPng('TKT-123456'), 'application/pdf')).result?.status, 'rejected'); // PNG posing as PDF
  assert.equal(
    (await scanned(t, new TextEncoder().encode('%PDF-1.7 broken'), 'application/pdf')).result?.status,
    'rejected',
  );
});

test('a virus-flagged file is rejected and deleted; repeat deliveries are no-ops', async () => {
  const t = await setup();
  const pre = await t.call('POST', '/uploads/presign', {
    as: STUDENT,
    body: { fileName: 'f', contentType: 'image/png', size: 10, purpose: 'ticket' },
  });
  t.storage.put(pre.body.key, await qrPng('TKT-VIRUS-1'));
  const r = await scanUpload({ db: t.db, storage: t.storage }, pre.body.key, { malware: 'infected' });
  assert.equal(r?.status, 'rejected');
  assert.equal(t.storage.objects.has(pre.body.key), false);
  assert.equal(await scanUpload({ db: t.db, storage: t.storage }, pre.body.key), null); // already scanned
});

test('when the virus scan could not run, an otherwise clean ticket still goes to a person', async () => {
  const t = await setup();
  const pre = await t.call('POST', '/uploads/presign', {
    as: STUDENT,
    body: { fileName: 'f', contentType: 'image/png', size: 10, purpose: 'ticket' },
  });
  t.storage.put(pre.body.key, await qrPng('TKT-UNSCANNED-1'));
  assert.equal(
    (await scanUpload({ db: t.db, storage: t.storage }, pre.body.key, { malware: 'unscanned' }))?.status,
    'needs_review',
  );
});
