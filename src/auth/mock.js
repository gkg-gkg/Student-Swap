// Mock AuthProvider. Same method names and error codes as Cognito via Amplify Auth,
// so swapping in src/auth/amplify.js changes nothing in the pages.
import { db, save, nextId, nowIso, getSessionUserId, setSessionUserId, privateUser } from '../api/mock/db.js';
import { delay } from '../api/mock/util.js';
import { universityForEmail } from '../lib/university.js';
import { AuthError } from './errors.js';

/** Fixed code so the demo is easy to run. Real Cognito emails a random 6-digit code. */
export const MOCK_CODE = '123456';

const find = (/** @type {string} */ email) =>
  db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

/** @param {string} pw */
export const passwordProblem = (pw) =>
  pw.length < 8
    ? 'Use at least 8 characters.'
    : !/[A-Za-z]/.test(pw) || !/\d/.test(pw)
      ? 'Include a letter and a number.'
      : null;

/** @type {Map<string, string>} email -> password awaiting confirmation (for autoSignIn) */
const pendingPasswords = new Map();

export const mockAuth = {
  /** @param {{ email: string, password: string }} input */
  async signUp({ email, password }) {
    await delay(500);
    const uni = universityForEmail(email);
    if (!uni) throw new AuthError('InvalidEmailDomain', 'Use your university email address.');
    const problem = passwordProblem(password);
    if (problem) throw new AuthError('InvalidPasswordException', problem);
    const existing = find(email);
    if (existing?.confirmed)
      throw new AuthError('UsernameExistsException', 'An account with this email already exists. Try signing in.');
    if (!existing) {
      db.users.push({
        id: nextId('user'),
        email: email.trim().toLowerCase(),
        password,
        confirmed: false,
        displayName: '',
        universityId: uni.id,
        avatar: { tone: 'blue', initials: '?' },
        role: 'user',
        createdAt: nowIso(),
        profileComplete: false,
        connectStatus: 'not_started', // set up payouts with Stripe before the first listing
        ageConfirmed: false,
        ratingAvg: 0,
        ratingCount: 0,
        completedSales: 0,
        notificationPrefs: { offers: true, orders: true, alerts: true, marketing: false },
      });
      save();
    }
    pendingPasswords.set(email.trim().toLowerCase(), password);
    return { nextStep: 'CONFIRM_SIGN_UP' };
  },

  /** @param {{ email: string }} input */
  async resendSignUpCode({ email }) {
    await delay(400);
    if (!find(email)) throw new AuthError('UserNotFoundException', 'No account for that email.');
    return { ok: true };
  },

  /** Confirms the emailed code, then signs in (Amplify's autoSignIn). @param {{ email: string, code: string }} input */
  async confirmSignUp({ email, code }) {
    await delay(500);
    const u = find(email);
    if (!u) throw new AuthError('UserNotFoundException', 'No account for that email.');
    if (code !== MOCK_CODE)
      throw new AuthError('CodeMismatchException', 'That code is not right. Check your email and try again.');
    u.confirmed = true;
    save();
    setSessionUserId(u.id);
    pendingPasswords.delete(email.trim().toLowerCase());
    return { isSignedIn: true };
  },

  /** @param {{ email: string, password: string }} input */
  async signIn({ email, password }) {
    await delay(500);
    const u = find(email);
    if (!u || u.password !== password) throw new AuthError('NotAuthorizedException', 'Incorrect email or password.');
    if (!u.confirmed) throw new AuthError('UserNotConfirmedException', 'Confirm your email first.');
    setSessionUserId(u.id);
    return { isSignedIn: true };
  },

  async signOut() {
    setSessionUserId(null);
  },

  /** @param {{ email: string }} input */
  async forgotPassword({ email }) {
    await delay(500);
    // Real Cognito also answers generically for unknown emails, to avoid revealing who has an account.
    void find(email);
    return { nextStep: 'CONFIRM_RESET_PASSWORD' };
  },

  /** @param {{ email: string, code: string, newPassword: string }} input */
  async confirmResetPassword({ email, code, newPassword }) {
    await delay(500);
    const problem = passwordProblem(newPassword);
    if (problem) throw new AuthError('InvalidPasswordException', problem);
    const u = find(email);
    if (!u || code !== MOCK_CODE) throw new AuthError('CodeMismatchException', 'That code is not right.');
    u.password = newPassword;
    save();
    return { ok: true };
  },

  /** @returns {Promise<import('../types/index.js').User | null>} */
  async getCurrentUser() {
    const id = getSessionUserId();
    const u = id ? db.users.find((x) => x.id === id) : null;
    return u ? privateUser(u) : null;
  },

  /** The JWT sent as `Authorization: Bearer`. Mock: the user id. @returns {Promise<string | null>} */
  async getIdToken() {
    return getSessionUserId();
  },
};
