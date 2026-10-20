// AuthProvider entry point. Pages use `auth` only; the implementation is chosen by config/env.js.
import { USE_MOCKS } from '../config/env.js';
import { mockAuth } from './mock.js';
import { amplifyAuth } from './amplify.js';

export { AuthError } from './errors.js';
export { MOCK_CODE } from './mock.js';

/** @type {typeof mockAuth} */
export const auth = USE_MOCKS ? mockAuth : /** @type {any} */ (amplifyAuth);
