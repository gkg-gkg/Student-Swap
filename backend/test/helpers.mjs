// Test harness: a real Postgres (PGlite, in-process, no Docker or AWS), the real router, an in-memory bucket, and
// API Gateway-shaped events with the claims the authorizer would pass on.
import { PGlite } from '@electric-sql/pglite';
import { fromPglite } from '../src/db.mjs';
import { migrate } from '../db/migrate.mjs';
import { createApi } from '../src/api.mjs';

export const HOUR = 3600000;
export const DAY = 24 * HOUR;

export const STUDENT = { sub: 'sub-student', email: 'alex@bham.ac.uk', groups: [] };
export const OTHER = { sub: 'sub-other', email: 'sam@student.nottingham.ac.uk', groups: [] };
export const ADMIN = { sub: 'sub-admin', email: 'mod@warwick.ac.uk', groups: ['admin'] };

/** In-memory stand-in for the private S3 bucket. */
export function memoryStorage() {
  /** @type {Map<string, { bytes: Uint8Array, contentType?: string }>} */
  const objects = new Map();
  return {
    objects,
    /** @param {{ key: string, contentType: string, size: number }} o */
    presignPut: async ({ key, contentType, size }) =>
      `https://bucket.test/${key}?ct=${encodeURIComponent(contentType)}&len=${size}`,
    /** @param {{ key: string, fileName: string, expiresIn: number }} o */
    presignGet: async ({ key, expiresIn }) => `https://bucket.test/${key}?get=1&expires=${expiresIn}`,
    /** @param {string} key */
    async get(key) {
      const o = objects.get(key);
      if (!o) throw new Error('NoSuchKey');
      return { bytes: o.bytes, contentType: o.contentType };
    },
    /** @param {string} key */
    async remove(key) {
      objects.delete(key);
    },
    /** what the browser's PUT to the presigned URL does @param {string} key @param {Uint8Array} bytes */
    put(key, bytes) {
      objects.set(key, { bytes });
    },
  };
}

/** Fresh database + API. `now` is adjustable so time-based rules can be tested. */
export async function setup({ requirePayouts = false, now = new Date('2026-11-02T12:00:00Z') } = {}) {
  const lite = await PGlite.create();
  const db = fromPglite(lite);
  await migrate(db);
  const storage = memoryStorage();
  const clock = { now };
  const api = createApi({ db, storage, now: () => clock.now, config: { requirePayouts } });

  /**
   * @param {string} method @param {string} path
   * @param {{ as?: { sub: string, email: string, groups: string[] } | null, body?: unknown, query?: Record<string, string>, invalidToken?: boolean }} [o]
   */
  async function call(method, path, { as = null, body, query, invalidToken } = {}) {
    const res = await api({
      rawPath: path,
      requestContext: {
        http: { method },
        authorizer: {
          lambda: as
            ? { sub: as.sub, email: as.email, groups: as.groups.join(',') }
            : invalidToken
              ? { invalid: '1' }
              : {},
        },
      },
      queryStringParameters: query,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  }

  /** Creates an event as the admin and returns it. @param {Record<string, unknown>} [over] */
  async function createEvent(over = {}) {
    const res = await call('POST', '/admin/events', {
      as: ADMIN,
      body: {
        title: 'Freshers Foam Party',
        venueId: 'rosies-birmingham',
        venue: '',
        cityId: 'birmingham',
        type: 'club_night',
        startsAt: new Date(clock.now.getTime() + 3 * DAY).toISOString(),
        durationHours: 5,
        tiers: [
          { name: 'Early bird', faceValuePence: 800 },
          { name: 'General release', faceValuePence: 1200 },
        ],
        ...over,
      },
    });
    if (res.status !== 200) throw new Error(`createEvent failed: ${JSON.stringify(res.body)}`);
    return res.body;
  }

  /** Marks a user's Stripe onboarding done (the Stripe step will do this for real). @param {string} sub */
  const payoutsReady = (sub) => db.query(`update users set connect_status = 'complete' where id = $1`, [sub]);

  return { lite, db, storage, clock, call, createEvent, payoutsReady };
}
