/* global axe -- injected into the page by addScriptTag */
// WCAG 2.x A/AA audit with axe-core on the main pages, signed out, signed in and as admin.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, go, signIn, finish, check } from './harness.mjs';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const PUBLIC = [
  '/',
  '/browse',
  '/event/evt-bassline',
  '/sell',
  '/how-it-works',
  '/fees',
  '/faq',
  '/contact',
  '/terms',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/seller/u-s1',
  '/nope',
];
const USER = [
  '/account/tickets',
  '/account/listings',
  '/account/offers',
  '/account/orders',
  '/account/payouts',
  '/account/notifications',
  '/account/settings',
  '/orders/o-1',
  '/orders/o-3/report',
  '/reports/r-1',
  '/sell/new',
];
const ADMIN = ['/admin', '/admin/listings', '/admin/reports', '/admin/events'];

async function audit(page, route, label) {
  await go(page, route);
  await page.waitForTimeout(900);
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(() =>
    axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }),
  );
  const bad = result.violations;
  check(`${label} ${route}`, bad.length === 0, bad.map((v) => `${v.id}(${v.nodes.length})`).join(' '));
  for (const v of bad)
    for (const n of v.nodes.slice(0, 2))
      console.log(
        `     ${v.id}: ${n.target.join(' ')}  ${(n.any[0]?.message ?? n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 130)}`,
      );
}

for (const [width, label] of [
  [1280, 'desktop'],
  [375, 'mobile'],
]) {
  const { browser, page, errors } = await launch({ width });
  await page.goto('http://localhost:5173/index.html');
  await page.evaluate(() => localStorage.clear());
  for (const r of PUBLIC) await audit(page, r, label);
  await signIn(page);
  for (const r of USER) await audit(page, r, label);
  await page.evaluate(() => localStorage.removeItem('ss.session'));
  await signIn(page, 'admin@bham.ac.uk');
  for (const r of ADMIN) await audit(page, r, label);
  await browser.close();
  if (errors.length) console.log(errors.slice(0, 3).join('\n'));
}
finish();
