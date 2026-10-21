// Minimal profile endpoints, just enough for sign-in to work in live mode (src/auth/amplify.js calls GET /me).
// The rest of handoff step 1 (PATCH /me/profile, notification prefs) comes with that step.
import { USER_COLS, privateUser } from '../model.mjs';
import { roleOf } from '../http/auth.mjs';
import { badRequest } from '../http/errors.mjs';

const TONES = ['coral', 'blue', 'amber', 'mint', 'night'];

/** @type {import('../http/router.mjs').Route[]} */
export const meRoutes = [
  ['GET', '/me', 'user', async ({ user, claims }) => privateUser(user, roleOf(claims))],

  /** Finishes sign-up: 18+ confirmation, display name, avatar. `universityId` from the client is ignored on purpose. */
  [
    'POST',
    '/me/profile',
    'user',
    async ({ db, user, claims, body }) => {
      if (body.ageConfirmed !== true) throw badRequest('You must be 18 or over to use StudentSwap.');
      const name = String(body.displayName ?? '').trim();
      if (name.length < 2 || name.length > 30) throw badRequest('Display name must be 2 to 30 characters.');
      const tone = TONES.includes(body.avatar?.tone) ? body.avatar.tone : 'blue';
      const initials = String(body.avatar?.initials ?? '')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 2)
        .toUpperCase();
      await db.query(
        `update users set display_name = $2, avatar_tone = $3, avatar_initials = coalesce(nullif($4, ''), avatar_initials),
           profile_complete = true, age_confirmed_at = coalesce(age_confirmed_at, now()) where id = $1`,
        [user.id, name, tone, initials],
      );
      const fresh = await db.one(`select ${USER_COLS} from users u where u.id = $1`, [user.id]);
      return privateUser(fresh, roleOf(claims));
    },
  ],
];
