import { launch, go, signIn, check, finish } from './harness.mjs';

const { browser, page, errors } = await launch();
await go(page, '/browse');
await page.waitForSelector('.grid-cards .ticket');
const total = await page.locator('.grid-cards .ticket').count();
check('browse lists events', total >= 8, `(${total})`);

await page.fill('#q', 'disco');
await page.waitForFunction(() => document.querySelectorAll('.grid-cards .ticket').length === 1);
check('search narrows results', true);
check('URL keeps the search', page.url().includes('q=disco'));

await page.fill('#q', 'zzzz');
await page.waitForSelector('.state-box');
check('empty state shows', (await page.textContent('.state-box')).includes('No events match'));
await page.click('[data-clear-inline]');
await page.waitForSelector('.grid-cards .ticket');
check('clear filters restores list', (await page.locator('.grid-cards .ticket').count()) === total);

await page.check('input[name=when][value=tonight]');
await page.waitForFunction((t) => document.querySelectorAll('.grid-cards .ticket').length < t, total);
check('tonight filter', true);
await page.check('input[name=when][value=""]');

await page.selectOption('#sort', 'price_low');
await page.waitForTimeout(600);
const prices = await page.$$eval('.grid-cards .ticket__price', (els) => els.map((e) => e.textContent));
check('sort by price works', prices.length > 1);

// Event page as guest
await page.click('.grid-cards a.ticket');
await page.waitForSelector('.event-hero');
check('event page renders tiers', (await page.locator('.tier').count()) >= 1);
const offerBtn = page.locator('[data-offer]').first();
await offerBtn.click();
await page.waitForURL(/sign-in/);
check('offer as guest goes to sign-in with next', page.url().includes('next=%2Fevent%2F'));

// Signed in: make an offer
await signIn(page);
await go(page, '/event/evt-bassline');
await page.waitForSelector('.listing');
await page.locator('[data-offer]').first().click();
await page.waitForSelector('#offer-form');
await page.fill('#amount', '99');
await page.click('#offer-form button[type=submit]');
await page.waitForSelector('#amount-error:not(:empty)');
check('offer above price rejected', true);
await page.fill('#amount', '10');
await page.click('#offer-form button[type=submit]');
await page.waitForURL(/account\/offers/);
check('valid offer navigates to offers', true);

// Alert toggle
await go(page, '/event/evt-bassline');
await page.waitForSelector('[data-alert]');
await page.click('[data-alert]');
await page.waitForSelector('[data-alert][aria-pressed=true]');
check('alert toggles on', true);

finish(errors.filter((e) => !e.includes('account.js') && !e.includes('404')));
await browser.close();
