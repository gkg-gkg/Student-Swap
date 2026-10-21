// Cognito pre-sign-up trigger (handoff §3, REQUIRED). The website already rejects non-university emails, but anyone
// can call Cognito directly, so this is what actually makes "verified students only" true. The allowlist is the same
// data the site uses (src/data/regions.js emailDomains, student subdomains allowed).
import { isAllowedEmail } from '../../../src/lib/university.js';

/** @param {any} event Cognito PreSignUp event */
export const handler = async (event) => {
  const email = String(event.request?.userAttributes?.email ?? '');
  // Surfaces in the browser as UserLambdaValidationException, which src/auth/amplify.js shows as this sentence.
  if (!isAllowedEmail(email)) throw new Error('Use your university email address.');
  // Do NOT auto-confirm: the emailed code is the proof that the student owns the mailbox.
  return event;
};
