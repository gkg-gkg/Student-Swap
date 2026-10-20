// Email-domain allowlist, derived from data/regions.js. Frontend check only:
// the Cognito pre-sign-up Lambda MUST enforce the same rule (see docs/BACKEND_HANDOFF.md).
import { universities } from '../data/regions.js';

/** @param {string} email @returns {import('../types/index.js').University | undefined} */
export function universityForEmail(email) {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return undefined;
  // Exact domain, or a student subdomain of it (e.g. student.bham.ac.uk).
  return universities.find((u) => u.emailDomains.some((d) => domain === d || domain.endsWith('.' + d)));
}

export const isAllowedEmail = (/** @type {string} */ email) => universityForEmail(email) !== undefined;
