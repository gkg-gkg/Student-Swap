// Real AuthProvider: Amazon Cognito via AWS Amplify Auth (v6). Same interface as mock.js.
//
// Setup (see README "Going live"):
//   1. Create a Cognito user pool (email as username, email verification by code) and an app client WITHOUT a secret.
//   2. Add the PRE-SIGN-UP Lambda trigger that enforces the university email allowlist (docs/BACKEND_HANDOFF.md §3).
//      The check in this file's callers (universityForEmail) is UX only: anyone can call Cognito directly.
//   3. Set COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID in src/config/env.js, USE_MOCKS = false, then
//      `npm run build` (bundles Amplify into public/vendor/amplify-auth.js, self-hosted).
import { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID } from '../config/env.js';
import { request } from '../api/http.js';
import { AuthError } from './errors.js';

/** @type {Promise<any> | null} */
let lib = null;
/** Lazy-load the self-hosted Amplify bundle so mock mode never downloads it. */
function amplify() {
  // The path is a variable on purpose: the bundle only exists after `npm run build`, so it can't be resolved statically.
  const bundle = '/public/vendor/amplify-auth.js';
  lib ??= import(bundle).then((m) => {
    m.configure({ userPoolId: COGNITO_USER_POOL_ID, userPoolClientId: COGNITO_CLIENT_ID });
    return m;
  });
  return lib;
}

/** Amplify throws errors whose `name` is the Cognito exception. Re-throw them in our shape. @param {unknown} err */
function wrap(err) {
  const e = /** @type {{ name?: string, message?: string }} */ (err);
  throw new AuthError(e.name ?? 'UnknownError', friendly(e.name, e.message));
}
/** @param {string | undefined} name @param {string | undefined} fallback */
function friendly(name, fallback) {
  const map = /** @type {Record<string, string>} */ ({
    UsernameExistsException: 'An account with this email already exists. Try signing in.',
    CodeMismatchException: 'That code is not right. Check your email and try again.',
    ExpiredCodeException: 'That code has expired. Request a new one.',
    NotAuthorizedException: 'Incorrect email or password.',
    UserNotConfirmedException: 'Confirm your email first.',
    InvalidPasswordException: 'Use at least 8 characters, with a letter and a number.',
    LimitExceededException: 'Too many attempts. Please wait a moment and try again.',
    UserLambdaValidationException: 'Use your university email address.', // thrown by the pre-sign-up trigger
  });
  return map[name ?? ''] ?? fallback ?? 'Something went wrong. Please try again.';
}

export const amplifyAuth = {
  /** @param {{ email: string, password: string }} input */
  async signUp({ email, password }) {
    const a = await amplify();
    try {
      const r = await a.signUp({ username: email, password, options: { userAttributes: { email }, autoSignIn: true } });
      return { nextStep: r.nextStep?.signUpStep ?? 'CONFIRM_SIGN_UP' };
    } catch (e) {
      return wrap(e);
    }
  },
  /** @param {{ email: string }} input */
  async resendSignUpCode({ email }) {
    const a = await amplify();
    try {
      await a.resendSignUpCode({ username: email });
      return { ok: true };
    } catch (e) {
      return wrap(e);
    }
  },
  /** Confirms the emailed code, then signs in via Amplify's autoSignIn. @param {{ email: string, code: string }} input */
  async confirmSignUp({ email, code }) {
    const a = await amplify();
    try {
      await a.confirmSignUp({ username: email, confirmationCode: code });
      await a.autoSignIn();
      return { isSignedIn: true };
    } catch (e) {
      return wrap(e);
    }
  },
  /** @param {{ email: string, password: string }} input */
  async signIn({ email, password }) {
    const a = await amplify();
    try {
      const r = await a.signIn({ username: email, password });
      if (r.nextStep?.signInStep === 'CONFIRM_SIGN_UP')
        throw Object.assign(new Error('Confirm your email first.'), { name: 'UserNotConfirmedException' });
      return { isSignedIn: !!r.isSignedIn };
    } catch (e) {
      return wrap(e);
    }
  },
  async signOut() {
    const a = await amplify();
    await a.signOut();
  },
  /** @param {{ email: string }} input */
  async forgotPassword({ email }) {
    const a = await amplify();
    try {
      await a.resetPassword({ username: email });
      return { nextStep: 'CONFIRM_RESET_PASSWORD' };
    } catch (e) {
      return wrap(e);
    }
  },
  /** @param {{ email: string, code: string, newPassword: string }} input */
  async confirmResetPassword({ email, code, newPassword }) {
    const a = await amplify();
    try {
      await a.confirmResetPassword({ username: email, confirmationCode: code, newPassword });
      return { ok: true };
    } catch (e) {
      return wrap(e);
    }
  },
  /** Signed-in user with their StudentSwap profile (GET /me), or null. @returns {Promise<import('../types/index.js').User | null>} */
  async getCurrentUser() {
    const a = await amplify();
    try {
      await a.getCurrentUser();
    } catch {
      return null;
    } // throws when nobody is signed in
    return request('/me');
  },
  /** The JWT API Gateway's Cognito authorizer expects as `Authorization: Bearer`. @returns {Promise<string | null>} */
  async getIdToken() {
    const a = await amplify();
    const session = await a.fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  },
};
