// Bundled by scripts/bundle-amplify.mjs into public/vendor/amplify-auth.js (self-hosted: no third-party CDN).
// Only thin re-exports live here; the mapping to StudentSwap's AuthProvider interface is in amplify.js.
import { Amplify } from 'aws-amplify';
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signOut,
  resetPassword,
  confirmResetPassword,
  getCurrentUser,
  fetchAuthSession,
  autoSignIn,
} from 'aws-amplify/auth';

/** @param {{ userPoolId: string, userPoolClientId: string }} cfg */
export function configure({ userPoolId, userPoolClientId }) {
  Amplify.configure({ Auth: { Cognito: { userPoolId, userPoolClientId } } });
}
export {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signOut,
  resetPassword,
  confirmResetPassword,
  getCurrentUser,
  fetchAuthSession,
  autoSignIn,
};
