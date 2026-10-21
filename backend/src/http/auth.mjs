// Who is calling. API Gateway runs src/auth/authorizer.mjs first; it verifies the Cognito ID token (when there is one)
// and passes the claims through as `requestContext.authorizer.lambda`. Routes then decide what they need.
import { USER_COLS } from '../model.mjs';
import { universityForEmail } from '../../../src/lib/university.js';
import { ApiError } from './errors.mjs';

/**
 * @typedef {{ sub: string, email: string, groups: string[] }} Claims
 * @typedef {{ claims: Claims | null, invalidToken: boolean }} Caller
 */

/** @param {any} event API Gateway HTTP API (payload v2) event @returns {Caller} */
export function callerFromEvent(event) {
  const ctx = event?.requestContext?.authorizer?.lambda ?? {};
  if (!ctx.sub) return { claims: null, invalidToken: ctx.invalid === '1' };
  return {
    claims: {
      sub: ctx.sub,
      email: String(ctx.email ?? '').toLowerCase(),
      groups: String(ctx.groups ?? '')
        .split(',')
        .filter(Boolean),
    },
    invalidToken: false,
  };
}

export const roleOf = (/** @type {Claims} */ c) => (c.groups.includes('admin') ? 'admin' : 'user');

export const unauthenticated = () => new ApiError(401, 'Please sign in.', 'unauthenticated');

/**
 * The caller's users row. Normally created by the post-confirmation trigger; created here as a fallback (e.g. a user
 * confirmed before the trigger was deployed), with the university derived from the VERIFIED email, never the client.
 * @param {import('../db.mjs').Query} query @param {Claims} claims
 */
export async function ensureUser(query, claims) {
  const existing = (await query(`select ${USER_COLS} from users u where u.id = $1`, [claims.sub]))[0];
  if (existing) return existing;
  await query(
    `insert into users (id, email, university_id, avatar_initials) values ($1, $2, $3, $4) on conflict (id) do nothing`,
    [claims.sub, claims.email, universityForEmail(claims.email)?.id ?? null, initialsFromEmail(claims.email)],
  );
  return (await query(`select ${USER_COLS} from users u where u.id = $1`, [claims.sub]))[0];
}

/** "alex.demo@bham.ac.uk" -> "AD". @param {string} email */
export function initialsFromEmail(email) {
  const parts = email
    .split('@')[0]
    .split(/[^a-z]+/i)
    .filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
}
