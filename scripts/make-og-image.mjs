// Renders public/og-image.png (1200x630) from a small HTML card using the installed Chrome. Run: node scripts/make-og-image.mjs
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/og-image.png', import.meta.url));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<body style="margin:0;font-family:Inter,system-ui,sans-serif;background:linear-gradient(135deg,#005cb0,#0072d6 60%,#38b6ff);color:#fff;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 90px">
  <div style="font-size:34px;font-weight:800;letter-spacing:-1px;margin-bottom:28px">StudentSwap <span style="font-size:20px;font-weight:700;border:2px solid #fff;border-radius:99px;padding:4px 14px;margin-left:10px;vertical-align:middle">MIDLANDS</span></div>
  <div style="font-size:112px;font-weight:800;line-height:.98;letter-spacing:-4px">Swap tickets.<br>Not <span style="background:#ffb020;color:#0f172a;padding:0 18px;border-radius:14px">scams.</span></div>
  <div style="font-size:30px;margin-top:34px;opacity:.92">Verified students. Never above the original price.</div></body>`);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
