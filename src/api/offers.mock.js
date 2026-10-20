import { db, save, nextId, nowIso, addHours, currentUserRecord, setOfferStatus, notify, ApiError } from './mock/db.js';
import { mockCall } from './mock/util.js';
import { enrichListing, publicUserById } from './mock/helpers.js';
import { formatPence } from '../lib/money.js';
import { pricing } from '../config/pricing.js';

const OFFER_LIFETIME_HOURS = 24;

/** @param {any} o */
const enrichOffer = (o) => {
  const l = db.listings.find((x) => x.id === o.listingId);
  return {
    ...o,
    listing: l ? enrichListing(l) : null,
    buyer: publicUserById(o.buyerId),
    seller: publicUserById(o.sellerId),
  };
};

/** POST /offers @param {{ listingId: string, amountPence: number }} input */
export function createOffer({ listingId, amountPence }) {
  return mockCall(() => {
    const me = currentUserRecord();
    const l = db.listings.find((x) => x.id === listingId);
    if (!l || l.status !== 'active') throw new ApiError(409, 'This listing is no longer available.');
    if (l.sellerId === me.id) throw new ApiError(400, 'You cannot make an offer on your own listing.');
    if (!Number.isInteger(amountPence) || amountPence < 100)
      throw new ApiError(400, 'Offers must be at least £1 per ticket.');
    if (amountPence > l.pricePence)
      throw new ApiError(400, 'Offer cannot be higher than the listing price. Just buy it!', 'above_price');
    if (db.offers.some((o) => o.listingId === l.id && o.buyerId === me.id && o.status === 'open'))
      throw new ApiError(409, 'You already have an open offer on this listing.');
    const offer = {
      id: nextId('offer'),
      listingId: l.id,
      buyerId: me.id,
      sellerId: l.sellerId,
      amountPence,
      lastActor: /** @type {const} */ ('buyer'),
      status: /** @type {const} */ ('open'),
      createdAt: nowIso(),
      expiresAt: addHours(Date.now(), OFFER_LIFETIME_HOURS),
      checkoutDeadline: undefined,
      history: [{ actor: /** @type {const} */ ('buyer'), amountPence, at: nowIso() }],
    };
    db.offers.push(offer);
    notify(
      l.sellerId,
      'offer',
      'New offer on your listing',
      `${me.displayName} offered ${formatPence(amountPence, { exact: true })} per ticket.`,
      '#/account/offers',
    );
    save();
    return enrichOffer(offer);
  });
}

/** GET /me/offers @returns {Promise<{ made: any[], received: any[] }>} */
export function myOffers() {
  return mockCall(() => {
    const me = currentUserRecord();
    const sort = (/** @type {any} */ a, /** @type {any} */ b) => b.createdAt.localeCompare(a.createdAt);
    return {
      made: db.offers
        .filter((o) => o.buyerId === me.id)
        .sort(sort)
        .map(enrichOffer),
      received: db.offers
        .filter((o) => o.sellerId === me.id)
        .sort(sort)
        .map(enrichOffer),
    };
  });
}

/**
 * POST /offers/:id/respond
 * Seller: accept / decline / counter (counter must sit between the current offer and the listing price).
 * Buyer: accept / decline the seller's counter.
 * @param {string} id @param {{ action: 'accept' | 'decline' | 'counter', counterPence?: number }} input
 */
export function respondToOffer(id, { action, counterPence }) {
  return mockCall(() => {
    const me = currentUserRecord();
    const o = db.offers.find((x) => x.id === id);
    if (!o) throw new ApiError(404, 'Offer not found.', 'not_found');
    if (o.status !== 'open') throw new ApiError(409, 'This offer is no longer open.');
    const isSeller = o.sellerId === me.id;
    const isBuyer = o.buyerId === me.id;
    if (!isSeller && !isBuyer) throw new ApiError(403, 'Not your offer.', 'forbidden');
    const myTurn = (isSeller && o.lastActor === 'buyer') || (isBuyer && o.lastActor === 'seller');
    if (!myTurn) throw new ApiError(409, 'Waiting for the other person to respond.');
    const l = db.listings.find((x) => x.id === o.listingId);
    const other = isSeller ? o.buyerId : o.sellerId;

    if (action === 'decline') {
      setOfferStatus(o, 'declined');
      notify(other, 'offer', 'Offer declined', `${me.displayName} declined the offer.`, '#/account/offers');
    } else if (action === 'accept') {
      if (!l || l.status !== 'active') throw new ApiError(409, 'This listing is no longer available.');
      setOfferStatus(o, 'accepted');
      o.checkoutDeadline = addHours(Date.now(), pricing.offerCheckoutWindowHours);
      notify(
        other,
        'offer',
        isSeller ? 'Your offer was accepted' : 'Counter-offer accepted',
        `Complete checkout within ${pricing.offerCheckoutWindowHours} hours to secure the tickets.`,
        '#/account/offers',
      );
    } else if (action === 'counter') {
      if (!isSeller) throw new ApiError(400, 'Only the seller can counter.');
      if (
        !l ||
        !Number.isInteger(counterPence) ||
        /** @type {number} */ (counterPence) <= o.amountPence ||
        /** @type {number} */ (counterPence) > l.pricePence
      ) {
        throw new ApiError(
          400,
          `Counter must be above the offer and no more than the listing price (${l ? formatPence(l.pricePence, { exact: true }) : ''}).`,
        );
      }
      o.amountPence = /** @type {number} */ (counterPence);
      o.lastActor = 'seller';
      o.expiresAt = addHours(Date.now(), OFFER_LIFETIME_HOURS);
      o.history.push({ actor: 'seller', amountPence: o.amountPence, at: nowIso() });
      notify(
        other,
        'offer',
        'You have a counter-offer',
        `${me.displayName} countered at ${formatPence(o.amountPence, { exact: true })} per ticket.`,
        '#/account/offers',
      );
    } else {
      throw new ApiError(400, 'Unknown action.');
    }
    save();
    return enrichOffer(o);
  });
}
