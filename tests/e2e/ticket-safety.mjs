// AI autofill, duplicate detection and AI checks, exercised through the mock backend.
import { launch, go, signIn, check, finish } from './harness.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'));
const file = (name, content = `%PDF-1.4 ${name} ${Math.random()}`) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, content);
  return p;
};

const { browser, page, errors } = await launch();
await go(page, '/');
await page.evaluate(() => localStorage.clear());
await signIn(page);

async function startSell() {
  await go(page, '/browse');
  await go(page, '/sell/new');
  await page.waitForSelector('.autofill');
}

// 1. Upload -> read -> apply -> publish live
await startSell();
const ticket = file('neon-rewind-ticket.pdf');
await page.setInputFiles('#af-file', ticket);
await page.waitForSelector('.af-result', { timeout: 10000 });
check('autofill reads the ticket', (await page.textContent('.af-result')).includes('Neon Rewind'));
check('matched to catalogue event', (await page.textContent('.af-result')).includes('Matched to'));
await page.click('[data-af-apply]');
await page.waitForSelector('.notice--ok');
check('apply pre-selects the event', (await page.locator('input[name=event]:checked').count()) === 1);
await page.click('[data-next]');
await page.waitForSelector('#file-panel .file-check');
check('delivery step already has the verified file', (await page.textContent('#file-panel')).includes('verified'));
await page.click('[data-next]');
await page.fill('#price', '10');
await page.click('[data-next]');
await page.waitForSelector('#review-form');
check('review shows AI note', (await page.textContent('.card')).includes('read by AI'));
for (const id of ['own', 'valid', 'price', 'rules']) await page.check('#' + id);
await page.click('button[type=submit]');
await page.waitForSelector('.celebrate');
check('autofilled listing goes live', (await page.textContent('.celebrate')).includes('live'));

// 2. Exact duplicate (same bytes) is blocked
await startSell();
await page.setInputFiles('#af-file', ticket);
await page.waitForSelector('.autofill .notice--warn', { timeout: 10000 });
check(
  'same file again is blocked as a duplicate',
  (await page.textContent('.autofill .notice--warn')).includes('already been listed'),
);

// 3. Unreadable -> manual fallback
await startSell();
await page.setInputFiles('#af-file', file('unreadable.pdf'));
await page.waitForSelector('.autofill .notice--warn', { timeout: 10000 });
check(
  'failed read falls back to manual entry',
  (await page.textContent('.autofill .notice--warn')).includes('choose your event'),
);
check('manual event list still usable', (await page.locator('#ev-list .pick').count()) > 0);

// 4. Event we do not list -> request prefilled
await startSell();
await page.setInputFiles('#af-file', file('cosmic-carnival.pdf'));
await page.waitForSelector('.af-result', { timeout: 10000 });
check('unknown event is not force-matched', (await page.textContent('.af-result')).includes("don't have"));
await page.click('.af-result [data-request]');
await page.waitForSelector('#req-form');
check('request form is pre-filled', (await page.inputValue('#req-form #name')) === 'Cosmic Carnival');
await page.click('[data-close-req]');

// 5. Paste email
await startSell();
await page.click('[data-af-tab=paste]');
await page.fill(
  '#af-text',
  'Your tickets are confirmed!\nEvent: Bassline Sessions\nVenue: Warehouse Nine\nTicket type: General release\nPrice: £15.00',
);
await page.click('[data-af-read]');
await page.waitForSelector('.af-result', { timeout: 10000 });
check('pasted email is parsed and matched', (await page.textContent('.af-result')).includes('Bassline Sessions'));
check('low-confidence fields marked', (await page.locator('.af-result .badge--warn').count()) >= 1);

// 6. AI check flags an edited ticket -> review, not live
await startSell();
await page.locator('#ev-list .pick').first().click();
await page.click('[data-next]');
await page.locator('input[name=delivery][value=pdf]').check({ force: true });
await page.setInputFiles('#ticket-file', file('edited-ticket.pdf'));
await page.waitForFunction(() => document.querySelector('.file-check')?.textContent.includes('verified'), null, {
  timeout: 8000,
});
await page.click('[data-next]');
await page.fill('#price', '5');
await page.click('[data-next]');
await page.waitForSelector('#review-form');
for (const id of ['own', 'valid', 'price', 'rules']) await page.check('#' + id);
await page.click('button[type=submit]');
await page.waitForSelector('.celebrate');
check('edited ticket goes to review, not live', (await page.textContent('.celebrate')).includes('Sent for review'));
check('seller sees what is being double-checked', (await page.textContent('.celebrate')).includes('look edited'));

finish(errors);
await browser.close();
