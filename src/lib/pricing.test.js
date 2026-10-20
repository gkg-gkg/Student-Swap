import test from 'node:test';
import assert from 'node:assert/strict';
import { validateListingPrice, maxPrice } from './pricing.js';

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
