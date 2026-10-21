// Handoff step 2: the admin-curated event catalogue. Behaviour mirrors src/api/events.mock.js and users.mock.js.
import { londonYmd, londonWeekday } from '../../../src/lib/time.js';
import { loadEvent, loadEvents, loadListings } from '../queries.mjs';
import { USER_COLS, sellerSummary } from '../model.mjs';
import { badRequest, notFound } from '../http/errors.mjs';
import { newId } from '../ids.mjs';

/** @type {Record<string, (a: any, b: any) => number>} */
const SORTS = {
  soonest: (a, b) => a.startsAt.localeCompare(b.startsAt),
  price_low: (a, b) => (a.lowestPricePence || 1e9) - (b.lowestPricePence || 1e9),
  price_high: (a, b) => b.lowestPricePence - a.lowestPricePence,
  most_tickets: (a, b) => b.ticketsAvailable - a.ticketsAvailable,
};

/** @type {import('../http/router.mjs').Route[]} */
export const eventRoutes = [
  /** GET /events: upcoming events. Day filters are compared in Europe/London, like the mock. */
  [
    'GET',
    '/events',
    'public',
    async ({ db, query: q, now }) => {
      const at = now();
      const today = londonYmd(at);
      let list = await loadEvents(db.query, 'e.ends_at > $1', [at.toISOString()]);
      if (q.q) {
        const needle = q.q.toLowerCase();
        list = list.filter((e) => `${e.title} ${e.venue}`.toLowerCase().includes(needle));
      }
      if (q.when === 'tonight') list = list.filter((e) => londonYmd(e.startsAt) === today);
      if (q.when === 'weekend') {
        const horizon = at.getTime() + 8 * 86400000;
        list = list.filter(
          (e) => [5, 6, 0].includes(londonWeekday(e.startsAt)) && new Date(e.startsAt).getTime() < horizon,
        );
      }
      if (q.when === 'date') {
        if (q.from) list = list.filter((e) => londonYmd(e.startsAt) >= q.from);
        if (q.to) list = list.filter((e) => londonYmd(e.startsAt) <= q.to);
      }
      if (q.cityId) list = list.filter((e) => e.cityId === q.cityId);
      if (q.uniId) list = list.filter((e) => e.universityIds.includes(q.uniId));
      if (q.venue) list = list.filter((e) => e.venue === q.venue);
      if (q.type) list = list.filter((e) => e.type === q.type);
      const maxPrice = Number(q.maxPricePence);
      if (maxPrice > 0) list = list.filter((e) => e.lowestPricePence > 0 && e.lowestPricePence <= maxPrice);
      return list.sort(SORTS[q.sort] ?? SORTS.soonest);
    },
  ],

  [
    'GET',
    '/events/filters',
    'public',
    async ({ db, now }) => {
      const rows = await db.query('select distinct venue from events where ends_at > $1 order by venue', [
        now().toISOString(),
      ]);
      return { venues: rows.map((r) => r.venue) };
    },
  ],

  /** GET /events/:id -> { event, listings (active), alertOn }. Signed-in callers also learn whether their alert is on. */
  [
    'GET',
    '/events/:id',
    'optional',
    async ({ db, params, viewer }) => {
      const event = await loadEvent(db.query, params.id);
      const listings = await loadListings(
        db.query,
        `l.event_id = $1 and l.status = 'active' order by l.price_pence, l.created_at`,
        [params.id],
        viewer,
      );
      const alertOn =
        !!viewer &&
        !!(await db.one('select 1 from event_alerts where user_id = $1 and event_id = $2', [viewer.id, params.id]));
      return { event, listings, alertOn };
    },
  ],

  /** PUT /events/:id/alert { on }. Sending the alerts (email + in-app) arrives with notifications in step 5. */
  [
    'PUT',
    '/events/:id/alert',
    'user',
    async ({ db, params, user, body }) => {
      if (!(await db.one('select 1 from events where id = $1', [params.id]))) throw notFound('Event');
      const on = body.on === true;
      if (on)
        await db.query('insert into event_alerts (user_id, event_id) values ($1, $2) on conflict do nothing', [
          user.id,
          params.id,
        ]);
      else await db.query('delete from event_alerts where user_id = $1 and event_id = $2', [user.id, params.id]);
      return { alertOn: on };
    },
  ],

  /** POST /event-requests: a seller can't find their event, so it goes to the admin queue. */
  [
    'POST',
    '/event-requests',
    'user',
    async ({ db, user, body }) => {
      const name = String(body.name ?? '').trim();
      const venue = String(body.venue ?? '').trim();
      const date = String(body.date ?? '').trim();
      if (!name || !venue || !date) throw badRequest('Name, venue and date are required.');
      if (name.length > 120 || venue.length > 120 || String(body.note ?? '').length > 1000)
        throw badRequest('That request is too long.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Enter the date as YYYY-MM-DD.');
      await db.query(
        'insert into event_requests (id, user_id, name, venue, date, note) values ($1, $2, $3, $4, $5, $6)',
        [newId('req'), user.id, name, venue, date, String(body.note ?? '').trim() || null],
      );
      return { ok: true };
    },
  ],

  /** GET /sellers/:id: public profile with active listings. Never exposes the email. */
  [
    'GET',
    '/sellers/:id',
    'optional',
    async ({ db, params, viewer }) => {
      const row = await db.one(`select ${USER_COLS} from users u where u.id = $1 and u.profile_complete`, [params.id]);
      if (!row) throw notFound('Seller');
      const listings = await loadListings(
        db.query,
        `l.seller_id = $1 and l.status = 'active' order by l.created_at desc`,
        [params.id],
        viewer,
      );
      return { seller: sellerSummary(row), listings };
    },
  ],
];
