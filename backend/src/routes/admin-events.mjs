// Admin side of handoff step 2: the event-request queue and creating events (events are admin-curated only).
// Validation mirrors createEvent in src/api/admin.mock.js, plus checks the mock can skip (city, venue, type exist).
import { badRequest, notFound } from '../http/errors.mjs';
import { loadEvent } from '../queries.mjs';
import { newId } from '../ids.mjs';

const TYPES = ['club_night', 'ball', 'social', 'gig'];
const TONES = ['coral', 'blue', 'amber', 'mint', 'night'];
const HOUR = 3600000;

/** @type {import('../http/router.mjs').Route[]} */
export const adminEventRoutes = [
  [
    'GET',
    '/admin/event-requests',
    'admin',
    async ({ db }) => {
      const rows = await db.query(
        `select r.*, coalesce(u.display_name, 'Unknown') as requester
           from event_requests r left join users u on u.id = r.user_id
          where not r.dismissed order by r.created_at desc`,
      );
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        venue: r.venue,
        date: r.date,
        note: r.note ?? undefined,
        createdAt: new Date(r.created_at).toISOString(),
        requester: r.requester,
      }));
    },
  ],

  [
    'POST',
    '/admin/event-requests/:id/dismiss',
    'admin',
    async ({ db, params }) => {
      const rows = await db.query('update event_requests set dismissed = true where id = $1 returning id', [params.id]);
      if (!rows.length) throw notFound('Request');
      return { ok: true };
    },
  ],

  /** POST /admin/events -> EventRecord (the same object GET /events/:id returns as `event`). */
  [
    'POST',
    '/admin/events',
    'admin',
    async ({ db, user, body, now }) => {
      const title = String(body.title ?? '').trim();
      const cityId = String(body.cityId ?? '');
      if (!title) throw badRequest('Title and venue are required.');
      if (title.length > 120) throw badRequest('Keep the event name under 120 characters.');
      if (!TYPES.includes(body.type)) throw badRequest('Choose an event type.');
      if (!(await db.one('select 1 from cities where id = $1', [cityId]))) throw badRequest('Choose a city.');

      // A venue from our list (its name wins), or a free-text "Other venue".
      let venueName = String(body.venue ?? '').trim();
      let venueId = null;
      if (body.venueId) {
        const v = await db.one('select id, name, city_id from venues where id = $1', [body.venueId]);
        if (!v || v.city_id !== cityId) throw badRequest("That venue isn't in the chosen city.");
        venueId = v.id;
        venueName = v.name;
      }
      if (!venueName) throw badRequest('Title and venue are required.');

      const tiers = Array.isArray(body.tiers) ? body.tiers : [];
      if (
        !tiers.length ||
        tiers.length > 10 ||
        tiers.some(
          (/** @type {any} */ t) =>
            !String(t?.name ?? '').trim() || !Number.isInteger(t.faceValuePence) || t.faceValuePence < 100,
        )
      )
        throw badRequest('Add at least one ticket type with an original price of £1 or more.');

      const start = new Date(body.startsAt).getTime();
      if (Number.isNaN(start) || start < now().getTime()) throw badRequest('Choose a start time in the future.');
      const duration = Number(body.durationHours);
      if (!Number.isFinite(duration) || duration < 1 || duration > 24)
        throw badRequest('Duration must be 1 to 24 hours.');

      const universityIds = Array.isArray(body.universityIds) ? body.universityIds.map(String) : [];
      if (universityIds.length) {
        const known = await db.query('select id from universities where id = any($1)', [universityIds]);
        if (known.length !== new Set(universityIds).size) throw badRequest('Unknown university.');
      }

      const id = newId('evt');
      await db.tx(async (tx) => {
        const count = (await tx.one('select count(*)::int as n from events')).n;
        await tx.query(
          `insert into events (id, title, description, venue, venue_id, city_id, university_ids, type, starts_at,
             last_entry_at, ends_at, age_restriction, id_requirement, tone, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            id,
            title,
            String(body.description ?? '').trim() || 'More details coming soon.',
            venueName,
            venueId,
            cityId,
            universityIds,
            body.type,
            new Date(start).toISOString(),
            new Date(start + Math.min(2, duration - 1) * HOUR).toISOString(),
            new Date(start + duration * HOUR).toISOString(),
            String(body.ageRestriction ?? '').trim() || '18+',
            'Photo ID and student card may be checked on the door.',
            TONES[count % TONES.length],
            user.id,
          ],
        );
        for (const [i, t] of tiers.entries())
          await tx.query(
            'insert into ticket_tiers (id, event_id, name, face_value_pence, position) values ($1, $2, $3, $4, $5)',
            [`${id}-t${i + 1}`, id, String(t.name).trim(), t.faceValuePence, i],
          );
      });
      const {
        faceValuePence: _f,
        lowestPricePence: _l,
        ticketsAvailable: _t,
        sellingFast: _s,
        ...record
      } = await loadEvent(db.query, id);
      return record;
    },
  ],
];
