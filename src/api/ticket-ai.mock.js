// MOCK of the two AI endpoints. In production Claude does this work on the backend
// (see backend-reference/ and docs/BACKEND_HANDOFF.md). Here it is simulated with local heuristics so
// the whole UI can be exercised without an API key:
//   - file names steer the demo: "blank"/"unreadable" fails extraction, "edited" flags tampering,
//     "mismatch" flags wrong details, "cosmic" reads an event that isn't in our catalogue
//   - pasted emails are parsed with simple "Event: ... Venue: ... Date: ..." patterns
import { db } from './mock/db.js';
import { mockCall } from './mock/util.js';
import { detectMismatch, tokens } from '../lib/ticket-match.js';

/** @typedef {import('../lib/ticket-match.js').ExtractedTicket} ExtractedTicket */
/** @typedef {import('../lib/ticket-match.js').TicketFlag} TicketFlag */

const upcoming = () => db.events.filter((e) => new Date(e.endsAt).getTime() > Date.now());
const hash = (/** @type {string} */ s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** @param {any} e @param {string} seed @param {number} [conf] @returns {ExtractedTicket} */
function readFromEvent(e, seed, conf = 0.92) {
  const wanted = /fast|vip|premium/i.test(seed) ? e.tiers.at(-1) : e.tiers[0];
  return {
    eventName: e.title,
    venue: e.venue,
    startsAt: e.startsAt,
    ticketType: wanted.name,
    faceValuePence: wanted.faceValuePence,
    ticketRef: `DEMO${hash(seed).toString(36).toUpperCase().padEnd(6, '0')}`,
    confidence: {
      eventName: conf,
      venue: conf - 0.04,
      startsAt: conf - 0.02,
      ticketType: 0.72,
      faceValuePence: 0.8,
      ticketRef: 0.6,
    },
  };
}

/** @param {string} text @returns {ExtractedTicket | null} */
function readFromText(text) {
  const grab = (/** @type {RegExp} */ re) => text.match(re)?.[1]?.trim() ?? null;
  const eventName = grab(/(?:event|show)\s*[:-]\s*(.+)/i);
  const venue = grab(/venue\s*[:-]\s*(.+)/i);
  const dateRaw = grab(/(?:date|when)(?:\s*&\s*time)?\s*[:-]\s*(.+)/i);
  const type = grab(/(?:ticket(?:\s*type)?|type)\s*[:-]\s*(.+)/i);
  const price = grab(/(?:price|total|face value)\s*[:-]?\s*£\s*([\d.]+)/i);
  const parsed = dateRaw ? Date.parse(dateRaw) : NaN;
  if (eventName || venue) {
    return {
      eventName,
      venue,
      startsAt: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
      ticketType: type,
      faceValuePence: price ? Math.round(parseFloat(price) * 100) : null,
      ticketRef: grab(/(?:order|booking|reference|ref)\s*(?:no\.?|number|#)?\s*[:-]\s*([A-Z0-9-]{5,})/i),
      confidence: {
        eventName: 0.85,
        venue: venue ? 0.8 : 0,
        startsAt: parsed ? 0.7 : 0,
        ticketType: type ? 0.7 : 0,
        faceValuePence: price ? 0.8 : 0,
        ticketRef: 0.6,
      },
    };
  }
  // No labels: look for a catalogue event whose title words all appear in the email.
  const bag = new Set(tokens(text));
  const hit = upcoming().find((e) => tokens(e.title).every((t) => bag.has(t)));
  return hit ? readFromEvent(hit, text, 0.8) : null;
}

/** @param {{ fileName?: string, text?: string }} input @returns {{ ok: true, extracted: ExtractedTicket } | { ok: false, reason: string, message: string }} */
function extractSync({ fileName = '', text }) {
  if (text !== undefined) {
    const x = readFromText(text);
    return x
      ? { ok: true, extracted: x }
      : { ok: false, reason: 'unreadable', message: "We couldn't find ticket details in that text." };
  }
  const name = fileName.toLowerCase();
  if (/blank|unreadable|corrupt|fail/.test(name))
    return { ok: false, reason: 'unreadable', message: "We couldn't read that file clearly." };
  if (/cosmic|unknown/.test(name)) {
    return {
      ok: true,
      extracted: {
        eventName: 'Cosmic Carnival',
        venue: 'Elsewhere Hall',
        startsAt: new Date(Date.now() + 9 * 86400000).toISOString(),
        ticketType: 'General entry',
        faceValuePence: 1400,
        ticketRef: 'DEMOCOS001',
        confidence: {
          eventName: 0.9,
          venue: 0.88,
          startsAt: 0.9,
          ticketType: 0.8,
          faceValuePence: 0.85,
          ticketRef: 0.6,
        },
      },
    };
  }
  const events = upcoming();
  const nameTokens = new Set(tokens(name.replace(/\.[a-z]+$/, '')));
  const byName = events.find((e) => tokens(e.title).some((t) => nameTokens.has(t)));
  const e = byName ?? events[hash(name) % events.length];
  return { ok: true, extracted: readFromEvent(e, name, byName ? 0.93 : 0.78) };
}

/**
 * POST /ai/extract-ticket. Input: a private file key (or file name in mock) OR pasted email text.
 * @param {{ fileKey?: string, fileName?: string, text?: string }} input
 * @returns {Promise<{ ok: true, extracted: ExtractedTicket } | { ok: false, reason: string, message: string }>}
 */
export function extractTicket({ fileKey, fileName, text }) {
  return mockCall(() => extractSync({ fileName: fileName ?? (fileKey ? db.files[fileKey]?.name : '') ?? '', text }), {
    ms: 1700,
  });
}

/**
 * Server-side check used when a listing is created (also exposed as POST /ai/verify-ticket).
 * The AI may only FLAG; it can never approve. A pass still goes through the normal rules.
 * @param {{ fileName?: string, text?: string, event: any, tier?: any, extracted?: ExtractedTicket }} o
 * @returns {{ verdict: 'pass' | 'flag', flags: TicketFlag[] }}
 */
export function verifySync({ fileName = '', event, tier, extracted }) {
  const name = fileName.toLowerCase();
  /** @type {TicketFlag[]} */ const flags = [];
  // Compare details only when we actually have a reading (the seller used autofill). The real backend always reads
  // the ticket with Claude here; the mock can't read pixels, so for plain uploads it relies on the file-name hints below.
  if (extracted) flags.push(...detectMismatch({ extracted, event, tier }));
  if (/mismatch/.test(name))
    flags.push({
      code: 'details_mismatch',
      severity: 'high',
      message: 'The name and date on the ticket do not match this event.',
    });
  if (/edited|photoshop|tamper/.test(name))
    flags.push({
      code: 'looks_edited',
      severity: 'high',
      message: 'Parts of the ticket look edited: the text near the barcode has inconsistent fonts and spacing.',
    });
  const unique = flags.filter((f, i) => flags.findIndex((g) => g.code === f.code && g.message === f.message) === i);
  return { verdict: unique.length ? 'flag' : 'pass', flags: unique };
}

/** POST /ai/verify-ticket @param {{ fileKey?: string, text?: string, eventId: string, tierId?: string }} input */
export function verifyTicket({ fileKey, text, eventId, tierId }) {
  return mockCall(
    () => {
      const event = db.events.find((e) => e.id === eventId);
      if (!event) throw new Error('Unknown event');
      return verifySync({
        fileName: fileKey ? db.files[fileKey]?.name : '',
        text,
        event,
        tier: event.tiers.find((/** @type {any} */ t) => t.id === tierId),
      });
    },
    { ms: 900 },
  );
}
