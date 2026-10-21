// Cognito post-confirmation trigger: creates the StudentSwap users row once the student has proved their email.
// The university comes from the verified email domain. GET /me creates the row too if this ever failed.
import { dbFromEnv } from '../db.mjs';
import { ensureUser } from '../http/auth.mjs';

/** @param {any} event Cognito PostConfirmation event */
export const handler = async (event) => {
  // Also fires after "forgot password"; only a new sign-up needs a row.
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;
  const attrs = event.request?.userAttributes ?? {};
  await ensureUser(dbFromEnv().query, { sub: attrs.sub, email: String(attrs.email ?? '').toLowerCase(), groups: [] });
  return event;
};
