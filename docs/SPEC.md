# StudentSwap: Agreed Spec (v1, draft for sign-off)

## Brand

- Name: **StudentSwap** (fixed). Placeholder SVG wordmark + icon.
- Tagline (placeholder, to change later): **"Swap tickets. Not scams."**
- Domain (placeholder): studentswap.co.uk
- All of the above live in one `config/brand.js`.

## Launch scope (data, not copy)

- Region: **Midlands**. Region/city/university are seed data in `data/regions.js`, so new regions (e.g. "StudentSwap North") are data-only additions.
- Universities and email domains (student subdomains allowed where noted):
  - Birmingham: bham.ac.uk
  - Aston: aston.ac.uk
  - Birmingham City: bcu.ac.uk
  - Warwick: warwick.ac.uk
  - Coventry: coventry.ac.uk
  - Nottingham: nottingham.ac.uk
  - Nottingham Trent: my.ntu.ac.uk
  - Leicester: leicester.ac.uk
  - De Montfort: dmu.ac.uk
  - Loughborough: lboro.ac.uk
  - Keele: keele.ac.uk
- _Verify each domain before launch; the Cognito pre-sign-up Lambda must also enforce the allowlist._

## Events

- **Admin-curated only.** Sellers can "request an event" (goes to the admin queue). No seller-created events, no imports at launch.

## Ticket delivery

- **Both:** PDF/QR upload (simulated barcode check: checking / passed / needs review / rejected) and native platform transfer (with instructions).

## Pricing and offers

- **Hard cap at face value**, enforced by one function. Cap is `maxPriceMultiplier = 1.0` in config.
  - Note: you asked about prices slightly above face value. I advised against it (draft Ticket Tout Ban Bill, platform liability; not legal advice, so verify). The multiplier is the single switch if that changes.
- **Offers: on.** Make offer, accept / decline / counter, "complete checkout within X hours" state.
- **Auctions deferred.** Candidates: falling-price listings and a "Wanted" board, both capped at face value. _Reminder to revisit after MVP._

## Fees (placeholders, one config)

- Buyer fee: **5%** of ticket price, shown from the first price display.
- Seller fee: **5%** of ticket price, deducted from payout (shown in live payout preview).
- Money in integer pence. Rounding rule: round half up per fee, in one `fees.js` util.

## Escrow and payouts

- Funds held; **released 24h after event end if no report is open.** Payout states: held, eligible, released, frozen.

## Stack

- **Vanilla HTML/CSS/JS, ES modules, no build step**, free static hosting (Amplify Hosting or any static host).
- **JSDoc types checked with `tsc --checkJs` (strict)**, ESLint + Prettier, `node --test` for unit tests (fee calculator, face-value cap, status transitions).
- Hash-based router with lazy `import()` per page (code splitting without a bundler), small component helpers, CSS variables for tokens (same approach as CIRQLE).
- Tailwind is dropped. Tokens as CSS variables replace it.
- Folder structure: `src/{pages,components,features,api,types,lib,styles,config,data}`, `docs/`.
- Api layer: `api/*` per domain, mock + HTTP implementations switched by `config` (`USE_MOCKS`, `API_BASE_URL`).
  - No `import.meta.env` without a bundler, so config comes from a `config/env.js` file that you edit or the deploy step overwrites.

## Layout and theme

- **Mobile-first**, with a bottom tab bar on mobile, optimised for desktop too. Check at 375px and desktop each step.
- **Light only** for now. Colours are CSS variables, so dark mode can be added later.
- WCAG AA, visible focus, keyboard navigable, `prefers-reduced-motion` respected.

## Design

- CIRQLE tokens as given (Inter, Playfair italic accent word, 14px/10px radii, blue-glow primary buttons).
- 2-3 visual directions to be proposed next. You pick one, then the landing page is built for sign-off.

## Build order

Design direction, then tokens/components, then landing (sign-off), then auth, browse/event, checkout, sell, account, offers/reports, admin, static pages, and `docs/BACKEND_HANDOFF.md` plus README.

## Assumptions I made (shout if wrong)

- Hold timer is 2 minutes. Offer checkout window is 12 hours. Report window runs until payout release (24h after the event).
- Mock admin role is toggled via a mock-login account (`admin@bham.ac.uk`).
- Terms and Privacy are clearly marked placeholder templates, with no legal claims.

---

## Changes since sign-off (kept in sync with the build)

**Navigation and pages**

- Top bar: **Buy Tickets**, **Sell Tickets**, **How it works**, centred. Safety content lives inside How it works (`/safety` redirects there).
- **Sell Tickets** (`/sell`) is a public page of features and advantages with a payout example; its button goes to the wizard (`/sell/new`), which sends guests to sign in first.
- Region tag ("Midlands") beside the logo; "Now live across the Midlands" green box above the hero headline (straight, not tilted). All read from `data/regions.js`.
- Admin area: overview (stats by university), listing review queue, reports queue, events (seller requests + create event).

**Design decisions**

- Highlighted key words replace the Playfair italic accents; no emojis anywhere; placeholder tiles are neutral grey; deal-tile stickers are straight; no tilted boxes except a few hero details.
- Event start times are mostly half-hour slots from 9:00 pm to 11:30 pm (balls and gigs start earlier).
- Hero subtitle copy supplied by the owner. Note: it says "no haggling", but offers are enabled. Decide which is true before launch.
- Wording: "original price" on tiles and price labels (marketing copy still says "face value" in a few places).

**New features**

- AI listing autofill (upload or paste email), duplicate-ticket detection (exact code/file blocks, perceptual near-match to review), AI ticket checks (flagged listings go to admin review). Mock now, Claude on the backend later (`docs/BACKEND_HANDOFF.md` §8, `backend-reference/`).
- Order status `cancelled` added (a lapsed checkout hold needs a destination).

**Open items for the owner**

- Auction model (reminder): falling-price listings and a "Wanted" board, both capped at the original price.
- Verify each university email domain; replace Terms and Privacy; legal review of the price cap and the "verified/protected" claims.
- Stripe economics: check that the 5% + 5% fees cover processing on cheap tickets.

---

## Homepage redesign (hybrid of "Departures" and the original look)

- **Layout:** big tight headline with the straight green "Now live across the Midlands" box above it, a listing **board** (timetable-style table of the next five events) in the hero, hairline-ruled sections, a flat ink call-to-action band.
- **New homepage sections (from concept A):** _On tonight near you_ (today's events, a signed-in student's own university and city first), _What are you in the mood for?_ (event types, linking to the browse type filter), _Selling fast_ (scarcest first).
- **One font:** Inter only, with tabular figures for prices and times. No monospace.
- **Softer-square corners everywhere:** cards 8px, buttons 8px, chips 6px, dialogs 12px. Pills only for small tags.
- **No small-caps section labels or numbering** ("01 / How it works") and no "Step A/B/C". Buy / Sell / Go are boxes.
- **Highlight only on key words:** "scams.", "Go." and "sorted.". Stickers are straight.
- **How it works page** gains the five-step _life of a ticket_ and the _group chat vs StudentSwap_ comparison table (from concept C).
- The vertical tilted carousel was removed from the hero in favour of the board. Easy to restore if wanted.
