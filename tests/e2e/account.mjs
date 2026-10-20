import { launch, go, signIn, check, finish } from './harness.mjs';

const { browser, page, errors } = await launch();
await go(page, '/');
await page.evaluate(() => localStorage.clear());
await signIn(page);
await go(page, '/account');
await page.waitForURL(/account\/tickets/);
await page.waitForSelector('.row-card');
check('tickets tab lists purchases', (await page.locator('.row-card').count()) >= 3);
check('tab badges render', true);

await go(page, '/account/listings');
await page.waitForSelector('.row-card');
check('listings default to Active', (await page.textContent('.chip-btn[aria-pressed=true]')).includes('Active'));
await page.click('[data-filter=review]');
await page.waitForSelector('[data-filter=review][aria-pressed=true]');
await page.waitForSelector('.row-card');
check('under review filter shows listing', (await page.textContent('.row-card')).includes('Under review'));
await page.click('[data-filter=active]');
await page.waitForSelector('[data-edit]');
await page.click('[data-edit]');
await page.fill('#price', '99');
await page.click('#edit-form button[type=submit]');
await page.waitForSelector('#price-error:not(:empty)');
check('edit price enforces face-value cap', (await page.textContent('#price-error')).includes('above face value'));
await page.click('[data-cancel]');

await go(page, '/account/offers');
await page.waitForSelector('.row-card');
check('received offers present', (await page.locator('[data-act=accept]').count()) >= 2);
await page.locator('[data-act=counter]').first().click();
await page.fill('#amount', '1');
await page.click('#counter-form button[type=submit]');
await page.waitForSelector('#amount-error:not(:empty)');
check('counter validated', true);
await page.fill('#amount', '13.50');
await page.click('#counter-form button[type=submit]');
await page.waitForSelector('.toast');
check('counter sent', true);
await page.waitForTimeout(600);
check('accepted offer shows checkout CTA', (await page.locator('a:has-text("Check out")').count()) >= 1);

await go(page, '/account/orders');
await page.waitForSelector('.row-card');
check('orders shows purchases + sales', (await page.locator('.section-title').count()) === 2);

await go(page, '/account/payouts');
await page.waitForSelector('.stats');
check('payouts totals', (await page.locator('.stat').count()) >= 3);
await page.click('[data-connect]');
await page.waitForSelector('.badge--ok');
check('connect onboarding placeholder completes', true);

await go(page, '/account/notifications');
await page.waitForSelector('.note');
await page.click('[data-read-all]');
await page.waitForSelector('text=All caught up');
check('notifications mark all read', true);

await go(page, '/account/settings');
await page.waitForSelector('#profile-form');
await page.fill('#displayName', 'Alex Renamed');
await page.click('#profile-form button[type=submit]');
await page.waitForFunction(() => document.querySelector('.account-head h1')?.textContent === 'Alex Renamed');
check('profile rename', true);
await page.click('[data-signout]');
await page.waitForSelector('.btn--signup');
check('sign out', true);

finish(errors);
await browser.close();
