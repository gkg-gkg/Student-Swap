# StudentSwap backend (AWS)

The real backend for handoff steps **2 (events)** and **3 (uploads, ticket scan, listings)**, plus the minimum of step 1 (login) those need. Infrastructure is code (AWS CDK), so one command builds the whole thing in an AWS account.

**Status:** written and tested locally; **not deployed yet**. Nothing here has run in a real AWS account.

## What's in it

| Part           | Where                                               | What it does                                                                                       |
| -------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| API Lambda     | `src/api.mjs`, `src/routes/*`                       | Every endpoint below, behind API Gateway (HTTP API)                                                |
| Authorizer     | `src/auth/authorizer.mjs`                           | Checks the Cognito ID token when one is sent. Each route decides if it needs a user or an admin    |
| Login          | `src/auth/pre-sign-up.mjs`, `post-confirmation.mjs` | University email allowlist enforced by Cognito itself, and the `users` row on sign-up              |
| Ticket scan    | `src/scan/*`                                        | Reads each uploaded ticket: real file type, SHA-256, perceptual hash, QR/barcodes, duplicate check |
| Database       | `db/migrations.mjs`, `db/seed.mjs`                  | Postgres schema, plus regions/cities/unis/**venues** seeded from `src/data/regions.js`             |
| Infrastructure | `infra/stack.mjs`                                   | VPC (no NAT), RDS Postgres, private KMS-encrypted S3, SQS, Cognito, API Gateway, 8 Lambdas         |

Endpoints (shapes match `src/api/*.mock.js`, checked by `test/contract.test.mjs`):

- **Login:** `GET /me`, `POST /me/profile`
- **Events:** `GET /events`, `GET /events/filters`, `GET /events/:id`, `PUT /events/:id/alert`, `POST /event-requests`, `GET /sellers/:id`
- **Admin events:** `GET /admin/event-requests`, `POST /admin/event-requests/:id/dismiss`, `POST /admin/events`
- **Uploads:** `POST /uploads/presign`, `GET /uploads/check`
- **Listings:** `POST /listings`, `GET /listings/:id`, `GET /me/listings`, `PATCH /listings/:id`, `DELETE /listings/:id`
- **Admin review:** `GET /admin/listings/review`, `POST /admin/listings/:id/review`, `POST /admin/listings/:id/file-url`

The admin review queue is pulled forward from step 5. Without it, a listing the checks flagged could never go live.

## How a ticket is checked

1. The browser gets a 5-minute presigned upload link. The file type and size are signed into the link, and the file is stored under the seller's own folder (`tickets/{userId}/…`).
2. S3 tells SQS, and SQS runs the scan Lambda. The scan:
   - opens the file with MuPDF, using its **real** type from the bytes, not what the upload claimed
   - renders page 1
   - reads QR codes and barcodes with ZXing
   - hashes the file (exact) and the picture (perceptual)
3. It then compares those against every ticket that has been listed (sold and expired ones count; delisted ones don't):

   | Finding                       | Result           |
   | ----------------------------- | ---------------- |
   | Same file, or the same code   | **rejected**     |
   | Near-identical picture        | **needs review** |
   | No readable barcode           | **needs review** |
   | Barcode read, nothing matched | **passed**       |

4. `POST /listings` **re-checks** at publish time, because other tickets may have been listed since the scan. It locks per ticket so two copies can't both slip through. Anything flagged goes to `under_review` for an admin.

"Passed" means _readable and not a copy of anything we've seen_. Nothing can tell whether a ticket is still valid with the organiser. The real protection is still holding the money until after the event. Native-transfer listings have no file, so they get no scan.

## Run the tests (no AWS needed)

```bash
cd backend
npm ci
npm test     # 32 tests on a real Postgres (PGlite, in-process) with generated QR/PDF tickets
npx cdk synth   # builds the CloudFormation template and bundles every Lambda (no account needed)
```

## Deploy

You need an AWS account, the AWS CLI signed in (`aws configure` or `aws sso login`), and Node 20+. Region defaults to `eu-west-2` (London).

```bash
cd backend
npm ci
npx cdk bootstrap                     # once per account/region
npx cdk deploy -c siteOrigin=https://YOUR-SITE-DOMAIN -c requirePayouts=false
```

- `siteOrigin` is the exact site address, e.g. `https://studentswap.co.uk` or the Amplify URL. API and upload CORS allow only this origin.
- `requirePayouts=false` lets people list before the Stripe step exists. **Set it back to `true` once Stripe onboarding is live**, because sellers must be able to get paid.
- The first deploy takes about 15 minutes (RDS is slow to create). The database is migrated automatically on every deploy.

Then:

1. **Point the site at the backend.** Copy the stack outputs into Amplify Hosting → Environment variables:

   | Output             | Amplify variable       |
   | ------------------ | ---------------------- |
   | `ApiBaseUrl`       | `API_BASE_URL`         |
   | `AwsRegion`        | `AWS_REGION`           |
   | `UserPoolId`       | `COGNITO_USER_POOL_ID` |
   | `UserPoolClientId` | `COGNITO_CLIENT_ID`    |

   Also set `STUDENTSWAP_USE_MOCKS=false`, then redeploy the site.

2. **Make yourself an admin.** Sign up on the site with your university email first, then run:
   ```bash
   aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username <your email> --group-name admin
   ```
   Sign out and back in so your token picks up the group.
3. **Add events** from Admin → Events. The venue list is the clubs in `src/data/regions.js`.

Note that until the Stripe and offers/orders steps exist, buying (checkout, orders, offers, reports, payouts) still has no backend. In live mode those pages will error. Live mode is for testing sign-up, events and listing for now.

## Cost (rough, eu-west-2)

- **RDS:** the `db.t4g.micro` instance plus 20 GB storage is about **£12–15/month** once any free-tier credit is used up. This is most of the bill.
- **KMS key:** about £1/month.
- **Everything else** (Lambda, API Gateway, S3, SQS, Cognito) is pennies at launch scale.
- **No NAT gateway** (saves about £30/month).

## Known limits and next steps

- **No internet from inside the VPC.** That's fine for these steps. Stripe and Claude (later steps) need to call out, so they'll need a NAT (a NAT gateway, or a small NAT instance for about £3/month), or those Lambdas must run outside the VPC.
- **Cognito's built-in email is limited** (low daily cap). Before launch, switch the user pool to send through **SES** from your own domain.
- **Malware scanning** (`-c malwareScan=true`) wires GuardDuty Malware Protection for S3 in front of the scan. It is **off by default** because its IAM role hasn't been tested in a real account. Check it against AWS's docs before turning it on.
- **Migration password.** The migration Lambda gets the database master password through CloudFormation (from Secrets Manager) as an environment variable. Only that function has it; the API uses IAM tokens and has no password at all.
- **Not built yet:**
  - Notifications (event alerts, "your listing was approved") arrive with step 5.
  - The printed booking reference on a ticket is read by Claude in step 7. Until then only QR codes and barcodes are compared.
- **Venues** in `src/data/regions.js` were researched from student guides in October 2026. **Check each one before launch.** O2 Academy Leicester is due to close at the end of 2026.
