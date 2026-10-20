// Runtime configuration: the ONE file to edit (or generate) when attaching AWS, Stripe and Claude.
// There is no bundler, so there is no import.meta.env. For deploys, `npm run build` regenerates this file
// from environment variables via scripts/write-env.mjs (see README: "Going live").
//
// Mock mode (USE_MOCKS = true) needs no keys at all. Flip it to false and fill in the values below.
export const USE_MOCKS = true;

// --- AWS ---
export const API_BASE_URL = ''; // API Gateway invoke URL, e.g. https://abc123.execute-api.eu-west-2.amazonaws.com/prod
export const AWS_REGION = ''; // e.g. eu-west-2
export const COGNITO_USER_POOL_ID = ''; // e.g. eu-west-2_AbCdEfGhI
export const COGNITO_CLIENT_ID = ''; // Cognito app client (no secret)

// --- Stripe (publishable key only: safe in the browser. The secret key lives in the backend.) ---
export const STRIPE_PUBLISHABLE_KEY = ''; // pk_test_... / pk_live_...

// --- Claude ---
// Nothing to put here on purpose: the Anthropic API key is a SECRET and must only exist in the backend
// (AWS Secrets Manager -> Lambda). The browser reaches Claude through POST /ai/extract-ticket and /ai/verify-ticket.
