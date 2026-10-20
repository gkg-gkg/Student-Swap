// Deterministic checks that sit next to the AI ones. "Date has passed" and "doesn't match the listing" are
// plain comparisons, so they run in code (cheap, explainable, can't be talked out of it); Claude is
// used for what code can't do: reading messy tickets and spotting signs of editing.
// Pure functions, unit-tested. Port to the backend as-is.
import { ticketSafety } from '../config/features.js';
import { londonYmd } from './time.js';

/**
 * What the AI reads off a ticket. Every field is nullable: the model must say "not found" rather than guess.
 * @typedef {object} ExtractedTicket
 * @property {string | null} eventName
 * @property {string | null} venue
 * @property {string | null} startsAt ISO UTC
 * @property {string | null} ticketType
 * @property {number | null} faceValuePence
 * @property {string | null} ticketRef printed reference / booking number, if any
 * @property {Record<string, number>} confidence per field, 0 to 1
 */

const STOP = new Set(['the', 'a', 'an', 'of', 'at', 'in', 'and', 'with', 'for', 'tickets', 'ticket', 'event']);

/** @param {string | null | undefined} s */
export const tokens = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/** Jaccard similarity of word sets, 0..1. @param {string | null | undefined} a @param {string | null | undefined} b */
export function similarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Best catalogue event for an extraction. Events are admin-curated, so a ticket for an event we don't
 * have returns null and the seller is offered "Request an event".
 * @param {ExtractedTicket} x @param {any[]} events @returns {{ event: any, score: number } | null}
 */
export function matchEvent(x, events) {
  let best = null;
  for (const e of events) {
    const title = similarity(x.eventName, e.title);
    const venue = x.venue ? similarity(x.venue, e.venue) : 0;
    const date = x.startsAt && londonYmd(x.startsAt) === londonYmd(e.startsAt) ? 1 : 0;
    // Title carries the match; venue and date confirm it.
    const score = 0.6 * title + 0.25 * venue + 0.15 * date;
    if (!best || score > best.score) best = { event: e, score };
  }
  return best && best.score >= ticketSafety.eventMatchMinScore ? best : null;
}

/** @param {string | null} name @param {any} event @returns {any | null} */
export function matchTier(name, event) {
  if (!name) return null;
  let best = null;
  for (const t of event.tiers) {
    const s = similarity(name, t.name);
    if (s > 0 && (!best || s > best.s)) best = { t, s };
  }
  return best ? best.t : null;
}

/**
 * Compare what the ticket says to what the seller is listing.
 * @typedef {{ code: 'details_mismatch' | 'date_passed' | 'looks_edited' | 'unreadable', severity: 'low' | 'medium' | 'high', message: string }} TicketFlag
 * @param {{ extracted: ExtractedTicket, event: any, tier?: any, now?: Date }} o @returns {TicketFlag[]}
 */
export function detectMismatch({ extracted: x, event, tier, now = new Date() }) {
  /** @type {TicketFlag[]} */ const flags = [];
  if (
    new Date(event.endsAt).getTime() <= now.getTime() ||
    (x.startsAt && new Date(x.startsAt).getTime() < now.getTime() - 6 * 3600000)
  ) {
    flags.push({ code: 'date_passed', severity: 'high', message: 'The date on this ticket has already passed.' });
  }
  if (x.eventName && similarity(x.eventName, event.title) < 0.34) {
    flags.push({
      code: 'details_mismatch',
      severity: 'high',
      message: `The ticket says "${x.eventName}", but the listing is for "${event.title}".`,
    });
  }
  if (x.venue && similarity(x.venue, event.venue) < 0.34) {
    flags.push({
      code: 'details_mismatch',
      severity: 'medium',
      message: `The ticket shows a different venue ("${x.venue}") from the event (${event.venue}).`,
    });
  }
  if (x.startsAt && londonYmd(x.startsAt) !== londonYmd(event.startsAt)) {
    flags.push({
      code: 'details_mismatch',
      severity: 'high',
      message: 'The date on the ticket is different from the event date.',
    });
  }
  if (tier && x.faceValuePence != null && x.faceValuePence !== tier.faceValuePence) {
    flags.push({
      code: 'details_mismatch',
      severity: 'medium',
      message: `The ticket shows an original price of £${(x.faceValuePence / 100).toFixed(2)}, but this ticket type is listed at £${(tier.faceValuePence / 100).toFixed(2)}.`,
    });
  }
  return flags;
}
