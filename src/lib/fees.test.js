import test from 'node:test';
import assert from 'node:assert/strict';
import { buyerTotal, sellerPayout, percentOf } from './fees.js';

const rules = { buyerFeeBps: 500, sellerFeeBps: 500 };

test('buyer pays price + 5%', () => {
  assert.deepEqual(buyerTotal(2000, rules), { price: 2000, buyerFee: 100, total: 2100 });
});

test('seller receives price - 5%', () => {
  assert.deepEqual(sellerPayout(2000, rules), { price: 2000, sellerFee: 100, payout: 1900 });
});

test('fees round half up to whole pence', () => {
  assert.equal(percentOf(1010, 500), 51); // 50.5 -> 51
  assert.equal(percentOf(1009, 500), 50); // 50.45 -> 50
});

test('totals are always integers', () => {
  for (let p = 100; p <= 20000; p += 37) {
    const { total } = buyerTotal(p, rules);
    const { payout } = sellerPayout(p, rules);
    assert.ok(Number.isInteger(total) && Number.isInteger(payout));
  }
});

test('zero-fee rules leave price unchanged', () => {
  assert.equal(buyerTotal(1500, { buyerFeeBps: 0 }).total, 1500);
});
