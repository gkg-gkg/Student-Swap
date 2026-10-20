// Unit tests for payments.mjs with a fake Stripe client and an in-memory db. No network, no keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { createPayments, PaymentsError } from './payments.mjs';

const realStripe = new Stripe('sk_test_unused');
const SECRET = 'whsec_test';
const NOW = new Date('2026-10-20T12:00:00Z');

function setup({ sellerStatus = 'active', availablePence = 10000 } = {}) {
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
    // £9.10 paid; Stripe fee 34p and our 60p booking fee already taken off `net` on the seller's account.
    charges: { retrieve: rec('charge.retrieve', { balance_transaction: { net: 816 }, application_fee_amount: 60 }) },
    accountLinks: { create: rec('link.create', { url: 'https://connect.stripe.com/setup/x' }) },
    balanceSettings: { update: rec('balanceSettings.update', {}) },
    balance: { retrieve: rec('balance.retrieve', { available: [{ currency: 'gbp', amount: availablePence }] }) },
    payouts: { create: rec('payout.create', { id: 'po_1' }) },
    refunds: { create: rec('refund.create', { id: 're_1' }) },
    v2: {
      core: {
        accounts: {
          create: rec('acct.create', { id: 'acct_1' }),
          retrieve: rec('acct.retrieve', () => ({
            configuration: {
              merchant: {
                capabilities: {
                  card_payments: { status: sellerStatus },
                  stripe_balance: { payouts: { status: sellerStatus } },
                },
              },
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
        sellerId: 'seller',
        status: 'pending_payment',
        totalPence: 910,
        buyerFeePence: 60,
        holdExpiresAt: '2026-10-20T12:02:00Z',
      },
    },
    users: { seller: { id: 'seller', email: 's@bham.ac.uk', displayName: 'Sam', stripeAccountId: 'acct_1' } },
    payouts: {
      p1: {
        id: 'p1',
        orderId: 'o1',
        sellerId: 'seller',
        amountPence: 816,
        status: 'held',
        releaseAt: '2026-10-19T00:00:00Z',
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

test("checkout: charge on the seller's account, total from our database, booking fee as the application fee", async () => {
  const { payments, calls } = setup();
  const res = await payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' });
  assert.deepEqual(res, { clientSecret: 'pi_1_secret', stripeAccount: 'acct_1' });
  const [, params, opts] = named(calls, 'pi.create')[0];
  assert.deepEqual([params.amount, params.currency, params.application_fee_amount], [910, 'gbp', 60]);
  assert.deepEqual(opts, { stripeAccount: 'acct_1', idempotencyKey: 'order-o1-pi' });
});

test('checkout: reloading re-uses the same PaymentIntent', async () => {
  const { payments, calls } = setup();
  await payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' });
  await payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' });
  assert.equal(named(calls, 'pi.create').length, 1);
});

test("checkout: someone else's order, an expired hold, a paid order or a restricted seller is refused", async () => {
  const { payments, data } = setup();
  await assert.rejects(payments.createPaymentSession({ userId: 'intruder', orderId: 'o1' }), { status: 404 });
  data.orders.o1.holdExpiresAt = '2026-10-20T11:59:00Z';
  await assert.rejects(payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' }), /expired/);
  data.orders.o1.status = 'paid';
  await assert.rejects(payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' }), PaymentsError);
  const restricted = setup({ sellerStatus: 'restricted' });
  await assert.rejects(restricted.payments.createPaymentSession({ userId: 'buyer', orderId: 'o1' }), { status: 409 });
});

test('webhook: a forged signature is rejected', async () => {
  const { payments } = setup();
  await assert.rejects(payments.handleWebhook({ rawBody: '{}', signature: 't=1,v1=forged' }), { status: 400 });
});

test("webhook: payment_intent.succeeded records what actually reached the seller's balance", async () => {
  const { payments, calls } = setup();
  await webhook(payments, {
    id: 'evt_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    account: 'acct_1',
    data: {
      object: { id: 'pi_1', amount_received: 910, currency: 'gbp', latest_charge: 'ch_1', metadata: { orderId: 'o1' } },
    },
  });
  assert.equal(named(calls, 'charge.retrieve')[0][3].stripeAccount, 'acct_1');
  assert.deepEqual(named(calls, 'db.paid')[0].slice(1), ['o1', { paymentIntentId: 'pi_1', sellerNetPence: 816 }]);
});

test('webhook: a payment for the wrong amount is flagged, not marked paid', async () => {
  const { payments, calls } = setup();
  await webhook(payments, {
    id: 'evt_2',
    object: 'event',
    type: 'payment_intent.succeeded',
    account: 'acct_1',
    data: {
      object: { id: 'pi_1', amount_received: 100, currency: 'gbp', latest_charge: 'ch_1', metadata: { orderId: 'o1' } },
    },
  });
  assert.equal(named(calls, 'db.paid').length, 0);
  assert.equal(named(calls, 'db.flag').length, 1);
});

test('payouts setup: seller account where Stripe collects its fee from the seller, payouts held, created once', async () => {
  const { payments, calls, data } = setup();
  delete data.users.seller.stripeAccountId;
  const { url } = await payments.createConnectLink({ userId: 'seller', returnPath: '/sell/new?event=evt-1' });
  await payments.createConnectLink({ userId: 'seller' });
  assert.match(url, /connect\.stripe\.com/);
  const creates = named(calls, 'acct.create');
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0][1].defaults.responsibilities, { fees_collector: 'stripe', losses_collector: 'stripe' });
  assert.equal(creates[0][1].configuration.merchant.capabilities.card_payments.requested, true);
  const [, settings, opts] = named(calls, 'balanceSettings.update')[0];
  assert.equal(settings.payments.payouts.schedule.interval, 'manual');
  assert.equal(opts.stripeAccount, 'acct_1');
  assert.equal(named(calls, 'link.create')[0][1].return_url, 'https://example.test/#/sell/new?event=evt-1');
});

test('payouts setup: an off-site return path is ignored', async () => {
  const { payments, calls } = setup();
  await payments.createConnectLink({ userId: 'seller', returnPath: '//evil.example/steal' });
  assert.equal(named(calls, 'link.create')[0][1].return_url, 'https://example.test/#/account/payouts');
});

test('payouts setup: status maps to not_started / pending / complete', async () => {
  const none = setup();
  delete none.data.users.seller.stripeAccountId;
  assert.equal((await none.payments.getConnectStatus({ userId: 'seller' })).status, 'not_started');
  const pending = setup({ sellerStatus: 'restricted' });
  assert.equal((await pending.payments.getConnectStatus({ userId: 'seller' })).status, 'pending');
  assert.equal((await setup().payments.getConnectStatus({ userId: 'seller' })).status, 'complete');
});

test("release: pays out the seller's money from their own balance, exactly once", async () => {
  const { payments, calls } = setup();
  assert.equal((await payments.releasePayout({ payoutId: 'p1' })).status, 'released');
  const [, params, opts] = named(calls, 'payout.create')[0];
  assert.deepEqual([params.amount, params.currency], [816, 'gbp']);
  assert.deepEqual(opts, { stripeAccount: 'acct_1', idempotencyKey: 'payout-p1' });
});

test('release: not before the release time, never with an open report', async () => {
  const early = setup();
  early.data.payouts.p1.releaseAt = '2026-10-21T00:00:00Z';
  assert.equal((await early.payments.releasePayout({ payoutId: 'p1' })).status, 'held');
  const reported = setup();
  reported.data.payouts.p1.hasOpenReport = true;
  assert.equal((await reported.payments.releasePayout({ payoutId: 'p1' })).status, 'frozen');
  assert.equal(named([...early.calls, ...reported.calls], 'payout.create').length, 0);
});

test("release: waits (eligible, retried later) if the buyer's money hasn't settled yet", async () => {
  const { payments, calls } = setup({ availablePence: 500 });
  assert.equal((await payments.releasePayout({ payoutId: 'p1' })).status, 'eligible');
  assert.equal(named(calls, 'payout.create').length, 0);
  assert.equal(named(calls, 'db.eligible').length, 1);
});

test("refund: full refund on the seller's account, including our booking fee", async () => {
  const { payments, calls, data } = setup();
  data.orders.o1.paymentIntentId = 'pi_1';
  await payments.refundOrder({ orderId: 'o1' });
  const [, params, opts] = named(calls, 'refund.create')[0];
  assert.deepEqual(params, { payment_intent: 'pi_1', refund_application_fee: true });
  assert.equal(opts.stripeAccount, 'acct_1');
});

test('refund: refused once the seller has been paid out', async () => {
  const { payments, data } = setup();
  Object.assign(data.orders.o1, { paymentIntentId: 'pi_1', payoutReleased: true });
  await assert.rejects(payments.refundOrder({ orderId: 'o1' }), { status: 409 });
});
