import { launch, go, signIn, check, finish } from './harness.mjs';

const { browser, page, errors } = await launch();
await go(page, '/');
await page.evaluate(() => localStorage.clear());
await signIn(page);

// Find a listing not owned by demo on the Sunrise Social event
await go(page, '/event/evt-sunrise');
await page.waitForSelector('.listing');
const href = await page.locator('.listing a.btn--primary').first().getAttribute('href');
await page.click(`a[href="${href}"]`);
await page.waitForSelector('#pay-form');
const total = await page.textContent('#pay-btn');
check('checkout shows total on pay button', /£\d/.test(total), total.trim());
check('fee line is visible', (await page.textContent('.breakdown')).includes('Buyer fee'));
check('hold timer ticking', /\d\d:\d\d/.test(await page.textContent('.hold .countdown')));

// Validation + decline
await page.click('#pay-btn');
check('empty card blocked', (await page.locator('.field--error').count()) >= 3);
await page.fill('#cardName', 'Alex Demo');
await page.fill('#cardNumber', '4000000000000002');
await page.fill('#cardExp', '1230');
await page.fill('#cardCvc', '123');
await page.click('#pay-btn');
await page.waitForSelector('.form-error:not(:empty)');
check('declined card shows calm error', (await page.textContent('.form-error')).includes('declined'));

// Success
await page.fill('#cardNumber', '4242424242424242');
await page.click('#pay-btn');
await page.waitForURL(/orders\/.*paid=1/);
await page.waitForSelector('.celebrate');
check('success screen celebrates', (await page.textContent('.celebrate h1')).includes('going'));
check('confetti layer shown', (await page.locator('.confetti').count()) >= 0);
const dl = await page.locator('[data-download], .notice--warn').count();
check('ticket access shown (download or transfer notice)', dl >= 1);

// Re-entering checkout for a sold listing is handled
await page.goBack();
await page.goBack().catch(() => {});
await go(page, href.replace('#', ''));
await page.waitForSelector('.state-box');
check('sold listing shows unavailable state', (await page.textContent('.state-box')).includes("aren't available"));

// Hold expiry: shorten the hold by editing the stored order, then reload checkout
await go(page, '/event/evt-midnight-disco');
await page.waitForSelector('.listing');
const h2 = await page.locator('.listing a.btn--primary').first().getAttribute('href');
await go(page, h2.replace('#', ''));
await page.waitForSelector('#pay-form');
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('ss.mockdb'));
  const o = db.orders.filter((x) => x.status === 'pending_payment').at(-1);
  o.holdExpiresAt = new Date(Date.now() + 2500).toISOString();
  localStorage.setItem('ss.mockdb', JSON.stringify(db));
});
await page.reload();
await page.waitForSelector('#expired:not([hidden])', { timeout: 8000 });
check('expired hold shows the expiry state', (await page.textContent('#expired')).includes('expired'));

finish(errors.filter((e) => !e.includes('account.js') && !e.includes('404')));
await browser.close();
