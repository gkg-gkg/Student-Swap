import test from 'node:test';
import assert from 'node:assert/strict';
import { buyerTotal, sellerPayout, percentOf, buyerFeeText, cardFeeText } from './fees.js';

const rules = { buyerFeeBps: 700, buyerFeeMinPence: 49, cardFeeBps: 150, cardFeeFixedPence: 20 };

test('buyer pays price + 7% booking fee', () => {
  assert.deepEqual(buyerTotal(2000, rules), { price: 2000, buyerFee: 140, total: 2140 });
});

test('booking fee has a 49p minimum', () => {
  assert.deepEqual(buyerTotal(500, rules), { price: 500, buyerFee: 49, total: 549 }); // 7% would be 35p
  assert.equal(buyerTotal(700, rules).buyerFee, 49); // exactly 49p either way
});

test("seller pays only Stripe's card fee, charged on the whole payment", () => {
  // £20 ticket: buyer pays £21.40; card fee = 1.5% of 2140 (32p) + 20p = 52p
  assert.deepEqual(sellerPayout(2000, rules), { price: 2000, cardFee: 52, payout: 1948 });
  // £5 ticket: buyer pays £5.49; card fee = 8p + 20p
  assert.deepEqual(sellerPayout(500, rules), { price: 500, cardFee: 28, payout: 472 });
});

test('fees round half up to whole pence', () => {
  assert.equal(percentOf(1010, 500), 51); // 50.5 -> 51
  assert.equal(percentOf(1009, 500), 50); // 50.45 -> 50
});

test('totals are always integers and the seller always gets something', () => {
  for (let p = 100; p <= 20000; p += 37) {
    const { total } = buyerTotal(p, rules);
    const { payout } = sellerPayout(p, rules);
    assert.ok(Number.isInteger(total) && Number.isInteger(payout));
    assert.ok(payout > 0);
  }
});

test('fee copy reads from the config', () => {
  assert.equal(buyerFeeText(), '7% (min 49p)');
  assert.equal(cardFeeText(), '1.5% + 20p');
});
