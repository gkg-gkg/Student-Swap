import { db, save, nextId, nowIso, currentUserRecord, getSessionUserId, ApiError } from './mock/db.js';
import { mockCall } from './mock/util.js';
import { eventSummary, findEvent, enrichListing } from './mock/helpers.js';
import { londonYmd, londonWeekday } from '../lib/time.js';

/** @typedef {import('../types/index.js').AppEvent} AppEvent */
/**
 * @typedef {object} EventQuery
 * @property {string} [q] text search (title, venue)
 * @property {'tonight' | 'weekend' | 'date'} [when]
 * @property {string} [from] YYYY-MM-DD (with when=date)
 * @property {string} [to] YYYY-MM-DD
 * @property {string} [cityId]
 * @property {string} [uniId]
 * @property {string} [venue]
 * @property {string} [type]
 * @property {number} [maxPricePence]
 * @property {'soonest' | 'price_low' | 'price_high' | 'most_tickets'} [sort]
 */

const upcoming = (/** @type {any} */ e) => new Date(e.endsAt).getTime() > Date.now();

/** GET /events @param {EventQuery} [q] @returns {Promise<AppEvent[]>} */
export function listEvents(q = {}) {
  return mockCall(() => {
    const now = new Date();
    const today = londonYmd(now);
    let list = db.events.filter(upcoming).map(eventSummary);
    if (q.q) {
      const needle = q.q.toLowerCase();
      list = list.filter((e) => `${e.title} ${e.venue}`.toLowerCase().includes(needle));
    }
    if (q.when === 'tonight') list = list.filter((e) => londonYmd(e.startsAt) === today);
    if (q.when === 'weekend') {
      const horizon = now.getTime() + 8 * 86400000;
      list = list.filter(
        (e) => [5, 6, 0].includes(londonWeekday(e.startsAt)) && new Date(e.startsAt).getTime() < horizon,
      );
    }
    if (q.when === 'date') {
      if (q.from) list = list.filter((e) => londonYmd(e.startsAt) >= /** @type {string} */ (q.from));
      if (q.to) list = list.filter((e) => londonYmd(e.startsAt) <= /** @type {string} */ (q.to));
    }
    if (q.cityId) list = list.filter((e) => e.cityId === q.cityId);
    if (q.uniId) list = list.filter((e) => e.universityIds.includes(/** @type {string} */ (q.uniId)));
    if (q.venue) list = list.filter((e) => e.venue === q.venue);
    if (q.type) list = list.filter((e) => e.type === q.type);
    if (q.maxPricePence)
      list = list.filter(
        (e) => e.lowestPricePence > 0 && e.lowestPricePence <= /** @type {number} */ (q.maxPricePence),
      );
    /** @type {Record<string, (a: AppEvent, b: AppEvent) => number>} */
    const sorts = {
      soonest: (a, b) => a.startsAt.localeCompare(b.startsAt),
      price_low: (a, b) => (a.lowestPricePence || 1e9) - (b.lowestPricePence || 1e9),
      price_high: (a, b) => b.lowestPricePence - a.lowestPricePence,
      most_tickets: (a, b) => b.ticketsAvailable - a.ticketsAvailable,
    };
    return list.sort(sorts[q.sort ?? 'soonest']);
  });
}

/** GET /events/filters @returns {Promise<{ venues: string[] }>} */
export function getFilterOptions() {
  return mockCall(() => ({ venues: [...new Set(db.events.filter(upcoming).map((e) => e.venue))].sort() }), { ms: 100 });
}

/** GET /events/:id @param {string} id */
export function getEvent(id) {
  return mockCall(() => {
    const event = eventSummary(findEvent(id));
    const listings = db.listings.filter((l) => l.eventId === id && l.status === 'active').map(enrichListing);
    const uid = getSessionUserId();
    const alertOn = !!uid && db.alerts.some((a) => a.userId === uid && a.eventId === id);
    return { event, listings, alertOn };
  });
}

/** PUT /events/:id/alert @param {string} eventId @param {boolean} on */
export function setAlert(eventId, on) {
  return mockCall(() => {
    const u = currentUserRecord();
    findEvent(eventId);
    db.alerts = db.alerts.filter((a) => !(a.userId === u.id && a.eventId === eventId));
    if (on) db.alerts.push({ userId: u.id, eventId });
    save();
    return { alertOn: on };
  });
}

/** POST /event-requests @param {{ name: string, venue: string, date: string, note?: string }} input */
export function requestEvent(input) {
  return mockCall(() => {
    const u = currentUserRecord();
    if (!input.name?.trim() || !input.venue?.trim() || !input.date)
      throw new ApiError(400, 'Name, venue and date are required.');
    db.eventRequests.push({ id: nextId('listing'), userId: u.id, ...input, createdAt: nowIso() });
    save();
    return { ok: true };
  });
}
