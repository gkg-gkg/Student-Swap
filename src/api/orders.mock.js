import {
  db,
  save,
  nextId,
  nowIso,
  addHours,
  currentUserRecord,
  getSessionUserId,
  setOrderStatus,
  setListingStatus,
  setOfferStatus,
  notify,
  ApiError,
  HOLD_SECONDS,
} from './mock/db.js';
import { mockCall } from './mock/util.js';
import { enrichListing, eventSummary, findEvent, publicUserById } from './mock/helpers.js';
import { buyerTotal, sellerPayout } from '../lib/fees.js';
import { pricing } from '../config/pricing.js';

/** @param {any} o */
function enrichOrder(o) {
  const l = db.listings.find((x) => x.id === o.listingId);
  const e = findEvent(o.eventId);
  const payout = db.payouts.find((p) => p.orderId === o.id) ?? null;
  const report = o.reportId ? (db.reports.find((r) => r.id === o.reportId) ?? null) : null;
  return {
    ...o,
    listing: l ? enrichListing(l) : null,
    event: eventSummary(e),
    tier: e.tiers.find((/** @type {any} */ t) => t.id === l?.tierId),
    seller: publicUserById(o.sellerId),
    buyer: publicUserById(o.buyerId),
    payout,
    report,
  };
}

/** @param {string} id @param {boolean} [asSeller] */
function loadOrder(id, asSeller = false) {
  const me = currentUserRecord();
  const o = db.orders.find((x) => x.id === id);
  if (!o) throw new ApiError(404, 'Order not found.', 'not_found');
  const allowed = asSeller ? o.sellerId === me.id : o.buyerId === me.id || o.sellerId === me.id || me.role === 'admin';
  if (!allowed) throw new ApiError(404, 'Order not found.', 'not_found');
  return o;
}

/**
 * POST /orders: reserves the listing and starts the checkout hold.
 * @param {{ listingId: string, offerId?: string }} input
 */
export function createOrder({ listingId, offerId }) {
  return mockCall(() => {
    const me = currentUserRecord();
    const l = db.listings.find((x) => x.id === listingId);
    if (!l) throw new ApiError(404, 'Listing not found.', 'not_found');
    if (l.sellerId === me.id) throw new ApiError(400, 'You cannot buy your own tickets.');
    // Re-entering checkout: reuse the buyer's live hold on this listing.
    const mine = db.orders.find((o) => o.listingId === l.id && o.buyerId === me.id && o.status === 'pending_payment');
    if (mine) return enrichOrder(mine);
    if (l.status !== 'active') throw new ApiError(409, 'Sorry, these tickets were just taken.', 'unavailable');

    let unit = l.pricePence;
    if (offerId) {
      const of = db.offers.find((x) => x.id === offerId);
      if (!of || of.buyerId !== me.id || of.listingId !== l.id || of.status !== 'accepted')
        throw new ApiError(409, 'That offer is no longer valid.');
      unit = of.amountPence;
    }
    const event = findEvent(l.eventId);
    const { buyerFee, total } = buyerTotal(unit * l.quantity);
    const order = {
      id: nextId('order'),
      listingId: l.id,
      eventId: l.eventId,
      buyerId: me.id,
      sellerId: l.sellerId,
      quantity: l.quantity,
      unitPence: unit,
      buyerFeePence: buyerFee,
      totalPence: total,
      status: /** @type {any} */ ('pending_payment'),
      delivery: l.delivery,
      transferPlatform: l.transferPlatform,
      createdAt: nowIso(),
      holdExpiresAt: new Date(Date.now() + HOLD_SECONDS * 1000).toISOString(),
      payoutReleaseAt: addHours(event.endsAt, pricing.payoutReleaseHoursAfterEvent),
    };
    db.orders.push(order);
    setListingStatus(l, 'reserved');
    save();
    return enrichOrder(order);
  });
}

/** GET /orders/:id @param {string} id */
export const getOrder = (id) => mockCall(() => enrichOrder(loadOrder(id)));

/** GET /me/orders (purchases) */
export function myOrders() {
  return mockCall(() => {
    const me = currentUserRecord();
    return db.orders
      .filter((o) => o.buyerId === me.id && o.status !== 'cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(enrichOrder);
  });
}

/** GET /me/sales */
export function mySales() {
  return mockCall(() => {
    const me = currentUserRecord();
    return db.orders
      .filter((o) => o.sellerId === me.id && o.status !== 'cancelled' && o.status !== 'pending_payment')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(enrichOrder);
  });
}

/**
 * POST /orders/:id/pay. In production this is driven by the Stripe webhook, not the browser.
 * @param {string} id @param {{ paymentRef: string }} _input
 */
export function payOrder(id, _input) {
  return mockCall(() => {
    const o = loadOrder(id);
    if (o.buyerId !== currentUserRecord().id) throw new ApiError(403, 'Not your order.', 'forbidden');
    if (o.status !== 'pending_payment') throw new ApiError(409, 'This order is not awaiting payment.');
    if (o.holdExpiresAt && new Date(o.holdExpiresAt).getTime() <= Date.now())
      throw new ApiError(410, 'Your checkout hold expired.', 'hold_expired');
    const l = db.listings.find((x) => x.id === o.listingId);
    if (!l) throw new ApiError(404, 'Listing not found.');
    setOrderStatus(o, 'paid');
    o.paidAt = nowIso();
    delete o.holdExpiresAt;
    setListingStatus(l, 'sold');
    // Anyone else's pending offers on these tickets can no longer be fulfilled.
    for (const other of db.offers.filter(
      (x) => x.listingId === l.id && x.buyerId !== o.buyerId && ['open', 'accepted'].includes(x.status),
    )) {
      setOfferStatus(other, 'expired');
      notify(
        other.buyerId,
        'offer',
        'Tickets sold',
        `The tickets you made an offer on for ${findEvent(l.eventId).title} were bought by someone else.`,
        '#/browse',
      );
    }
    const { sellerFee, payout } = sellerPayout(o.unitPence * o.quantity);
    db.payouts.push({
      id: nextId('payout'),
      orderId: o.id,
      sellerId: o.sellerId,
      grossPence: o.unitPence * o.quantity,
      sellerFeePence: sellerFee,
      amountPence: payout,
      status: 'held',
      releaseAt: o.payoutReleaseAt,
      releasedAt: undefined,
    });
    // PDF tickets are already with us: deliver straight away. Transfers wait for the seller.
    if (o.delivery === 'pdf') {
      setOrderStatus(o, 'delivered');
      o.deliveredAt = nowIso();
    }
    const accepted = db.offers.find((x) => x.listingId === l.id && x.buyerId === o.buyerId && x.status === 'accepted');
    if (accepted) accepted.checkoutDeadline = undefined;
    notify(
      o.sellerId,
      'order',
      'Your tickets sold',
      o.delivery === 'transfer'
        ? 'Transfer them to the buyer to complete the sale.'
        : 'Payment is held until after the event.',
      '#/account/payouts',
    );
    save();
    return enrichOrder(o);
  });
}

/** POST /orders/:id/cancel (buyer leaves checkout) @param {string} id */
export function cancelOrder(id) {
  return mockCall(() => {
    const o = loadOrder(id);
    if (o.status !== 'pending_payment') return enrichOrder(o);
    setOrderStatus(o, 'cancelled');
    const l = db.listings.find((x) => x.id === o.listingId);
    if (l && l.status === 'reserved') setListingStatus(l, 'active');
    save();
    return enrichOrder(o);
  });
}

/** POST /orders/:id/mark-transferred (seller confirms a native transfer was sent) @param {string} id */
export function markTransferred(id) {
  return mockCall(() => {
    const o = loadOrder(id, true);
    if (o.status !== 'paid') throw new ApiError(409, 'Nothing to transfer yet.');
    setOrderStatus(o, 'delivered');
    o.deliveredAt = nowIso();
    notify(
      o.buyerId,
      'order',
      'Your tickets were transferred',
      `Check your ${o.transferPlatform ?? 'ticketing'} account or email.`,
      '#/account/tickets',
    );
    save();
    return enrichOrder(o);
  });
}

/** POST /orders/:id/download-url: presigned, short-lived. Never a public link. @param {string} id */
export function getTicketDownload(id) {
  return mockCall(() => {
    const o = loadOrder(id);
    if (o.buyerId !== getSessionUserId()) throw new ApiError(403, 'Only the buyer can download.', 'forbidden');
    if (!['delivered', 'completed', 'reported'].includes(o.status) || o.delivery !== 'pdf')
      throw new ApiError(409, 'No downloadable ticket for this order.');
    const body = `MOCK TICKET\nOrder ${o.id}\nThis stands in for a presigned S3 URL (expires in 60s).\n`;
    return {
      url: `data:text/plain;charset=utf-8,${encodeURIComponent(body)}`,
      fileName: `ticket-${o.id}.txt`,
      expiresInSeconds: 60,
    };
  });
}
