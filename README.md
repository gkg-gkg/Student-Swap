# StudentSwap

A student ticket-resale marketplace for Midlands universities: verified students only, prices never above the original price, money held until after the event, and a real ticket or your money back.

This repository is the **complete frontend**. It runs today on a realistic mock backend, and is built so AWS, Stripe and the Claude API can be attached without touching page code. See [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md).

- **Stack:** vanilla HTML/CSS/JS (ES modules), **no build step to run it**, JSDoc types checked by `tsc --strict`, Node's built-in test runner, ESLint + Prettier.
- **Design:** CIRQLE tokens as CSS variables (`src/styles/tokens.css`), Inter, mobile-first, light theme, WCAG AA (axe-audited).

## Run it

```bash
npm install          # dev tooling only (TypeScript, ESLint, Prettier, Playwright, axe, Amplify/esbuild)
npm run dev          # http://localhost:5173  (tiny static server, no dependencies)
```

Demo accounts (mock mode, password `Password1!`; email codes are always `123456`):

| Account            | Role                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `demo@bham.ac.uk`  | student with tickets, listings, offers, orders, a report and payouts |
| `admin@bham.ac.uk` | admin (listing review, reports, stats, events)                       |

Settings → "reset demo data" restores the seed. Add `?fail=1` before the `#` in the URL to force API errors and see the error states.

## Scripts

| Command                           | What it does                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | 53 unit tests: fee calculator, face-value cap, status machines, email allowlist, duplicate detection, ticket matching, London time            |
| `npm run typecheck`               | `tsc --strict` over the JSDoc types                                                                                                           |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                                                                                             |
| `npm run test:e2e`                | browser suites (needs Chrome and `npm run dev` running): auth, browse/offers, checkout, sell, ticket safety, accounts, full marketplace cycle |
| `node tests/e2e/a11y.mjs`         | axe-core WCAG 2.x A/AA audit of every page at phone and desktop widths                                                                        |
| `npm run build`                   | writes config from env vars, bundles Amplify (live mode), copies the site to `dist/`                                                          |

## Project layout

```
index.html              entry; loads the stylesheets and src/main.js
src/
  config/               env.js (the switch), brand.js, pricing.js (fees, cap, timers), features.js (AI/safety flags)
  data/                 regions.js (regions, cities, universities: DATA not copy), seed.js (mock DB), labels, faq
  types/                shared JSDoc types + status enums
  lib/                  fees, pricing (face-value cap), status machines, time (Europe/London), ticket-fingerprint, ticket-match, html (safe templating)
  api/                  one module per domain, each with .mock.js and .http.js; index.js picks one
  auth/                 mock.js and amplify.js (Cognito) behind one interface
  payments/             provider.js (mock) and stripe.js (Payment Element + Connect)
  components/           Button helpers, Modal/Sheet (native <dialog>), Toast, Tabs, Stepper, Dropzone, EventCard, TicketCard, PriceBreakdown, Countdown, ...
  features/             make-offer, ticket-upload, account/* tabs
  pages/                one lazy-loaded module per route
  router.js             hash router, route guards (auth, admin, guest), per-page meta
  styles/               tokens, base, components, app, landing, pages
backend/                AWS backend for events, uploads, ticket scan and listings (CDK; see backend/README.md)
backend-reference/      Lambda handlers for the Claude and Stripe features (runnable tests, no key needed)
docs/                   SPEC.md, BACKEND_HANDOFF.md
scripts/                serve, build, write-env, bundle-amplify
tests/e2e/              Playwright suites (uses your installed Chrome)
```

## Going live (AWS, Stripe, Claude)

1. **Backend:** steps 2 and 3 (events, uploads, ticket scan, listings, plus login) are built in [backend/](backend/README.md): `cd backend && npx cdk deploy`. The rest follows [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md). The mock API in `src/api/*.mock.js` is the executable spec for every response.
2. **Amplify Hosting:** connect the repo (it reads `amplify.yml` and `customHttp.yml`). In Amplify → Environment variables set:
   `STUDENTSWAP_USE_MOCKS=false`, `API_BASE_URL`, `AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `STRIPE_PUBLISHABLE_KEY`.
3. **Cognito:** add the **pre-sign-up Lambda** that enforces the university email allowlist. The frontend check alone is not enough (handoff §3).
4. **Stripe:** webhook endpoint `POST /stripe/webhook`; Connect Express for sellers (handoff §7).
5. **Claude:** deploy `backend-reference/ai-ticket-handler.mjs` as `POST /ai/extract-ticket` and `/ai/verify-ticket`, with `ANTHROPIC_API_KEY` in Secrets Manager. The key never goes in the frontend. If these endpoints aren't ready, the UI falls back to manual entry.

Local live-mode try-out: edit `src/config/env.js` (`USE_MOCKS = false` plus the values) and run `npm run bundle-amplify` once.

## Things to know

- **Safe by default templating:** `html```...``` escapes every interpolated value; use `raw()` only for trusted static markup.
- **Money is integer pence**, shown with `formatPence`. Fees and the face-value cap each live in exactly one function (`src/lib/fees.js`, `src/lib/pricing.js`). `maxPriceMultiplier = 1.0` in `src/config/pricing.js` is the single switch for the price cap (take legal advice before changing it).
- **Regions are data:** add an object to `src/data/regions.js` to launch "StudentSwap North"; copy that mentions the region reads from it.
- **Times** are ISO UTC and always displayed in Europe/London.
- **Auctions** are deliberately not built (standard offers only). Ideas on file: falling-price listings and a "Wanted" board, both capped at the original price.
- Terms and Privacy are **draft placeholders**. Do not launch with them.
