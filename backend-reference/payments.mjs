// REFERENCE IMPLEMENTATION: StudentSwap's Stripe money flow, independent of where it's hosted.
//
// Model: "separate charges and transfers" with Connect. The buyer pays the PLATFORM; we hold the money; 24h after
// the event (and only if no problem was reported) we TRANSFER the seller's share to their connected account.
// Card holds are not used for escrow: they expire after about 7 days and events can be weeks away.
//
//   POST /payments/session   { orderId }   -> { clientSecret }          createPaymentSession
//   POST /me/connect-link                  -> { url }                  createConnectLink
//   GET  /me/connect-status                -> { status }               getConnectStatus
//   POST /stripe/webhook     (raw body)    -> { received: true }       handleWebhook
//   scheduled job                          -> releasePayout(payoutId)
//   admin "refund buyer"                   -> refundOrder(orderId)
//
// Sellers are Accounts v2 "recipients" (Stripe now requires v2 for new Connect platforms) with the Express
// dashboard. v1 endpoints (account links, transfers) accept their ids.
//
// Everything that touches your database goes through `db` (see the Db typedef), so this file plugs into Supabase,
// AWS or anything else. The secret key lives on the server only; the browser never sees it.

/**
 * @typedef {{ id: string, buyerId: string, status: string, totalPence: number, holdExpiresAt: string,
 *   paymentIntentId?: string | null, payoutReleased?: boolean }} Order
 * @typedef {{ id: string, email: string, displayName: string, stripeAccountId?: string | null }} User
 * @typedef {{ id: string, orderId: string, sellerId: string, amountPence: number, status: 'held' | 'eligible' | 'released' | 'frozen',
 *   releaseAt: string, chargeId: string, hasOpenReport: boolean }} Payout
 *
 * @typedef {object} Db Implement these against your database. The mark* calls must be idempotent (webhooks repeat).
 * @property {(orderId: string) => Promise<Order | null>} getOrder
 * @property {(orderId: string, paymentIntentId: string) => Promise<void>} setOrderPaymentIntent
 * @property {(orderId: string, p: { paymentIntentId: string, chargeId: string }) => Promise<void>} markOrderPaid
 *   One transaction: order paid (delivered if PDF), listing sold, payout row `held` with releaseAt = event end + 24h.
 * @property {(orderId: string, refundId: string) => Promise<void>} markOrderRefunded
 * @property {(orderId: string, reason: string) => Promise<void>} flagOrder  For a human to look at (e.g. amount mismatch).
 * @property {(userId: string) => Promise<User | null>} getUser
 * @property {(userId: string, accountId: string) => Promise<void>} setUserStripeAccount
 * @property {(payoutId: string) => Promise<Payout | null>} getPayout
 * @property {(payoutId: string, transferId: string) => Promise<void>} markPayoutReleased
 * @property {(payoutId: string) => Promise<void>} markPayoutEligible  Due, but the seller hasn't finished onboarding.
 */

export class PaymentsError extends Error {
  /** @param {number} status HTTP status to return @param {string} message Safe to show the user */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {{ stripe: any, db: Db, siteUrl: string, webhookSecret?: string, now?: () => Date }} deps
 *   siteUrl: where the site lives, e.g. https://studentswap.co.uk/ (Stripe sends sellers back here after onboarding).
 */
export function createPayments({ stripe, db, siteUrl, webhookSecret, now = () => new Date() }) {
  const payoutsPage = (/** @type {string} */ flag) => `${siteUrl}#/account/payouts?${flag}=1`;

  return {
    /** Buyer's checkout: one PaymentIntent per order (re-used if they reload), amount taken from OUR database. */
    async createPaymentSession({ userId, orderId }) {
      const order = await db.getOrder(orderId);
      if (!order || order.buyerId !== userId) throw new PaymentsError(404, 'Order not found.');
      if (order.status !== 'pending_payment') throw new PaymentsError(409, 'This order is no longer awaiting payment.');
      if (new Date(order.holdExpiresAt) <= now()) throw new PaymentsError(409, 'Your hold has expired.');

      if (order.paymentIntentId) {
        const existing = await stripe.paymentIntents.retrieve(order.paymentIntentId);
        if (existing.status !== 'canceled') return { clientSecret: existing.client_secret };
      }
      const intent = await stripe.paymentIntents.create(
        {
          amount: order.totalPence,
          currency: 'gbp',
          automatic_payment_methods: { enabled: true }, // cards, Apple Pay, Google Pay as enabled in the Dashboard
          transfer_group: `order_${order.id}`, // links the later transfer to the seller
          metadata: { orderId: order.id },
          description: `StudentSwap order ${order.id}`,
        },
        { idempotencyKey: `order-${order.id}-pi` },
      );
      await db.setOrderPaymentIntent(order.id, intent.id);
      return { clientSecret: intent.client_secret };
    },

    /** Seller's "Set up payouts": creates their recipient account once, then a one-time Stripe onboarding link. */
    async createConnectLink({ userId }) {
      const user = await db.getUser(userId);
      if (!user) throw new PaymentsError(404, 'Account not found.');
      let accountId = user.stripeAccountId;
      if (!accountId) {
        const account = await stripe.v2.core.accounts.create(
          {
            contact_email: user.email,
            display_name: user.displayName,
            dashboard: 'express',
            identity: { country: 'gb' },
            defaults: {
              currency: 'gbp',
              // We collect fees and cover losses (refunds, disputes), as the platform holding the money.
              responsibilities: { fees_collector: 'application', losses_collector: 'application' },
            },
            configuration: {
              recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
            },
            metadata: { userId: user.id },
          },
          { idempotencyKey: `user-${user.id}-account` },
        );
        accountId = account.id;
        await db.setUserStripeAccount(user.id, accountId);
      }
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        collection_options: { fields: 'currently_due' }, // only what's needed now: quicker for students
        refresh_url: payoutsPage('refresh'), // link expired or was opened twice: the page asks for a new one
        return_url: payoutsPage('onboarded'),
      });
      return { url: link.url };
    },

    /** not_started | pending | complete, read live from Stripe (no webhook needed). */
    async getConnectStatus({ userId }) {
      const user = await db.getUser(userId);
      if (!user?.stripeAccountId) return { status: 'not_started' };
      return { status: (await transfersActive(user.stripeAccountId)) ? 'complete' : 'pending' };
    },

    /** Stripe's webhook. Pass the RAW request body (not parsed JSON) or the signature check fails. */
    async handleWebhook({ rawBody, signature }) {
      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch {
        throw new PaymentsError(400, 'Invalid signature.');
      }
      const obj = event.data.object;
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const orderId = obj.metadata?.orderId;
          const order = orderId ? await db.getOrder(orderId) : null;
          if (!order) break;
          // Defence in depth: never mark an order paid for a different amount than we asked for.
          if (obj.amount_received !== order.totalPence || obj.currency !== 'gbp') {
            await db.flagOrder(
              order.id,
              `Paid ${obj.amount_received} ${obj.currency}, expected ${order.totalPence} gbp`,
            );
            break;
          }
          await db.markOrderPaid(order.id, { paymentIntentId: obj.id, chargeId: obj.latest_charge });
          break;
        }
        case 'charge.refunded': {
          const intent = obj.payment_intent && (await stripe.paymentIntents.retrieve(obj.payment_intent));
          const orderId = intent?.metadata?.orderId;
          if (orderId) await db.markOrderRefunded(orderId, obj.refunds?.data?.[0]?.id ?? obj.id);
          break;
        }
        // payment_intent.payment_failed: nothing to do; the buyer retries until their hold lapses.
        default:
          break;
      }
      return { received: true };
    },

    /** Scheduled job: pay the seller once the event is over, nobody reported a problem, and they're onboarded. */
    async releasePayout({ payoutId }) {
      const payout = await db.getPayout(payoutId);
      if (!payout) throw new PaymentsError(404, 'Payout not found.');
      if (payout.status === 'released') return { status: 'released' };
      if (payout.status === 'frozen' || payout.hasOpenReport) return { status: 'frozen' };
      if (new Date(payout.releaseAt) > now()) return { status: 'held' };

      const seller = await db.getUser(payout.sellerId);
      if (!seller?.stripeAccountId || !(await transfersActive(seller.stripeAccountId))) {
        await db.markPayoutEligible(payout.id); // released later, once they finish onboarding
        return { status: 'eligible' };
      }
      const transfer = await stripe.transfers.create(
        {
          amount: payout.amountPence,
          currency: 'gbp',
          destination: seller.stripeAccountId,
          source_transaction: payout.chargeId, // waits for the buyer's funds to settle instead of failing
          transfer_group: `order_${payout.orderId}`,
          metadata: { payoutId: payout.id, orderId: payout.orderId },
        },
        { idempotencyKey: `payout-${payout.id}` },
      );
      await db.markPayoutReleased(payout.id, transfer.id);
      return { status: 'released', transferId: transfer.id };
    },

    /** Admin refunds a reported order. Only possible before the seller has been paid (reports freeze payouts). */
    async refundOrder({ orderId }) {
      const order = await db.getOrder(orderId);
      if (!order?.paymentIntentId) throw new PaymentsError(404, 'Paid order not found.');
      if (order.payoutReleased)
        throw new PaymentsError(409, 'The seller has already been paid; reverse the transfer first.');
      const refund = await stripe.refunds.create(
        { payment_intent: order.paymentIntentId },
        { idempotencyKey: `order-${order.id}-refund` },
      );
      await db.markOrderRefunded(order.id, refund.id);
      return { refundId: refund.id };
    },
  };

  /** @param {string} accountId */
  async function transfersActive(accountId) {
    const account = await stripe.v2.core.accounts.retrieve(accountId, { include: ['configuration.recipient'] });
    return account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === 'active';
  }
}
