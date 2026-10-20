// Unit tests for payments.mjs with a fake Stripe client and an in-memory db. No network, no keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { createPayments, PaymentsError } from './payments.mjs';

const realStripe = new Stripe('sk_test_unused');
const SECRET = 'whsec_test';
const NOW = new Date('2026-10-20T12:00:00Z');

function setup({ transfersStatus = 'active' } = {}) {
  const calls = [];
  const rec =
    (name, ret) =>
    async (...args) => (calls.push([name, ...args]), typeof ret === 'function' ? ret(...args) : ret);
  const stripe = {
    webhooks: realStripe.webhooks,
    paymentIntents: {
      create: rec('pi.create', { id: 'pi_1', client_secret: 'pi_1_secret' }),
      retrieve: rec('pi.retrieve', (id) => ({
        id,
        status: 'requires_payment_method',
        client_secret: `${id}_secret`,
        metadata: { orderId: 'o1' },
      })),
    },
    accountLinks: { create: rec('link.create', { url: 'https://connect.stripe.com/setup/x' }) },
    transfers: { create: rec('transfer.create', { id: 'tr_1' }) },
    refunds: { create: rec('refund.create', { id: 're_1' }) },
    v2: {
      core: {
        accounts: {
          create: rec('acct.create', { id: 'acct_1' }),
          retrieve: rec('acct.retrieve', () => ({
            configuration: {
              recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: transfersStatus } } } },
            },
          })),
        },
      },
    },
  };
  const data = {
    orders: {
      o1: {
        id: 'o1',
        buyerId: 'buyer',
        status: 'pending_payment',
        totalPence: 893,
        holdExpiresAt: '2026-10-20T12:02:00Z',
      },
    },
    users: { seller: { id: 'seller', email: 's@bham.ac.uk', displayName: 'Sam' } },
    payouts: {
      p1: {
        id: 'p1',
        orderId: 'o1',
        sellerId: 'seller',
        amountPence: 807,
        status: 'held',
        releaseAt: '2026-10-19T00:00:00Z',
        chargeId: 'ch_1',
        hasOpenReport: false,
      },
    },
  };
  const db = {
    getOrder: async (id) => data.orders[id] ?? null,
    setOrderPaymentIntent: async (id, pi) => void (data.orders[id].paymentIntentId = pi),
    markOrderPaid: rec('db.paid'),
    markOrderRefunded: rec('db.refunded'),
    flagOrder: rec('db.flag'),
    getUser: async (id) => data.users[id] ?? null,
    setUserStripeAccount: async (id, acct) => void (data.users[id].stripeAccountId = acct),
    getPayout: async (id) => data.payouts[id] ?? null,
    markPayoutReleased: rec('db.released'),
    markPayoutEligible: rec('db.eligible'),
  };
  const payments = createPayments({
    stripe,
    db,
    siteUrl: 'https://example.test/',
    webhookSecret: SECRET,
    now: () => NOW,
  });
  return { payments, calls, data };
}

const webhook = (payments, event) => {
  const rawBody = JSON.stringify(event);
  const signature = realStripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: SECRET });
  return payments.handleWebhook({ rawBody, signature });
};
const named = (calls, name) => calls.filter((c) => c[0] === name);

test('checkout: PaymentIntent uses the order total from the database, in GBP, linked to the order', async () => {
  const { payments, calls } = setup();
  const { clientSecret } = await payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' });
  assert.equal(clientSecret, 'pi_1_secret');
  const [, params, opts] = named(calls, 'pi.create')[0];
  assert.deepEqual([params.amount, params.currency, params.transfer_group], [893, 'gbp', 'order_o1']);
  assert.equal(opts.idempotencyKey, 'order-o1-pi');
});

test('checkout: reloading re-uses the same PaymentIntent', async () => {
  const { payments, calls } = setup();
  await payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' });
  await payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' });
  assert.equal(named(calls, 'pi.create').length, 1);
});

test("checkout: someone else's order, a paid order, or an expired hold is refused", async () => {
  const { payments, data } = setup();
  await assert.rejects(payments.createPaymentSession({ userId: 'intruder', orderId: 'o1' }), { status: 404 });
  data.orders.o1.holdExpiresAt = '2026-10-20T11:59:00Z';
  await assert.rejects(payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' }), /expired/);
  data.orders.o1.status = 'paid';
  await assert.rejects(payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' }), PaymentsError);
});

test('webhook: a forged signature is rejected', async () => {
  const { payments } = setup();
  await assert.rejects(payments.handleWebhook({ rawBody: '{}', signature: 't=1,v1=forged' }), { status: 400 });
});

test('webhook: payment_intent.succeeded marks the order paid with the charge id', async () => {
  const { payments, calls } = setup();
  await webhook(payments, {
    id: 'evt_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: { id: 'pi_1', amount_received: 893, currency: 'gbp', latest_charge: 'ch_1', metadata: { orderId: 'o1' } },
    },
  });
  assert.deepEqual(named(calls, 'db.paid')[0].slice(1), ['o1', { paymentIntentId: 'pi_1', chargeId: 'ch_1' }]);
});

test('webhook: a payment for the wrong amount is flagged, not marked paid', async () => {
  const { payments, calls } = setup();
  await webhook(payments, {
    id: 'evt_2',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: { id: 'pi_1', amount_received: 100, currency: 'gbp', latest_charge: 'ch_1', metadata: { orderId: 'o1' } },
    },
  });
  assert.equal(named(calls, 'db.paid').length, 0);
  assert.equal(named(calls, 'db.flag').length, 1);
});

test('payouts setup: creates the seller account once, as a GB recipient, then an onboarding link', async () => {
  const { payments, calls } = setup();
  const { url } = await payments.createConnectLink({ userId: 'seller' });
  await payments.createConnectLink({ userId: 'seller' });
  assert.match(url, /connect\.stripe\.com/);
  const creates = named(calls, 'acct.create');
  assert.equal(creates.length, 1);
  assert.equal(creates[0][1].configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested, true);
  assert.equal(named(calls, 'link.create')[1][1].account, 'acct_1');
});

test('payouts setup: status maps to not_started / pending / complete', async () => {
  assert.equal((await setup().payments.getConnectStatus({ userId: 'seller' })).status, 'not_started');
  const pending = setup({ transfersStatus: 'restricted' });
  pending.data.users.seller.stripeAccountId = 'acct_1';
  assert.equal((await pending.payments.getConnectStatus({ userId: 'seller' })).status, 'pending');
  const done = setup();
  done.data.users.seller.stripeAccountId = 'acct_1';
  assert.equal((await done.payments.getConnectStatus({ userId: 'seller' })).status, 'complete');
});

test('release: transfers the seller share, tied to the original charge, exactly once', async () => {
  const { payments, calls, data } = setup();
  data.users.seller.stripeAccountId = 'acct_1';
  assert.equal((await payments.releasePayout({ payoutId: 'p1' })).status, 'released');
  const [, params, opts] = named(calls, 'transfer.create')[0];
  assert.deepEqual([params.amount, params.destination, params.source_transaction], [807, 'acct_1', 'ch_1']);
  assert.equal(opts.idempotencyKey, 'payout-p1');
});

test('release: not before the release time, never with an open report', async () => {
  const early = setup();
  early.data.payouts.p1.releaseAt = '2026-10-21T00:00:00Z';
  assert.equal((await early.payments.releasePayout({ payoutId: 'p1' })).status, 'held');
  const reported = setup();
  reported.data.payouts.p1.hasOpenReport = true;
  assert.equal((await reported.payments.releasePayout({ payoutId: 'p1' })).status, 'frozen');
  assert.equal(named([...early.calls, ...reported.calls], 'transfer.create').length, 0);
});

test('release: waits (eligible) if the seller has not finished onboarding', async () => {
  const { payments, calls, data } = setup({ transfersStatus: 'restricted' });
  data.users.seller.stripeAccountId = 'acct_1';
  assert.equal((await payments.releasePayout({ payoutId: 'p1' })).status, 'eligible');
  assert.equal(named(calls, 'transfer.create').length, 0);
});

test('refund: refused once the seller has been paid', async () => {
  const { payments, data } = setup();
  Object.assign(data.orders.o1, { paymentIntentId: 'pi_1', payoutReleased: true });
  await assert.rejects(payments.refundOrder({ orderId: 'o1' }), { status: 409 });
});
