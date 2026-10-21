// One Lambda serves the whole API: API Gateway sends every request here and this table picks the handler.
// Each route declares who may call it: 'public', 'optional' (public, but knows the caller if signed in), 'user', 'admin'.
import { ApiError } from './errors.mjs';
import { callerFromEvent, ensureUser, roleOf, unauthenticated } from './auth.mjs';

/**
 * @typedef {object} Deps
 * @property {import('../db.mjs').Db} db
 * @property {import('../s3.mjs').Storage} storage
 * @property {() => Date} now
 * @property {{ requirePayouts: boolean }} config
 *
 * @typedef {Deps & {
 *   params: Record<string, string>, query: Record<string, string>, body: any,
 *   claims: import('./auth.mjs').Claims, user: any, viewer: { id: string, role: 'user' | 'admin' } | null,
 * }} Ctx
 * @typedef {[method: string, path: string, access: 'public' | 'optional' | 'user' | 'admin', handler: (ctx: Ctx) => Promise<any>]} Route
 */

/** "/events/:id/alert" -> regex with named groups. @param {string} path */
const compile = (path) => new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$');

/** @param {Route[]} routes @param {Deps} deps */
export function createRouter(routes, deps) {
  const table = routes.map(([method, path, access, handler]) => ({ method, re: compile(path), access, handler }));

  /** @param {any} event API Gateway HTTP API (payload v2) event */
  return async function handle(event) {
    const method = event.requestContext?.http?.method ?? 'GET';
    const path = event.rawPath ?? '/';
    try {
      const matches = table.filter((r) => r.re.test(path));
      const route = matches.find((r) => r.method === method);
      if (!route)
        throw matches.length ? new ApiError(405, 'Method not allowed.') : new ApiError(404, 'Not found.', 'not_found');

      const caller = callerFromEvent(event);
      if ((route.access === 'user' || route.access === 'admin') && !caller.claims) throw unauthenticated();
      if (route.access === 'admin' && !caller.claims?.groups.includes('admin'))
        throw new ApiError(403, 'Admins only.', 'forbidden');

      const claims = /** @type {import('./auth.mjs').Claims} */ (caller.claims);
      const user = claims ? await ensureUser(deps.db.query, claims) : null;
      const result = await route.handler({
        ...deps,
        params: Object.fromEntries(
          Object.entries(route.re.exec(path)?.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]),
        ),
        query: event.queryStringParameters ?? {},
        body: parseBody(event),
        claims,
        user,
        viewer: claims ? { id: claims.sub, role: roleOf(claims) } : null,
      });
      return json(200, result);
    } catch (err) {
      if (err instanceof ApiError) return json(err.status, { message: err.message, code: err.code });
      // Never leak internals. CloudWatch gets the detail.
      console.error(
        JSON.stringify({ msg: 'unhandled', method, path, error: err instanceof Error ? err.stack : String(err) }),
      );
      return json(500, { message: 'Something went wrong. Please try again.', code: 'internal' });
    }
  };
}

/** @param {any} event */
function parseBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new ApiError(400, 'The request body must be JSON.', 'bad_json');
  }
}

/** @param {number} statusCode @param {unknown} body */
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body ?? null),
});
