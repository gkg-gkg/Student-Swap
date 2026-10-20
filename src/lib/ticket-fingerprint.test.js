import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTicketCode, dHashFromGrayscale, hammingDistance, compareFingerprint } from './ticket-fingerprint.js';

// Deterministic pseudo-image: 72 grayscale values.
const image = (seed) =>
  Array.from({ length: 72 }, (_, i) =>
    Math.floor(((((Math.sin(seed * 997 + i * 12.9898) * 43758.5453) % 1) + 1) % 1) * 255),
  );
const noisy = (px, amount) => px.map((v, i) => Math.max(0, Math.min(255, v + (((i * 7) % 3) - 1) * amount)));

test('codes are normalised and noise is ignored', () => {
  assert.equal(normalizeTicketCode(' ab-12 34 cd '), 'AB1234CD');
  assert.equal(normalizeTicketCode('ab12'), '');
});

test('dHash is 16 hex chars and stable', () => {
  const h = dHashFromGrayscale(image(1));
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(h, dHashFromGrayscale(image(1)));
});

test('hamming distance counts differing bits', () => {
  assert.equal(hammingDistance('0000000000000000', '0000000000000000'), 0);
  assert.equal(hammingDistance('0000000000000000', 'ffffffffffffffff'), 64);
  assert.equal(hammingDistance('0000000000000001', '0000000000000003'), 1);
});

test('lightly edited copies stay close; unrelated images are far apart', () => {
  const a = dHashFromGrayscale(image(1));
  const edited = dHashFromGrayscale(noisy(image(1), 2));
  const other = dHashFromGrayscale(image(2));
  assert.ok(hammingDistance(a, edited) <= 10, `edited distance ${hammingDistance(a, edited)}`);
  assert.ok(hammingDistance(a, other) > 10, `other distance ${hammingDistance(a, other)}`);
});

test('same file bytes are an exact duplicate', () => {
  const r = compareFingerprint({ fileHash: 'abc', imageHash: null, codes: [] }, [
    { listingId: 'l-1', fileHash: 'abc', imageHash: null, codes: [] },
  ]);
  assert.equal(r.verdict, 'duplicate');
  assert.equal(r.matches[0].kind, 'file_hash');
});

test('same QR/ticket code is an exact duplicate even when the file differs', () => {
  const r = compareFingerprint({ fileHash: 'new', imageHash: null, codes: ['TKT123456'] }, [
    { listingId: 'l-1', fileHash: 'old', imageHash: null, codes: ['TKT123456'] },
  ]);
  assert.equal(r.verdict, 'duplicate');
  assert.equal(r.matches[0].kind, 'code');
});

test('near-identical image goes to review, not a hard block', () => {
  const a = dHashFromGrayscale(image(3));
  const b = dHashFromGrayscale(noisy(image(3), 2));
  const r = compareFingerprint({ fileHash: 'x', imageHash: b, codes: [] }, [
    { listingId: 'l-9', fileHash: 'y', imageHash: a, codes: [] },
  ]);
  assert.equal(r.verdict, 'near_duplicate');
  assert.equal(r.matches[0].listingId, 'l-9');
});

test('unrelated ticket is unique', () => {
  const r = compareFingerprint({ fileHash: 'x', imageHash: dHashFromGrayscale(image(5)), codes: ['AAA111'] }, [
    { listingId: 'l-1', fileHash: 'y', imageHash: dHashFromGrayscale(image(6)), codes: ['BBB222'] },
  ]);
  assert.equal(r.verdict, 'unique');
});

test('exact match outranks a near match', () => {
  const h = dHashFromGrayscale(image(7));
  const r = compareFingerprint({ fileHash: 'same', imageHash: h, codes: [] }, [
    { listingId: 'near', fileHash: 'n', imageHash: h, codes: [] },
    { listingId: 'exact', fileHash: 'same', imageHash: null, codes: [] },
  ]);
  assert.equal(r.verdict, 'duplicate');
  assert.equal(r.matches[0].listingId, 'exact');
});
