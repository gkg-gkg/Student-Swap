// Shared mock helpers: derive live market stats and attach related records.
import { db, sellerSummary, ApiError, getSessionUserId } from './db.js';

/** Event + live stats from active listings. @param {any} e @returns {import('../../types/index.js').AppEvent} */
export function eventSummary(e) {
  const active = db.listings.filter((l) => l.eventId === e.id && l.status === 'active');
  const available = active.reduce((n, l) => n + l.quantity, 0);
  const lowest = active.length ? Math.min(...active.map((l) => l.pricePence)) : 0;
  const soldRecently = db.orders.some(
    (o) => o.eventId === e.id && o.paidAt && Date.now() - new Date(o.paidAt).getTime() < 48 * 3600000,
  );
  return {
    ...e,
    faceValuePence: Math.min(...e.tiers.map((/** @type {any} */ t) => t.faceValuePence)),
    lowestPricePence: lowest,
    ticketsAvailable: available,
    sellingFast: available > 0 && (available <= 6 || soldRecently),
  };
}

/** @param {string} id */
export function findEvent(id) {
  const e = db.events.find((x) => x.id === id);
  if (!e) throw new ApiError(404, 'Event not found.', 'not_found');
  return e;
}

/** Listing with its event, tier and public seller info. @param {any} l */
export function enrichListing(l) {
  const e = findEvent(l.eventId);
  const seller = db.users.find((u) => u.id === l.sellerId);
  return {
    ...l,
    event: eventSummary(e),
    tier: e.tiers.find((/** @type {any} */ t) => t.id === l.tierId),
    seller: seller ? sellerSummary(seller) : null,
  };
}

/** @param {string} id */
export const publicUserById = (id) => {
  const u = db.users.find((x) => x.id === id);
  return u ? sellerSummary(u) : null;
};

export const signedInUserId = () => getSessionUserId();
