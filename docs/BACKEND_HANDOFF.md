# StudentSwap: Backend Handoff

The frontend is finished and runs entirely on a mock backend. This document is everything needed to build the real one on AWS and switch over. It covers **AWS**, **Stripe** and the **Claude API**, which are the only three things left to attach.

**The mock API is the executable spec.** For every endpoint below, the return value of the matching function in `src/api/*.mock.js` is the exact response shape the UI expects (including the "enriched" objects: a listing carries `event`, `tier` and `seller`; an order carries `event`, `tier`, `seller`, `buyer`, `payout`, `report`). The shared types are in `src/types/index.js`. When the real API is wrong, `npm run typecheck` and `npm run test:e2e` (against `USE_MOCKS = false`) tell you where.

---

## 0. The switch (what to change on the frontend)

Everything is controlled from `src/config/env.js`, which `npm run build` generates from environment variables (Amplify Hosting → Environment variables):

| Variable                                    | Used for                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `STUDENTSWAP_USE_MOCKS`                     | `false` for live mode (default is `true` unless `API_BASE_URL` is set)                 |
| `API_BASE_URL`                              | API Gateway invoke URL, e.g. `https://abc123.execute-api.eu-west-2.amazonaws.com/prod` |
| `AWS_REGION`                                | e.g. `eu-west-2`                                                                       |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | Amplify Auth (app client **without** a secret)                                         |
| `STRIPE_PUBLISHABLE_KEY`                    | `pk_test_...` / `pk_live_...` (the build refuses an `sk_` key)                         |

There is deliberately **no** variable for the Anthropic key: it is a secret and lives only in the backend (section 8).

How the seams are wired:

| Concern     | Mock                                               | Real                                                                                              | Switch                     |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| Data access | `src/api/*.mock.js`                                | `src/api/*.http.js` (`fetch` + Cognito ID token)                                                  | `src/api/index.js`         |
| Auth        | `src/auth/mock.js`                                 | `src/auth/amplify.js` (Amplify v6, bundled to `public/vendor/amplify-auth.js` by `npm run build`) | `src/auth/index.js`        |
| Payments    | `src/payments/provider.js` (placeholder card form) | `src/payments/stripe.js` (Stripe.js Payment Element + Connect)                                    | `src/payments/provider.js` |
| AI          | `src/api/ticket-ai.mock.js` (heuristics)           | `src/api/ticket-ai.http.js` → your Lambda → Claude                                                | `src/api/index.js`         |

---

## 1. Suggested AWS architecture

```
Browser (Amplify Hosting, static) ──► API Gateway (REST, Cognito authorizer) ──► Lambda (Node 20)
        │                                    │                                      │
        │ Stripe.js (iframe)                 │                              ┌───────┴────────┐
        ▼                                    ▼                              ▼                ▼
     Stripe  ◄── webhooks ──► API Gateway (public, signature-verified)   RDS Postgres     S3 (private)
                                                                         (or DynamoDB)    tickets/
 Cognito user pool ── pre-sign-up Lambda (allowlist) ── post-confirmation Lambda (create profile)
 EventBridge Scheduler ─► Lambdas (hold expiry, offer expiry, payout release, listing expiry)
 SES ◄── Lambdas (transactional email)         Secrets Manager ─► Lambdas (Stripe secret, Anthropic key)
 S3 upload event ─► SQS ─► "ticket-scan" Lambda (decode codes, hashes, duplicate check, Claude)
```

| Piece    | Choice and why                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting  | **Amplify Hosting** (`amplify.yml`, `customHttp.yml` are in the repo). Static site, hash routing, so no rewrite rules are needed.                                                                                                     |
| Auth     | **Cognito user pool**, email as username, code verification. Admin = Cognito group `admin`; expose as a `role` claim.                                                                                                                 |
| API      | **API Gateway REST + Lambda**. Cognito authorizer on everything except `GET /events*`, `GET /sellers/:id`, `/stripe/webhook`.                                                                                                         |
| Database | **RDS Postgres** (recommended). Orders, payouts, offers and reservations need real transactions (reserving a listing must be atomic). DynamoDB works if you use conditional writes, but is more work for the admin queries and stats. |
| Files    | **S3, private bucket**, SSE-KMS, Block Public Access ON. Presigned PUT/GET only.                                                                                                                                                      |
| Email    | **SES** (templates in section 11).                                                                                                                                                                                                    |
| Jobs     | **EventBridge Scheduler** one-off schedules (section 10).                                                                                                                                                                             |
| Secrets  | **Secrets Manager**: `stripe/secret`, `stripe/webhook`, `anthropic/api-key`.                                                                                                                                                          |

---

## 2. Conventions

- **Auth:** `Authorization: Bearer <Cognito ID token>`. The frontend attaches it automatically (`src/api/http.js`).
- **Money:** integer **pence** everywhere, in requests, responses and the database. Never floats.
- **Time:** ISO-8601 **UTC** strings. The UI converts to Europe/London for display.
- **Errors:** non-2xx with JSON `{ "message": "human readable", "code": "machine_code" }`. The UI shows `message`. Codes the UI branches on: `unauthenticated` (401 → sign-in), `forbidden`, `not_found`, `unavailable` (409, tickets just taken), `hold_expired` (410), `window_closed`, `duplicate_ticket` (409), `above_cap`.
- **Ids:** opaque strings.
- **CORS:** allow only the site origin; allow `Authorization, Content-Type`.
- **Idempotency:** `POST /orders`, `/orders/:id/confirm-payment` and all Stripe/webhook handlers must be safe to repeat.
- **List endpoints return full arrays** (no pagination in the UI yet). Add `limit`/`next` before data grows; keep the default response shape.

---

## 3. Cognito

1. User pool: email as sign-in, self sign-up on, email verification by **code**, password policy at least 8 chars with a letter and a number (matches the UI). App client: **no client secret**, auth flows `USER_SRP_AUTH` (+ `ALLOW_REFRESH_TOKEN_AUTH`).
2. **Pre-sign-up Lambda (REQUIRED).** The frontend rejects non-university emails, but anyone can call Cognito directly, so the trigger must enforce the same allowlist or the "verified students only" promise is void. The list is data in `src/data/regions.js` (`emailDomains`; subdomains such as `student.bham.ac.uk` are allowed). Reference implementation:

   ```js
   // pre-sign-up trigger
   const DOMAINS = ['bham.ac.uk', 'aston.ac.uk', /* ...from regions.js */];
   export const handler = async (event) => {
     const domain = event.request.userAttributes.email.toLowerCase().split('@')[1] ?? '';
     if (!DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) {
       throw new Error('Use your university email address.'); // surfaces as UserLambdaValidationException
     }
     return event; // do NOT auto-confirm: the emailed code is the proof of mailbox ownership
   };
   ```

3. **Post-confirmation Lambda:** insert the `users` row (`profile_complete = false`, `university_id` derived from the email domain).
4. Admin: add moderators to Cognito group `admin`; the API checks `cognito:groups`.
5. 18+ confirmation is recorded by `POST /me/profile` (`ageConfirmed: true`); store a timestamp.

---

## 4. Endpoint reference

`A` = auth required, `P` = public, `Admin` = admin group. Responses follow the mock return values.

### Users & profile

| Method | Path           | Auth | Request                                                               | Response                                                                                                                                       |
| ------ | -------------- | ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/me`          | A    |                                                                       | `User` (private fields included: `email`, `notificationPrefs`, `profileComplete`, `role`)                                                      |
| POST   | `/me/profile`  | A    | `{ displayName, universityId, avatar:{tone,initials}, ageConfirmed }` | `User`. Validates 2–30 chars, `ageConfirmed` true; **ignore `universityId` from the client** and keep the one derived from the verified email. |
| PATCH  | `/me/profile`  | A    | `{ displayName?, avatar? }`                                           | `User`                                                                                                                                         |
| GET    | `/sellers/:id` | P    |                                                                       | `{ seller: SellerSummary, listings: Listing[] }` (active only; never expose email)                                                             |

### Events (admin-curated)

| Method | Path                                | Auth               | Request                                                                                                                                           | Response                                                                                                                                         |
| ------ | ----------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/events`                           | P                  | query: `q, when(tonight\|weekend\|date), from, to, cityId, uniId, venue, type, maxPricePence, sort(soonest\|price_low\|price_high\|most_tickets)` | `AppEvent[]` (upcoming only; adds `lowestPricePence`, `ticketsAvailable`, `faceValuePence`, `sellingFast`). Dates are compared in Europe/London. |
| GET    | `/events/filters`                   | P                  |                                                                                                                                                   | `{ venues: string[] }`                                                                                                                           |
| GET    | `/events/:id`                       | P (optional token) |                                                                                                                                                   | `{ event: AppEvent, listings: EnrichedListing[] (active), alertOn: boolean }`                                                                    |
| PUT    | `/events/:id/alert`                 | A                  | `{ on }`                                                                                                                                          | `{ alertOn }`. When a listing goes active, notify users with an alert (SES + in-app).                                                            |
| POST   | `/event-requests`                   | A                  | `{ name, venue, date, note? }`                                                                                                                    | `{ ok }`                                                                                                                                         |
| GET    | `/admin/event-requests`             | Admin              |                                                                                                                                                   | request rows + `requester`                                                                                                                       |
| POST   | `/admin/event-requests/:id/dismiss` | Admin              |                                                                                                                                                   | `{ ok }`                                                                                                                                         |
| POST   | `/admin/events`                     | Admin              | `{ title, venue, cityId, type, startsAt, durationHours, description?, tiers:[{name,faceValuePence}] }`                                            | `EventRecord`                                                                                                                                    |

### Listings

| Method | Path            | Auth | Request                                                                                                                                                             | Response                                                                                                                                                                                                                        |
| ------ | --------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/listings/:id` | P    |                                                                                                                                                                     | `EnrichedListing`                                                                                                                                                                                                               |
| POST   | `/listings`     | A    | `{ eventId, tierId, quantity(1-6), pricePence, delivery(pdf\|transfer), transferPlatform?, fileKey?, fileName?, barcodeCheck?, declarationsAccepted, extraction? }` | `EnrichedListing`. **Server rules (section 6):** price ≤ face value, re-run duplicate check and AI verify here (never trust the client), then status `active` or `under_review`. `409 duplicate_ticket` for an exact duplicate. |
| GET    | `/me/listings`  | A    |                                                                                                                                                                     | `EnrichedListing[]` newest first                                                                                                                                                                                                |
| PATCH  | `/listings/:id` | A    | `{ pricePence }`                                                                                                                                                    | `EnrichedListing` (re-validate the cap; only `active`/`under_review`)                                                                                                                                                           |
| DELETE | `/listings/:id` | A    |                                                                                                                                                                     | delist → `removed`; expire open/accepted offers on it and notify buyers                                                                                                                                                         |

### Offers

| Method | Path                  | Auth | Request                                               | Response                                                                                                                                                                                                                               |
| ------ | --------------------- | ---- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/offers`             | A    | `{ listingId, amountPence }`                          | `Offer` (per-ticket amount; ≥ 100, ≤ listing price; one open offer per buyer per listing; expires after 24h)                                                                                                                           |
| GET    | `/me/offers`          | A    |                                                       | `{ made: Offer[], received: Offer[] }` (each enriched with `listing`, `buyer`, `seller`)                                                                                                                                               |
| POST   | `/offers/:id/respond` | A    | `{ action(accept\|decline\|counter), counterPence? }` | `Offer`. Turn order: seller answers a buyer's offer (accept/decline/counter, counter must be above the offer and ≤ listing price); buyer answers a seller's counter (accept/decline only). Accept sets `checkoutDeadline = now + 12h`. |

### Orders & delivery

| Method | Path                           | Auth       | Request                   | Response                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ------------------------------ | ---------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/orders`                      | A          | `{ listingId, offerId? }` | `EnrichedOrder` in `pending_payment` with `holdExpiresAt = now + 120s`. Atomically reserve the listing (`active → reserved`); reuse the buyer's live hold if one exists; `409 unavailable` if taken. If `offerId`, price = accepted offer amount (must belong to the caller and not be past its deadline). Fee = buyer fee on the bundle total. Schedule hold expiry. |
| GET    | `/orders/:id`                  | A          |                           | `EnrichedOrder` (buyer, seller or admin only)                                                                                                                                                                                                                                                                                                                         |
| GET    | `/me/orders`                   | A          |                           | purchases (exclude `cancelled`)                                                                                                                                                                                                                                                                                                                                       |
| GET    | `/me/sales`                    | A          |                           | sales (exclude `pending_payment`, `cancelled`)                                                                                                                                                                                                                                                                                                                        |
| POST   | `/orders/:id/confirm-payment`  | A          | `{ paymentRef }`          | `EnrichedOrder`. Syncs the UI; **the Stripe webhook is the source of truth** (section 7). Returns the current state (`pending_payment` until the webhook lands; the order page polls).                                                                                                                                                                                |
| POST   | `/orders/:id/cancel`           | A          |                           | cancel a `pending_payment` order, release the listing                                                                                                                                                                                                                                                                                                                 |
| POST   | `/orders/:id/mark-transferred` | A (seller) |                           | `paid → delivered` (native-transfer orders); notify buyer                                                                                                                                                                                                                                                                                                             |
| POST   | `/orders/:id/download-url`     | A (buyer)  |                           | `{ url, fileName, expiresInSeconds }`: a **presigned GET, 60s**, only for `delivered/completed/reported` PDF orders                                                                                                                                                                                                                                                   |

### Reports & payouts

| Method | Path                 | Auth      | Request                                                        | Response                                                                                                                                  |
| ------ | -------------------- | --------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/reports`           | A (buyer) | `{ orderId, reason, description(≥20 chars), evidenceNames[] }` | `Report`. Only while status is `paid/delivered` **and** now < `payoutReleaseAt`. Sets order `reported`, payout `frozen`, notifies seller. |
| GET    | `/reports/:id`       | A         |                                                                | `Report` (+ `order`, `event`, `seller`) reporter or admin only                                                                            |
| GET    | `/me/reports`        | A         |                                                                | `Report[]`                                                                                                                                |
| GET    | `/me/payouts`        | A         |                                                                | `{ totals:{heldPence,eligiblePence,releasedPence,frozenPence}, items: PayoutItem[] }`                                                     |
| GET    | `/me/connect-status` | A         |                                                                | `{ status: not_started\|pending\|complete }`                                                                                              |
| POST   | `/me/connect-link`   | A         |                                                                | `{ url }` (Stripe Account Link)                                                                                                           |

### Uploads (private S3)

| Method | Path                  | Auth | Request                                                                             | Response                                                                                                                                                                    |
| ------ | --------------------- | ---- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/uploads/presign`    | A    | `{ fileName, contentType(pdf\|png\|jpeg), size(≤10MB), purpose(ticket\|evidence) }` | `{ uploadUrl, key }`: presigned **PUT**, short expiry, content-type and length pinned, key `tickets/{userId}/{uuid}.{ext}` or `evidence/...`                                |
| GET    | `/uploads/check?key=` | A    |                                                                                     | `{ result(checking\|passed\|needs_review\|rejected), message, reasons: ReviewReason[] }`. Result of the async scan (section 9). Return `checking` until done; the UI polls. |

### AI (Claude, section 8)

| Method | Path                 | Auth | Request                                   | Response                                                   |
| ------ | -------------------- | ---- | ----------------------------------------- | ---------------------------------------------------------- |
| POST   | `/ai/extract-ticket` | A    | `{ fileKey? \| text? }`                   | `{ ok:true, extracted } \| { ok:false, reason, message }`  |
| POST   | `/ai/verify-ticket`  | A    | `{ fileKey? \| text?, eventId, tierId? }` | `{ verdict: pass\|flag, flags:[{code,severity,message}] }` |

### Notifications

| Method | Path                     | Auth | Request                                     | Response                                          |
| ------ | ------------------------ | ---- | ------------------------------------------- | ------------------------------------------------- |
| GET    | `/me/notifications`      | A    |                                             | `Notification[]` newest first                     |
| POST   | `/me/notifications/read` | A    | `{ ids? }` (omit = all)                     | `{ ok }`                                          |
| PATCH  | `/me/notification-prefs` | A    | `{ offers?, orders?, alerts?, marketing? }` | prefs object. Respect these before sending email. |

### Admin

| Method | Path                         | Auth                       | Request                                | Response                                                                                                                                        |
| ------ | ---------------------------- | -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/listings/review`     | Admin                      |                                        | `EnrichedListing[] + file` oldest first, each with `reviewReasons`                                                                              |
| POST   | `/admin/listings/:id/review` | Admin                      | `{ decision(approve\|reject), note? }` | listing. Reject **requires** a note. Notify the seller.                                                                                         |
| GET    | `/admin/reports?status=open` | Admin                      |                                        | reports + `order`, `event`, `buyer`, `seller`                                                                                                   |
| POST   | `/admin/reports/:id/resolve` | Admin                      | `{ resolution(refund\|deny), note }`   | `Report`. **refund:** Stripe refund, order `refunded`, payout stays `frozen` (voided). **deny:** order `completed`, payout `frozen → eligible`. |
| GET    | `/admin/stats`               | Admin                      |                                        | `{ rows:[{universityId,name,users,activeListings,ordersCount,volumePence}], totals }`                                                           |
| POST   | `/payments/session`          | A                          | `{ orderId }`                          | `{ clientSecret }` (PaymentIntent for `order.totalPence`, metadata `orderId`)                                                                   |
| POST   | `/stripe/webhook`            | public, signature-verified | Stripe event                           | `200`                                                                                                                                           |
| POST   | `/contact`                   | P (rate-limited)           | `{ name, email, topic, message }`      | `{ ok }` (SES to support). Currently a TODO in `static.js`.                                                                                     |

---

## 5. Data model (Postgres)

All money columns are `integer` pence. All timestamps `timestamptz` (UTC).

| Table                                             | Key columns                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `regions`, `cities`, `universities`               | seed from `src/data/regions.js` (`email_domains text[]`)                                                                                                                                                                                                                                     |
| `users`                                           | `id (= cognito sub)`, `email`, `display_name`, `university_id`, `avatar_tone`, `avatar_initials`, `role`, `profile_complete`, `age_confirmed_at`, `rating_avg`, `rating_count`, `completed_sales`, `notification_prefs jsonb`, `stripe_account_id`, `connect_status`, `created_at`           |
| `events`                                          | `id`, `title`, `description`, `venue`, `city_id`, `university_ids[]`, `type`, `starts_at`, `last_entry_at`, `ends_at`, `age_restriction`, `id_requirement`, `tone`                                                                                                                           |
| `ticket_tiers`                                    | `id`, `event_id`, `name`, `face_value_pence`                                                                                                                                                                                                                                                 |
| `listings`                                        | `id`, `event_id`, `tier_id`, `seller_id`, `quantity`, `price_pence` (per ticket), `face_value_pence` (copied from tier at creation), `delivery`, `transfer_platform`, `file_key`, `file_name`, `barcode_check`, `status`, `review_note`, `review_reasons jsonb`, `ai_assisted`, `created_at` |
| `offers`                                          | `id`, `listing_id`, `buyer_id`, `seller_id`, `amount_pence`, `last_actor`, `status`, `expires_at`, `checkout_deadline`, `history jsonb`                                                                                                                                                      |
| `orders`                                          | `id`, `listing_id`, `event_id`, `buyer_id`, `seller_id`, `quantity`, `unit_pence`, `buyer_fee_pence`, `total_pence`, `status`, `delivery`, `hold_expires_at`, `paid_at`, `delivered_at`, `payout_release_at`, `report_id`, `stripe_payment_intent_id`, `stripe_charge_id`                    |
| `payouts`                                         | `id`, `order_id`, `seller_id`, `gross_pence`, `seller_fee_pence`, `amount_pence`, `status`, `release_at`, `released_at`, `stripe_transfer_id`                                                                                                                                                |
| `reports`                                         | `id`, `order_id`, `reporter_id`, `reason`, `description`, `evidence_keys[]`, `evidence_names[]`, `status`, `resolution_note`, `resolved_by`, `created_at`                                                                                                                                    |
| `ticket_fingerprints`                             | `listing_id`, `file_hash`, `image_hash bigint`, `codes text[]` + indexes on `file_hash` and a GIN on `codes`                                                                                                                                                                                 |
| `notifications`, `event_alerts`, `event_requests` | as in the mock (`src/data/seed.js`)                                                                                                                                                                                                                                                          |

Constraints worth having: one live (`pending_payment`) order per listing; `unique(listing_id, buyer_id) where status = 'open'` on offers; `check (price_pence <= face_value_pence * max_multiplier)` as defence in depth.

---

## 6. State machines and rules to enforce server-side

The transition tables are in `src/lib/status.js` (unit-tested). **Copy them to the backend and reject anything else.**

| Entity  | States                                                                                                                                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listing | `draft → under_review → active → reserved → sold`; `reserved → active` (hold lapsed); `active/under_review → removed`; `active → expired` (event over)                                                                                 |
| Offer   | `open → accepted / declined / expired`; `accepted → expired` (12h checkout window missed)                                                                                                                                              |
| Order   | `pending_payment → paid / cancelled`; `paid → delivered / reported / refunded`; `delivered → reported / completed`; `reported → refunded / completed`. (`cancelled` is an addition to the brief: a lapsed hold needs somewhere to go.) |
| Payout  | `held → eligible → released`; `held/eligible → frozen`; `frozen → eligible` (report denied). A refunded order's payout stays `frozen` forever.                                                                                         |

Rules (all configurable in `src/config/pricing.js`; mirror them in backend config):

- **Price cap:** `price ≤ face value × maxPriceMultiplier` (**1.0**). One function, `src/lib/pricing.js`. The frontend also ships this; the backend must enforce it independently. (Above-face-value resale is being restricted in the UK; the multiplier is the single switch if advice changes. Get legal advice before changing it.)
- **Fees:** buyer 5% of the bundle total, seller 5% of the sale; rounded half up to the penny (`src/lib/fees.js`, unit-tested). Compute on the server; never trust client totals.
- **Hold:** 120s. **Offer checkout window:** 12h. **Offer lifetime:** 24h. **Payout release:** event `ends_at` + 24h, only if no open report.
- Listings are **bundles** (1–6 tickets sold together).
- On sale: expire the other buyers' open offers on that listing. On delist: expire open/accepted offers.
- On payout release: `completed_sales += 1` for the seller.

---

## 7. Stripe

**Model: separate charges and transfers** with **Connect Express** accounts. Do **not** rely on card authorization holds for escrow: they expire after about 7 days, and events can be weeks away.

1. **Checkout.** `POST /payments/session` creates a PaymentIntent on the **platform** account for `order.totalPence` (GBP), `metadata.orderId`, `transfer_group = order_<id>`, `automatic_payment_methods: enabled`. Return `client_secret`. The frontend mounts the Payment Element (`src/payments/stripe.js`) and calls `confirmPayment` with `redirect: 'if_required'`.
2. **Webhook is the source of truth.** `POST /stripe/webhook` (verify the signature with the webhook secret). Handle:
   - `payment_intent.succeeded` → order `paid` (and `delivered` if PDF), listing `sold`, create `payouts` row (`held`, `release_at = event.ends_at + 24h`), schedule release, notify seller. Idempotent on `payment_intent.id`.
   - `payment_intent.payment_failed` → keep the hold until it lapses.
   - `charge.refunded` → reconcile.
   - `account.updated` → update `connect_status` from `charges_enabled/payouts_enabled/requirements`.
3. **Payout release** (scheduled job): if the payout is `held`, no open report, and now ≥ `release_at`: create a **Transfer** to the seller's connected account for `amount_pence` (`source_transaction = charge`, `transfer_group`), set `released`, order `completed`. Stripe then pays the seller out on their schedule.
4. **Refunds:** admin "refund" → `stripe.refunds.create({ payment_intent })`; order `refunded`. If a transfer was already made (shouldn't be, since reports freeze it), reverse it.
5. **Seller onboarding:** `POST /me/connect-link` creates the Express account if needed and returns an Account Link; `GET /me/connect-status` reads the account. Sellers can list before onboarding, but release requires `payouts_enabled`; otherwise leave the payout `eligible` and notify them.
6. **Economics:** the 5% + 5% platform fees must cover Stripe's processing fee (and Connect fees) on the charge. Check the margin on cheap tickets (a £6 ticket) before launch.
7. Test with Stripe test cards (`4242…` success, `4000 0000 0000 0002` declined). Use test mode keys until launch; webhooks per environment.

PCI scope stays minimal because card data only ever lives in Stripe's iframe. `customHttp.yml` already allows `js.stripe.com`.

---

## 8. Claude API (AI features)

Three features use Claude. **All calls are made by the backend**; the browser never holds the key.

| Feature             | Endpoint                                                     | Where                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listing autofill    | `POST /ai/extract-ticket`                                    | Sell wizard step 1. Seller uploads a screenshot/PDF or pastes the email; Claude returns event, venue, date/time, ticket type, original price (each nullable, with per-field confidence). The seller **confirms** before publishing. Any failure returns `ok:false` and the UI falls back to manual entry. |
| Ticket checks       | `POST /ai/verify-ticket` (also called from `POST /listings`) | Flags mismatching details, passed dates, signs of editing. Flags send the listing to **admin review** instead of going live.                                                                                                                                                                              |
| Duplicate detection | _not AI_; plain code (section 9)                             | Exact code/file match blocks; perceptual near-match goes to review.                                                                                                                                                                                                                                       |

**Ready-to-deploy reference:** `backend-reference/ai-ticket-handler.mjs` (Lambda handlers + tests that run without a key: `cd backend-reference && npm i && npm test`). It uses the official `@anthropic-ai/sdk`, **`claude-opus-5-5`** (override with `ANTHROPIC_MODEL`; a cheaper model such as `claude-sonnet-5-5` may be enough for reading tickets, so measure on real tickets first), `messages.parse` with a **Zod 4** schema for structured output, `output_config.effort: 'low'`, and base64 `document` (PDF) / `image` blocks.

To attach:

1. Put the key in **Secrets Manager** → Lambda env `ANTHROPIC_API_KEY` (the SDK reads it automatically).
2. Implement `adapters.mjs`: `loadFile(userId, key)` (S3 `GetObject`; **enforce `key` starts with `tickets/{userId}/`** and ≤ 10 MB) and `loadEvent(eventId)`.
3. Deploy as two API routes behind the Cognito authorizer; set `USE_MOCKS=false`.

Design rules the code and UI rely on (keep them):

- **Claude flags; it never approves.** A model "all clear" still goes through the normal rules; a model failure produces a flag, never a pass.
- **Ticket content is untrusted data** (prompt injection). It is wrapped in tags, the system prompt says to ignore instructions inside it, output is schema-validated, and the decision is made in code.
- **Deterministic checks run in code and are merged in**: passed date, name/venue/date/price mismatch (`src/lib/ticket-match.js`, unit-tested). A manipulated model answer can't hide them.
- Handle `stop_reason === 'refusal'` and empty parsed output as `ok:false` (already done).
- The SDK also supports server-side refusal fallbacks (`fallbacks`, beta); not enabled in the reference. Add it if you see refusals on legitimate tickets.
- Rate-limit per user (API Gateway usage plan / WAF) and cap file size; log token usage; keep ticket images out of logs.
- **Privacy:** tickets can contain names and QR codes. The draft Privacy Policy lists the AI provider as a processor; check Anthropic's current data-retention terms and describe them accurately. Don't send more than needed (one file per call).
- Build a small eval set of real tickets (clean, blurry, edited, wrong event) before launch and track false flags: every false flag costs an admin minute.

---

## 9. Duplicate detection and the ticket-scan pipeline

The browser does a UX preflight (`src/lib/ticket-fingerprint.browser.js`); **the server recomputes everything from the stored file** because client values can be faked.

`S3 ObjectCreated (tickets/) → SQS → ticket-scan Lambda`:

1. Virus scan (GuardDuty Malware Protection for S3), reject on detection.
2. If PDF, render page 1 to an image (pdfium/mupdf). Decode **QR/barcodes** (zxing-wasm or `jsQR`/`pyzbar`) and extract the **printed reference**; normalise with `normalizeTicketCode`.
3. Compute **SHA-256** of the bytes and a **perceptual hash** (the 64-bit dHash in `ticket-fingerprint.js`; a pHash with multi-scale/crop variants is a good upgrade; the browser's dHash is intentionally simple).
4. Query `ticket_fingerprints`:
   - same `file_hash` or any shared code → **exact duplicate** → result `rejected` (the UI blocks; `POST /listings` also returns `409 duplicate_ticket`).
   - `bit_count(image_hash # :hash) <= 10` (Postgres) → **near duplicate** → `needs_review` with a `near_duplicate` reason.
5. Store the result for `GET /uploads/check` and write `reasons` onto the listing at creation.

Copy `compareFingerprint`, `hammingDistance`, `dHashFromGrayscale` and `normalizeTicketCode` (all pure, unit-tested) into the Lambda. The threshold lives in `src/config/features.js` (`ticketSafety.nearDuplicateMaxDistance`). At large scale, replace the linear scan with multi-index hashing or a BK-tree.

---

## 10. Scheduled jobs (EventBridge Scheduler)

Create one-off schedules when the thing happens (cheap, exact), plus a safety-net sweep every few minutes. All handlers must be idempotent.

| Job            | Trigger time                             | Action                                                     |
| -------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Hold expiry    | `order.hold_expires_at`                  | `pending_payment → cancelled`, listing `reserved → active` |
| Offer expiry   | `offer.expires_at` / `checkout_deadline` | `open/accepted → expired`, notify                          |
| Listing expiry | `event.ends_at`                          | `active → expired`; `under_review/draft → removed`         |
| Payout release | `payout.release_at`                      | see section 7.3                                            |

(The mock does this in `sweep()` in `src/api/mock/db.js`: a readable spec of the logic.)

---

## 11. Email (SES) and notifications

Send from a verified domain with DKIM/SPF/DMARC. Honour `notification_prefs`. Every email has an in-app twin in `notifications`.

| Trigger                                           | To                                  |
| ------------------------------------------------- | ----------------------------------- |
| New offer / counter / accept / decline            | seller or buyer                     |
| Order paid, tickets delivered, transfer requested | buyer / seller                      |
| Listing approved or rejected (with reason)        | seller                              |
| Report received / resolved                        | buyer (+ seller on report received) |
| Payout released                                   | seller                              |
| Ticket alert (new tickets for an event)           | subscribers                         |
| Contact form                                      | support inbox                       |

---

## 12. Security and compliance checklist

- [ ] Pre-sign-up Lambda enforces the university domain allowlist.
- [ ] Every endpoint checks the caller owns the resource (orders, listings, offers, reports); admin routes check the group.
- [ ] Server recomputes prices, fees and the face-value cap; ignores client totals.
- [ ] Private S3: Block Public Access, SSE-KMS, presigned URLs ≤ 60s for downloads, content-type/size pinned on uploads, object keys namespaced by user.
- [ ] Stripe webhook signature verified; secrets only in Secrets Manager.
- [ ] CORS limited to the site origin; WAF rate limits on auth, `/contact`, `/ai/*`, `/uploads/presign`.
- [ ] CSP in `customHttp.yml` updated if you use custom API/Cognito domains.
- [ ] Terms and Privacy replaced with solicitor-reviewed text (the pages are drafts). Privacy must cover Stripe, Anthropic and AWS as processors.
- [ ] UK GDPR: data export and deletion route (the UI points to Contact), retention rules for ticket files and evidence, DPA with each processor.
- [ ] Consumer-law and ticket-resale legal review (price cap, platform liability, seller verification claims) before marketing "verified"/"protected".
- [ ] CloudWatch alarms: webhook failures, payout-release failures, AI error rate, queue depth.
- [ ] Backups (RDS PITR) and a tested restore.

---

## 13. Go-live order (suggested)

1. Cognito + pre-sign-up Lambda + `/me`, `/me/profile` → flip `USE_MOCKS=false` locally and sign up for real.
2. Events (seed from `regions.js` + admin create) and read endpoints (`/events`, `/listings`, `/sellers`).
3. Uploads + ticket-scan pipeline + listing creation (with the duplicate check).
4. Stripe: `/payments/session`, webhook, `/orders`, delivery, downloads.
5. Offers, reports, admin endpoints, notifications + SES.
6. Schedulers (hold/offer/listing expiry, payout release) and Stripe Connect transfers.
7. Claude endpoints (autofill, checks): the UI already degrades to manual entry if they're missing.
8. Replace draft legal pages; run the checklist; test-mode end to end; then live keys.

Run `npm run test:e2e` against the real backend (set `USE_MOCKS=false` and adapt the test accounts) as the acceptance suite; the flows it covers are the contract.
