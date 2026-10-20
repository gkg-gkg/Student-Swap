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
await page.reload(); // re-seed the mock DB
await signIn(page);

// New sellers set up payouts first, and events too far ahead (Stripe's 90-day hold limit) can't be listed yet.
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('ss.mockdb'));
  db.users.find((u) => u.email === 'demo@bham.ac.uk').connectStatus = 'not_started';
  const day = 86400000;
  const far = { ...db.events[0], id: 'evt-far', title: 'Far Future Ball' };
  far.startsAt = new Date(Date.now() + 120 * day).toISOString();
  far.endsAt = new Date(Date.now() + 120 * day + 5 * 3600000).toISOString();
  far.lastEntryAt = far.startsAt;
  db.events.push(far);
  localStorage.setItem('ss.mockdb', JSON.stringify(db));
});
await page.reload();
await go(page, '/sell/new');
await page.waitForSelector('[data-connect]');
check('sellers must set up payouts before listing', (await page.textContent('h1')).includes('Set up payouts'));
await page.click('[data-connect]');
await page.waitForSelector('#ev-list .pick');
check('after payout setup the listing form opens', true);
const farPick = page.locator('#ev-list .pick', { hasText: 'Far Future Ball' });
check('events more than 85 days away are greyed out', await farPick.locator('input').isDisabled());
check('...and say when listing opens', (await farPick.textContent()).includes('Listing opens'));

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
// 2 x £8 = £16; buyer pays £17.12 (7% booking fee); Stripe card fee est. 1.5% of £17.12 + 20p = 46p
check('preview math: 2x£8 less est. card fee = £15.54', (await page.textContent('#preview')).includes('£15.54'));
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
