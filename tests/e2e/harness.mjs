// Tiny Playwright helper for local smoke tests. Uses the installed Google Chrome (no browser download).
// Run the app first: npm run dev   (http://localhost:5173)
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** @param {{ width?: number, height?: number }} [size] */
export async function launch({ width = 1280, height = 900 } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  return { browser, context, page, errors };
}

export const go = (page, hash) =>
  page.goto(`${BASE}/index.html#${hash}`).then(() => page.waitForLoadState('networkidle'));

/** Sign in through the real form. */
export async function signIn(page, email = 'demo@bham.ac.uk', password = 'Password1!') {
  await go(page, '/sign-in');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForSelector('.header-user', { timeout: 5000 });
}

let failed = 0;
export function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
}
export const finish = (errors = []) => {
  for (const e of errors) console.log('  ERR', e);
  console.log(failed || errors.length ? `\n${failed} failed, ${errors.length} browser errors` : '\nAll good');
  process.exit(failed || errors.length ? 1 : 0);
};
