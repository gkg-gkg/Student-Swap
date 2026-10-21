// Shared reads: events with their tiers and live stats, and listings "enriched" with event, tier and seller
// (the shape enrichListing in src/api/mock/helpers.js returns).
import { EVENT_COLS, LISTING_COLS, USER_COLS, eventRecord, eventSummary, listing, sellerSummary } from './model.mjs';
import { notFound } from './http/errors.mjs';

/**
 * Events matching `where` (SQL over alias `e`), each with tiers and stats from its active listings.
 * @param {import('./db.mjs').Query} query @param {string} where @param {unknown[]} params
 */
export async function loadEvents(query, where, params) {
  const rows = await query(`select ${EVENT_COLS} from events e where ${where}`, params);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [tiers, stats] = await Promise.all([
    query('select id, event_id, name, face_value_pence, position from ticket_tiers where event_id = any($1)', [ids]),
    query(
      `select event_id, sum(quantity)::int as available, min(price_pence)::int as lowest
         from listings where status = 'active' and event_id = any($1) group by event_id`,
      [ids],
    ),
  ]);
  const byEvent = new Map(stats.map((s) => [s.event_id, s]));
  return rows.map((r) => eventSummary(eventRecord(r, tiers), byEvent.get(r.id)));
}

/** @param {import('./db.mjs').Query} query @param {string} id */
export async function loadEvent(query, id) {
  const [e] = await loadEvents(query, 'e.id = $1', [id]);
  if (!e) throw notFound('Event');
  return e;
}

/**
 * @param {import('./db.mjs').Query} query
 * @param {any[]} rows listing rows selected with LISTING_COLS
 * @param {{ id: string, role: string } | null} viewer private fields for the seller and admins only
 */
export async function enrichListings(query, rows, viewer) {
  if (!rows.length) return [];
  const eventIds = [...new Set(rows.map((r) => r.event_id))];
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const [events, sellers] = await Promise.all([
    loadEvents(query, 'e.id = any($1)', [eventIds]),
    query(`select ${USER_COLS} from users u where u.id = any($1)`, [sellerIds]),
  ]);
  const ev = new Map(events.map((e) => [e.id, e]));
  const se = new Map(sellers.map((s) => [s.id, sellerSummary(s)]));
  return rows.map((r) => {
    const event = /** @type {any} */ (ev.get(r.event_id));
    return {
      ...listing(r, !!viewer && (viewer.role === 'admin' || viewer.id === r.seller_id)),
      event,
      tier: event?.tiers.find((/** @type {any} */ t) => t.id === r.tier_id) ?? null,
      seller: se.get(r.seller_id) ?? null,
    };
  });
}

/** @param {import('./db.mjs').Query} query @param {string} where over alias `l` @param {unknown[]} params @param {{ id: string, role: string } | null} viewer */
export async function loadListings(query, where, params, viewer) {
  const rows = await query(`select ${LISTING_COLS} from listings l where ${where}`, params);
  return enrichListings(query, rows, viewer);
}
