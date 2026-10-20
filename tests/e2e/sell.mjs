import { launch, go, signIn, check, finish } from './harness.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'));
// Unique bytes per file: identical files are (correctly) blocked as duplicates.
const pdf = (name) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, `%PDF-1.4 ${name} ${Math.random()}`);
  return p;
};

const { browser, page, errors } = await launch();
await go(page, '/');
await page.evaluate(() => localStorage.clear());
await signIn(page);
await go(page, '/sell/new');
await page.waitForSelector('#ev-list .pick');
check('continue disabled until an event is chosen', await page.locator('[data-next]').isDisabled());
await page.fill('#ev-search', 'disco');
await page.locator('#ev-list .pick').first().click();
await page.waitForSelector('input[name=tier]');
await page.click('[data-qty="1"]');
check('quantity stepper', (await page.inputValue('#qty')) === '2');
await page.click('[data-next]');

// Delivery: rejected file blocks
await page.waitForSelector('input[name=delivery]');
await page.locator('input[name=delivery][value=pdf]').check({ force: true });
await page.setInputFiles('#ticket-file', pdf('fake-ticket.pdf'));
await page.waitForSelector('.file-check .badge');
await page.waitForFunction(() => document.querySelector('.file-check')?.textContent.includes('Rejected'), null, {
  timeout: 8000,
});
check('rejected barcode blocks continue', await page.locator('[data-next]').isDisabled());
await page.click('[data-replace]');
await page.setInputFiles('#ticket-file', pdf('ticket.pdf'));
await page.waitForFunction(() => document.querySelector('.file-check')?.textContent.includes('verified'), null, {
  timeout: 8000,
});
check('passed barcode enables continue', !(await page.locator('[data-next]').isDisabled()));
await page.click('[data-next]');

// Price: cap
await page.waitForSelector('#price');
await page.fill('#price', '10.50');
await page.waitForSelector('#price-error:not(:empty)');
check('above-face price rejected', (await page.textContent('#price-error')).includes('above face value'));
check('next disabled when above cap', await page.locator('[data-next]').isDisabled());
await page.fill('#price', '8');
check('payout preview shows', (await page.textContent('#preview')).includes('You receive'));
check('preview math: 2x£8 less 5% = £15.20', (await page.textContent('#preview')).includes('£15.20'));
await page.click('[data-next]');

// Review: declarations required
await page.waitForSelector('#review-form');
await page.click('button[type=submit]');
check('declarations required', (await page.locator('.field--error').count()) === 4);
for (const id of ['own', 'valid', 'price', 'rules']) await page.check('#' + id);
await page.click('button[type=submit]');
await page.waitForSelector('.celebrate');
check('published and live', (await page.textContent('.celebrate')).includes('live'));

// Transfer + needs_review path
await go(page, '/browse');
await go(page, '/sell/new');
await page.waitForSelector('#ev-list .pick');
await page.locator('#ev-list .pick').nth(1).click();
await page.click('[data-next]');
await page.locator('input[name=delivery][value=pdf]').check({ force: true });
await page.setInputFiles('#ticket-file', pdf('blurry-screenshot.pdf'));
await page.waitForFunction(() => document.querySelector('.file-check')?.textContent.includes('human'), null, {
  timeout: 8000,
});
check('needs_review allows continue', !(await page.locator('[data-next]').isDisabled()));

// Request event modal
await go(page, '/browse');
await go(page, '/sell/new');
await page.waitForSelector('[data-request]');
await page.click('[data-request]');
await page.fill('#name', 'Spring Fling');
await page.click('#req-form button[type=submit]');
await page.waitForSelector('#venue-error:not(:empty)');
check('request event validates', true);

finish(errors.filter((e) => !e.includes('account.js') && !e.includes('404')));
await browser.close();
