// CDK entry point. Settings come from cdk.json "context" or the command line, e.g.
//   npx cdk deploy -c siteOrigin=https://studentswap.co.uk -c requirePayouts=false
import * as cdk from 'aws-cdk-lib';
import { StudentSwapStack } from './stack.mjs';

const app = new cdk.App();
const ctx = (/** @type {string} */ k) => app.node.tryGetContext(k);
const flag = (/** @type {string} */ k, /** @type {boolean} */ dflt) =>
  ctx(k) === undefined ? dflt : String(ctx(k)) === 'true';

new StudentSwapStack(app, 'StudentSwap', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: ctx('region') ?? process.env.CDK_DEFAULT_REGION ?? 'eu-west-2',
  },
  // The site's exact origin (scheme + host). CORS on the API and the upload bucket only allows this one.
  siteOrigin: ctx('siteOrigin') ?? 'http://localhost:5173',
  // Sellers must finish Stripe onboarding before listing. Set false only until the Stripe step is live.
  requirePayouts: flag('requirePayouts', true),
  // GuardDuty Malware Protection for S3 before the ticket scan. See the note in stack.mjs before turning it on.
  malwareScan: flag('malwareScan', false),
  description: 'StudentSwap: events, uploads, ticket scan and listings',
});
