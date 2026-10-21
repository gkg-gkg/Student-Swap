// The whole marketplace loop across several users, on the mock backend.
import { launch, go, signIn, check, finish, BASE } from './harness.mjs';

const { browser, page, errors } = await launch();
await go(page, '/');
await page.evaluate(() => localStorage.clear());
await page.reload(); // re-seed the mock DB
await page.waitForLoadState('networkidle');

const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('ss.mockdb')));
const as = async (email) => {
  // Drop the session and reload so the app's in-memory user matches (as a real sign-out would).
  await page.evaluate(() => localStorage.removeItem('ss.session'));
  await page.reload();
  await signIn(page, email);
};
const userEmail = async (id) => (await db()).users.find((u) => u.id === id).email;

await as('demo@bham.ac.uk');

// ---- 1. Buyer buys a transfer-delivery listing ----
let d = await db();
const listing = d.listings.find((l) => l.status === 'active' && l.delivery === 'transfer' && l.sellerId !== 'u-demo');
await go(page, `/checkout/${listing.id}`);
await page.waitForSelector('#pay-form');
await page.waitForFunction(() => !document.querySelector('#pay-btn').disabled);
await page.fill('#cardName', 'Alex Demo');
await page.fill('#cardNumber', '4242424242424242');
await page.fill('#cardExp', '1230');
await page.fill('#cardCvc', '123');
await page.click('#pay-btn');
await page.waitForURL(/orders\/.*paid=1/);
await page.waitForSelector('.celebrate');
const orderId = page.url().match(/orders\/([^?]+)/)[1];
check('buyer pays and lands on the success screen', true);
check('transfer order waits for the seller', (await page.textContent('.notice--warn')).includes('Waiting for'));

// ---- 2. Seller confirms the transfer ----
await as(await userEmail(listing.sellerId));
await go(page, `/orders/${orderId}`);
await page.waitForSelector('[data-transferred]');
check('seller sees the sale and payout preview', (await page.textContent('.order-page')).includes('Your payout'));
await page.click('[data-transferred]');
await page.waitForFunction(() => !document.querySelector('[data-transferred]'));
check(
  'seller confirms transfer, order moves to delivered',
  (await db()).orders.find((o) => o.id === orderId).status === 'delivered',
);
await go(page, '/account/notifications');
await page.waitForSelector('.note');
check('seller was notified of the sale', (await page.textContent('.notes')).includes('Your tickets sold'));

// ---- 3. Buyer reports a problem ----
await as('demo@bham.ac.uk');
await go(page, `/orders/${orderId}/report`);
await page.waitForSelector('#report-form');
await page.click('button[type=submit]');
check('report needs a reason', (await page.textContent('#reason-error')).includes('Choose'));
await page.check('input[name=reason][value=not_valid]', { force: true });
await page.fill('#description', 'short');
await page.click('button[type=submit]');
await page.waitForSelector('#description-error:not(:empty)');
check('report needs a real description', true);
await page.fill('#description', 'The QR code was rejected at the door and staff said it was already used.');
await page.click('button[type=submit]');
await page.waitForURL(/reports\//);
await page.waitForSelector('.timeline');
const reportId = page.url().match(/reports\/(.+)$/)[1];
check('report status tracker shows in review', (await page.textContent('.badge')).includes('In review'));
d = await db();
check('payout is frozen while reported', d.payouts.find((p) => p.orderId === orderId).status === 'frozen');
await go(page, `/orders/${orderId}/report`);
await page.waitForSelector('.state-box');
check('cannot report the same order twice', (await page.textContent('.state-box')).includes('already reported'));

// ---- 4. Admin refunds ----
await as('admin@bham.ac.uk');
await go(page, '/admin/reports');
await page.waitForSelector(`[data-id="${reportId}"]`);
await page.locator(`[data-id="${reportId}"] [data-resolution=refund]`).click();
await page.waitForSelector(`[data-id="${reportId}"] #rn-${reportId}-error:not(:empty)`);
check('admin must write a decision note', true);
await page.fill(`#rn-${reportId}`, 'Confirmed: the ticket had already been scanned.');
await page.locator(`[data-id="${reportId}"] [data-resolution=refund]`).click();
await page.waitForFunction((id) => !document.querySelector(`[data-id="${id}"]`), reportId);
d = await db();
check('refund voids the order', d.orders.find((o) => o.id === orderId).status === 'refunded');
check(
  'refunded payout stays frozen (never released)',
  d.payouts.find((p) => p.orderId === orderId).status === 'frozen',
);
await as('demo@bham.ac.uk');
await go(page, `/reports/${reportId}`);
await page.waitForSelector('.timeline');
check('buyer sees the refund decision', (await page.textContent('.order-page')).includes('Refund approved'));

// ---- 5. Accepted offer -> checkout at the offered price ----
await go(page, '/account/offers');
await page.waitForSelector('a:has-text("Check out")');
const href = await page.locator('a:has-text("Check out")').first().getAttribute('href');
await page.click(`a[href="${href}"]`);
await page.waitForSelector('#pay-form');
check(
  'offer checkout uses the accepted price (2 x 40.00 + 7% = 85.60)',
  (await page.textContent('#pay-btn')).includes('£85.60'),
);
check('checkout notes the accepted offer', (await page.textContent('.breakdown')).includes('accepted offer'));

// ---- 6. Admin: listing review ----
await as('admin@bham.ac.uk');
await go(page, '/admin/listings');
await page.waitForSelector('.review');
check('review queue lists flagged listings with reasons', (await page.locator('.reasons li').count()) >= 3);
check(
  'reasons name their source (barcode / duplicate / AI)',
  (await page.locator('.reasons').allTextContents()).join(' ').includes('AI check'),
);
await page.locator('[data-id="l-review-2"] [data-decision=reject]').click();
await page.waitForSelector('[data-id="l-review-2"] #note-l-review-2-error:not(:empty)');
check('rejection requires a reason', true);
await page.fill('#note-l-review-2', 'The name on the ticket does not match this event.');
await page.locator('[data-id="l-review-2"] [data-decision=reject]').click();
await page.locator('[data-id="l-review-1"] [data-decision=approve]').click();
await page.waitForFunction(
  () => !document.querySelector('[data-id="l-review-1"]') && !document.querySelector('[data-id="l-review-2"]'),
);
d = await db();
check('approve makes the listing live', d.listings.find((l) => l.id === 'l-review-1').status === 'active');
check(
  'reject removes it and stores the reason',
  d.listings.find((l) => l.id === 'l-review-2').reviewNote.includes('does not match'),
);

// ---- 7. Admin: stats + add event ----
await go(page, '/admin');
await page.waitForSelector('.table');
check('stats by university (11 rows)', (await page.locator('.table tbody tr').count()) === 11);
await go(page, '/admin/events');
await page.waitForSelector('#event-form');
await page.fill('#title', 'Test Social Night');
await page.selectOption('#cityId', 'leicester');
check('venue list follows the city', (await page.locator('#venueId option[value="fan-club-leicester"]').count()) === 1);
await page.selectOption('#venueId', 'other');
await page.fill('#venue', 'The Test Rooms');
await page.fill('#price1', '9');
await page.click('#event-form button[type=submit]');
await page.waitForSelector('.toast');
await go(page, '/browse');
await page.fill('#q', 'Test Social');
await page.waitForFunction(() => document.querySelectorAll('.grid-cards .ticket').length === 1);
check('a new admin-created event appears for buyers', true);

// ---- 8. Guards, profile, 404, error state ----
await as('demo@bham.ac.uk');
await go(page, '/admin');
await page.waitForSelector('.coming');
check('non-admin gets a 403 on /admin', (await page.textContent('.coming h1')).includes("can't see"));
await go(page, '/seller/u-s1');
await page.waitForSelector('.seller-head');
check(
  'public seller profile shows rating and sales',
  (await page.textContent('.seller-stats')).includes('Completed sales'),
);
await go(page, '/this-page-does-not-exist');
await page.waitForSelector('.coming');
check('unknown route shows the 404 page', (await page.textContent('.coming')).includes('404'));
await page.goto(`${BASE}/index.html?fail=1#/browse`);
await page.waitForSelector('[data-retry]');
check('API failure shows an error state with retry', true);
await page.goto(`${BASE}/index.html#/browse`);
await page.waitForSelector('.grid-cards .ticket');
check('retry path works once the failure is gone', true);

finish(errors.filter((e) => !e.includes('status of 400')));
await browser.close();
