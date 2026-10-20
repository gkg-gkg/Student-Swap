import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  assertTransition,
  listingTransitions,
  offerTransitions,
  orderTransitions,
  payoutTransitions,
} from './status.js';

test('listing happy path: draft -> under_review -> active -> reserved -> sold', () => {
  for (const [a, b] of [
    ['draft', 'under_review'],
    ['under_review', 'active'],
    ['active', 'reserved'],
    ['reserved', 'sold'],
  ]) {
    assert.ok(canTransition(listingTransitions, a, b), `${a} -> ${b}`);
  }
});

test('a reserved listing returns to active when a hold lapses', () => {
  assert.ok(canTransition(listingTransitions, 'reserved', 'active'));
});

test('sold, expired and removed listings are terminal', () => {
  for (const s of ['sold', 'expired', 'removed']) assert.deepEqual(listingTransitions[s], []);
});

test('offers can only leave open (or accepted -> expired)', () => {
  assert.ok(canTransition(offerTransitions, 'open', 'accepted'));
  assert.ok(canTransition(offerTransitions, 'accepted', 'expired'));
  assert.ok(!canTransition(offerTransitions, 'declined', 'accepted'));
});

test('order cannot skip payment', () => {
  assert.ok(!canTransition(orderTransitions, 'pending_payment', 'delivered'));
  assert.ok(canTransition(orderTransitions, 'pending_payment', 'paid'));
});

test('a reported order resolves to refunded or completed only', () => {
  assert.deepEqual(orderTransitions.reported, ['refunded', 'completed']);
});

test('refunded and completed orders are terminal', () => {
  assert.deepEqual(orderTransitions.refunded, []);
  assert.deepEqual(orderTransitions.completed, []);
});

test('released payouts are final; frozen can only go back to eligible', () => {
  assert.deepEqual(payoutTransitions.released, []);
  assert.deepEqual(payoutTransitions.frozen, ['eligible']);
});

test('assertTransition throws on illegal moves and passes on legal ones', () => {
  assert.throws(() => assertTransition(orderTransitions, 'completed', 'paid'), /Illegal transition/);
  assert.doesNotThrow(() => assertTransition(orderTransitions, 'paid', 'delivered'));
});

test('unknown states are never allowed', () => {
  assert.equal(canTransition(listingTransitions, 'nope', 'active'), false);
});
