// API Gateway (HTTP API) Lambda authorizer, "simple" responses. It runs outside the VPC so it can fetch Cognito's
// public keys. It never rejects the request: public routes must work signed out. It verifies the ID token when one
// is sent and passes the claims on; each route then decides whether it needs a signed-in user or an admin.
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const verifier = CognitoJwtVerifier.create({
  userPoolId: /** @type {string} */ (process.env.USER_POOL_ID),
  clientId: /** @type {string} */ (process.env.USER_POOL_CLIENT_ID),
  tokenUse: 'id',
});

/** @param {any} event */
export const handler = async (event) => {
  const header = event.headers?.authorization ?? event.headers?.Authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return { isAuthorized: true, context: {} };
  try {
    const claims = await verifier.verify(token);
    return {
      isAuthorized: true,
      context: {
        sub: claims.sub,
        email: String(claims.email ?? ''),
        groups: /** @type {string[]} */ ((claims['cognito:groups']) ?? []).join(','),
      },
    };
  } catch {
    // Expired or forged: treat as signed out, but let routes answer 401 so the UI sends the user to sign in.
    return { isAuthorized: true, context: { invalid: '1' } };
  }
};
