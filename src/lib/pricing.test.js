import test from 'node:test';
import assert from 'node:assert/strict';
import { validateListingPrice, maxPrice, listingWindow } from './pricing.js';

test('price at face value is allowed', () => {
  assert.deepEqual(validateListingPrice(2000, 2000, 1), { ok: true });
});

test('price below face value is allowed', () => {
  assert.deepEqual(validateListingPrice(1500, 2000, 1), { ok: true });
});

test('price above face value is rejected with the cap', () => {
  assert.deepEqual(validateListingPrice(2001, 2000, 1), { ok: false, reason: 'above_cap', max: 2000 });
});

test('non-integer pence rejected', () => {
  assert.equal(validateListingPrice(1999.5, 2000, 1).ok, false);
});

test('prices under 1 pound rejected', () => {
  assert.equal(validateListingPrice(50, 2000, 1).ok, false);
});

test('multiplier is the single switch', () => {
  assert.equal(maxPrice(2000, 1.1), 2200);
  assert.equal(validateListingPrice(2200, 2000, 1.1).ok, true);
});

test('default config enforces a hard face-value cap', () => {
  assert.equal(validateListingPrice(2001, 2000).ok, false);
});

test('events can be listed from 85 days before they start, not earlier', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  assert.equal(listingWindow('2026-03-01T22:00:00Z', now, 85).ok, true); // 59 days away
  assert.equal(listingWindow('2026-03-27T11:00:00Z', now, 85).ok, true); // just inside 85 days
  const far = listingWindow('2026-06-01T22:00:00Z', now, 85);
  assert.equal(far.ok, false);
  assert.equal(far.ok === false && far.opensAt.toISOString(), '2026-03-08T22:00:00.000Z');
});
