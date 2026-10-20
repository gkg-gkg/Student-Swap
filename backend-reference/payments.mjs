// REFERENCE IMPLEMENTATION: StudentSwap's Stripe money flow, independent of where it's hosted.
//
// Model: "direct charges" with Stripe collecting its fees from the SELLER (fees_collector: 'stripe'), so the
// platform pays no Connect fees (no £2/month per seller, no payout fees). The buyer's payment lands in the seller's
// Stripe balance; our booking fee comes to us as the `application_fee_amount`. Payouts on seller accounts are set to
// MANUAL, so the money stays put until 24h after the event (and only if no problem was reported), then we pay it out.
// Stripe allows a manual hold of at most 90 days, which is why listings open 85 days before an event
// (pricing.maxListingLeadDays in the frontend).
//
//   POST /payments/session   { orderId }        -> { clientSecret, stripeAccount }   createPaymentSession
//   POST /me/connect-link    { returnPath? }    -> { url }                           createConnectLink
//   GET  /me/connect-status                     -> { status }                        getConnectStatus
//   POST /stripe/webhook     (raw body)         -> { received: true }                handleWebhook
//   scheduled job                               -> releasePayout(payoutId)
//   admin "refund buyer"                        -> refundOrder(orderId)
//
// Sellers are Accounts v2 with the `merchant` configuration and the Express dashboard (Stripe requires Accounts v2
// for new Connect platforms). The webhook must be a CONNECT endpoint ("events on connected accounts"), because the
// payments happen on the sellers' accounts.
//
// Everything that touches your database goes through `db` (see the Db typedef), so this file plugs into Supabase,
// AWS, a MySQL database on Krystal, or anything else. The secret key lives on the server only.

/**
 * @typedef {{ id: string, buyerId: string, sellerId: string, status: string, totalPence: number, buyerFeePence: number,
 *   holdExpiresAt: string, paymentIntentId?: string | null, payoutReleased?: boolean }} Order
 * @typedef {{ id: string, email: string, displayName: string, stripeAccountId?: string | null }} User
 * @typedef {{ id: string, orderId: string, sellerId: string, amountPence: number, status: 'held' | 'eligible' | 'released' | 'frozen',
 *   releaseAt: string, hasOpenReport: boolean }} Payout
 *
 * @typedef {object} Db Implement these against your database. The mark* calls must be idempotent (webhooks repeat).
 * @property {(orderId: string) => Promise<Order | null>} getOrder
 * @property {(orderId: string, paymentIntentId: string) => Promise<void>} setOrderPaymentIntent
 * @property {(orderId: string, p: { paymentIntentId: string, sellerNetPence: number }) => Promise<void>} markOrderPaid
 *   One transaction: order paid (delivered if PDF), listing sold, payout row `held` for sellerNetPence (what actually
 *   reached the seller's balance after Stripe's card fee and our booking fee), releaseAt = event end + 24h.
 * @property {(orderId: string, refundId: string) => Promise<void>} markOrderRefunded
 * @property {(orderId: string, reason: string) => Promise<void>} flagOrder  For a human to look at (e.g. amount mismatch).
 * @property {(userId: string) => Promise<User | null>} getUser
 * @property {(userId: string, accountId: string) => Promise<void>} setUserStripeAccount
 * @property {(payoutId: string) => Promise<Payout | null>} getPayout
 * @property {(payoutId: string, stripePayoutId: string) => Promise<void>} markPayoutReleased
 * @property {(payoutId: string) => Promise<void>} markPayoutEligible  Due, but funds or the seller's bank aren't ready yet; retry.
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
  return {
    /** Buyer's checkout: one PaymentIntent per order, on the SELLER's account, amount taken from OUR database. */
    async createPaymentSession({ userId, orderId }) {
      const order = await db.getOrder(orderId);
      if (!order || order.buyerId !== userId) throw new PaymentsError(404, 'Order not found.');
      if (order.status !== 'pending_payment') throw new PaymentsError(409, 'This order is no longer awaiting payment.');
      if (new Date(order.holdExpiresAt) <= now()) throw new PaymentsError(409, 'Your hold has expired.');
      const seller = await db.getUser(order.sellerId);
      // Listings can't go live before payouts are set up, so this only fails if Stripe later restricted the seller.
      if (!seller?.stripeAccountId || !(await sellerReady(seller.stripeAccountId)))
        throw new PaymentsError(409, "This seller can't take payments right now. Please choose another ticket.");
      const stripeAccount = seller.stripeAccountId;

      if (order.paymentIntentId) {
        const existing = await stripe.paymentIntents.retrieve(order.paymentIntentId, {}, { stripeAccount });
        if (existing.status !== 'canceled') return { clientSecret: existing.client_secret, stripeAccount };
      }
      const intent = await stripe.paymentIntents.create(
        {
          amount: order.totalPence,
          currency: 'gbp',
          application_fee_amount: order.buyerFeePence, // our booking fee; Stripe takes its card fee from the seller
          automatic_payment_methods: { enabled: true }, // cards, Apple Pay, Google Pay as enabled in the Dashboard
          metadata: { orderId: order.id },
          description: `StudentSwap order ${order.id}`,
        },
        { stripeAccount, idempotencyKey: `order-${order.id}-pi` },
      );
      await db.setOrderPaymentIntent(order.id, intent.id);
      return { clientSecret: intent.client_secret, stripeAccount };
    },

    /**
     * Seller's "Set up payouts": creates their Stripe account once (Stripe charges them its card fee; payouts held
     * until we release them), then a one-time onboarding link. returnPath: where in the site to come back to.
     */
    async createConnectLink({ userId, returnPath = '/account/payouts' }) {
      const user = await db.getUser(userId);
      if (!user) throw new PaymentsError(404, 'Account not found.');
      // Only same-site paths, so the link can't bounce sellers somewhere else after Stripe.
      const path = /^\/(?!\/)[\w\-/?=&.]*$/.test(returnPath) ? returnPath : '/account/payouts';
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
              // Stripe bills the seller its card fee directly and charges the platform no Connect fees.
              responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
            },
            configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
            metadata: { userId: user.id },
          },
          { idempotencyKey: `user-${user.id}-account` },
        );
        accountId = account.id;
        // Hold every payout until we release it after the event (Stripe allows up to 90 days).
        await stripe.balanceSettings.update(
          { payments: { payouts: { schedule: { interval: 'manual' } } } },
          { stripeAccount: accountId },
        );
        await db.setUserStripeAccount(user.id, accountId);
      }
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        collection_options: { fields: 'currently_due' }, // only what's needed now: quicker for students
        refresh_url: `${siteUrl}#${path}${path.includes('?') ? '&' : '?'}refresh=1`, // link expired or reopened
        return_url: `${siteUrl}#${path}`,
      });
      return { url: link.url };
    },

    /** not_started | pending | complete, read live from Stripe. Listing is allowed only when complete. */
    async getConnectStatus({ userId }) {
      const user = await db.getUser(userId);
      if (!user?.stripeAccountId) return { status: 'not_started' };
      return { status: (await sellerReady(user.stripeAccountId)) ? 'complete' : 'pending' };
    },

    /** Stripe's Connect webhook. Pass the RAW request body (not parsed JSON) or the signature check fails. */
    async handleWebhook({ rawBody, signature }) {
      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch {
        throw new PaymentsError(400, 'Invalid signature.');
      }
      const obj = event.data.object;
      const stripeAccount = event.account; // the seller's account the payment happened on
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
          // What actually reached the seller: payment minus Stripe's real card fee and our booking fee.
          const charge = await stripe.charges.retrieve(
            obj.latest_charge,
            { expand: ['balance_transaction'] },
            { stripeAccount },
          );
          // On the seller's account, `net` already has both Stripe's fee and our application fee taken off.
          const sellerNetPence = charge.balance_transaction.net;
          await db.markOrderPaid(order.id, { paymentIntentId: obj.id, sellerNetPence });
          break;
        }
        case 'charge.refunded': {
          const intent =
            obj.payment_intent && (await stripe.paymentIntents.retrieve(obj.payment_intent, {}, { stripeAccount }));
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

    /** Scheduled job: pay the seller once the event is over, nobody reported a problem, and their funds have settled. */
    async releasePayout({ payoutId }) {
      const payout = await db.getPayout(payoutId);
      if (!payout) throw new PaymentsError(404, 'Payout not found.');
      if (payout.status === 'released') return { status: 'released' };
      if (payout.status === 'frozen' || payout.hasOpenReport) return { status: 'frozen' };
      if (new Date(payout.releaseAt) > now()) return { status: 'held' };

      const seller = await db.getUser(payout.sellerId);
      const stripeAccount = seller?.stripeAccountId;
      // Card funds take a few days to settle; a ticket bought the day before the event may not be available yet.
      const balance = stripeAccount && (await stripe.balance.retrieve({}, { stripeAccount }));
      const available = balance?.available?.find((/** @type {any} */ b) => b.currency === 'gbp')?.amount ?? 0;
      if (!stripeAccount || available < payout.amountPence) {
        await db.markPayoutEligible(payout.id); // the job tries again later
        return { status: 'eligible' };
      }
      const sent = await stripe.payouts.create(
        { amount: payout.amountPence, currency: 'gbp', metadata: { payoutId: payout.id, orderId: payout.orderId } },
        { stripeAccount, idempotencyKey: `payout-${payout.id}` },
      );
      await db.markPayoutReleased(payout.id, sent.id);
      return { status: 'released', stripePayoutId: sent.id };
    },

    /** Admin refunds a reported order in full (booking fee too). Only possible before the seller has been paid out. */
    async refundOrder({ orderId }) {
      const order = await db.getOrder(orderId);
      if (!order?.paymentIntentId) throw new PaymentsError(404, 'Paid order not found.');
      if (order.payoutReleased) throw new PaymentsError(409, 'The seller has already been paid out.');
      const seller = await db.getUser(order.sellerId);
      const refund = await stripe.refunds.create(
        { payment_intent: order.paymentIntentId, refund_application_fee: true }, // our booking fee goes back too
        { stripeAccount: seller?.stripeAccountId, idempotencyKey: `order-${order.id}-refund` },
      );
      await db.markOrderRefunded(order.id, refund.id);
      return { refundId: refund.id };
    },
  };

  /** A seller is ready when Stripe lets them take card payments and be paid out. @param {string} accountId */
  async function sellerReady(accountId) {
    const account = await stripe.v2.core.accounts.retrieve(accountId, { include: ['configuration.merchant'] });
    const caps = account.configuration?.merchant?.capabilities;
    return caps?.card_payments?.status === 'active' && caps?.stripe_balance?.payouts?.status === 'active';
  }
}
