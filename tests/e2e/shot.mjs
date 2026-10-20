// Usage: node tests/e2e/shot.mjs <hash-route> <width> <out.png> [--user=email] [--full]
import { launch, go, signIn } from './harness.mjs';
const [route, width, out, ...flags] = process.argv.slice(2);
const user = flags.find((f) => f.startsWith('--user='))?.slice(7);
const { browser, page, errors } = await launch({ width: Number(width), height: 900 });
if (user) await signIn(page, user);
await go(page, route);
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: flags.includes('--full') });
if (errors.length) console.log(errors.join('\n'));
await browser.close();
