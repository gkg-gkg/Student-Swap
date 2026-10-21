// API Lambda entry point (API Gateway HTTP API, payload v2). All routes for handoff steps 2 and 3 plus GET /me.
import { createRouter } from './http/router.mjs';
import { meRoutes } from './routes/me.mjs';
import { eventRoutes } from './routes/events.mjs';
import { adminEventRoutes } from './routes/admin-events.mjs';
import { uploadRoutes } from './routes/uploads.mjs';
import { listingRoutes } from './routes/listings.mjs';
import { adminListingRoutes } from './routes/admin-listings.mjs';
import { dbFromEnv } from './db.mjs';
import { createS3Storage } from './s3.mjs';

// '/events/filters' is listed before '/events/:id' so it isn't read as an event id.
export const routes = [
  ...meRoutes,
  ...eventRoutes,
  ...adminEventRoutes,
  ...uploadRoutes,
  ...listingRoutes,
  ...adminListingRoutes,
];

/** @param {import('./http/router.mjs').Deps} deps */
export const createApi = (deps) => createRouter(routes, deps);

/** @type {ReturnType<typeof createApi> | null} */
let api = null;
/** @param {any} event */
export const handler = async (event) => {
  api ??= createApi({
    db: dbFromEnv(),
    storage: createS3Storage({ bucket: /** @type {string} */ (process.env.BUCKET) }),
    now: () => new Date(),
    config: { requirePayouts: process.env.REQUIRE_PAYOUTS !== 'false' },
  });
  return api(event);
};
