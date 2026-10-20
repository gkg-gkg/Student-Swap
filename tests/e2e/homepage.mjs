// Homepage sections (On soon near you / mood / Selling fast) and the How it works additions.
import { launch, go, signIn, check, finish } from './harness.mjs';

const { browser, page, errors } = await launch();
await go(page, '/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#soon-slot .ticket');

// Design requirements: one font, softer corners, no numbered labels, carousel in the hero.
const fonts = await page.evaluate(() => [
  ...new Set(
    [...document.querySelectorAll('body *')].map((el) =>
      getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
    ),
  ),
]);
check('one font family on the homepage', fonts.length === 1 && fonts[0] === 'Inter', fonts.join(' | '));
const radius = await page.evaluate(() => ({
  tile: parseFloat(getComputedStyle(document.querySelector('.ticket')).borderTopLeftRadius),
  btn: parseFloat(getComputedStyle(document.querySelector('.btn')).borderTopLeftRadius),
}));
check(
  'boxes and buttons have soft-square corners (8px or less)',
  radius.tile <= 8 && radius.btn <= 8,
  JSON.stringify(radius),
);
check('Buy / Sell / Go section removed', (await page.locator('#how').count()) === 0);
check(
  'no "Now live" banner or uni-email box',
  !(await page.textContent('main')).match(/Now live|Join with your uni email/),
);
check('universities listed in the hero', (await page.locator('.hero__unis li').count()) >= 5);
check('FAQ moved off the homepage', (await page.locator('#faq').count()) === 0);
check('no numbered section labels (01 / ...)', !(await page.textContent('main')).match(/\b0\d\s*\/\s*[A-Z]/));
check('no eyebrow labels on the homepage', (await page.locator('main .eyebrow').count()) === 0);
if (page.viewportSize().width >= 960) {
  await page.waitForSelector('.hero__cols .ticket');
  check('hero shows the vertical ticket carousel', (await page.locator('.hero__cols .vcol').count()) === 2);
} else {
  check('no ticket marquee in the hero on phones', (await page.locator('.hero .marquee').count()) === 0);
}
check('no alternating section backgrounds', (await page.locator('main .section--deep').count()) === 0);
check(
  'highlight only on key words',
  (await page.locator('main .mark').count()) === 2,
  String(await page.locator('main .mark').count()),
);

const heading = (id) => page.textContent(`#${id} h2`);
check('"On soon near you" section', (await heading('soon')).includes('On soon'));
check('soon carousel holds 8 cards', (await page.locator('#soon-slot .ticket').count()) === 8);
check('soon cards have no "Selling fast" sticker', (await page.locator('#soon-slot .sticker--coral').count()) === 0);
check('carousel starts with prev disabled', await page.isDisabled('.carousel__btn--prev'));
await page.click('.carousel__btn--next');
await page
  .waitForFunction(() => !document.querySelector('.carousel__btn--prev').disabled, null, { timeout: 3000 })
  .catch(() => {});
check('next arrow scrolls the carousel', !(await page.isDisabled('.carousel__btn--prev')));
check('week strip shows 7 days', (await page.locator('#week-slot > li').count()) === 7);
check('week days name their venues', (await page.locator('#week-slot .week__venues li').count()) >= 1);
check('"What are you in the mood for?" section', (await heading('mood')).includes('mood'));
check('mood has the four event types', (await page.locator('#mood .mood').count()) === 4);
check('"Selling fast" section', (await heading('selling-fast')).includes('Selling fast'));
await page.waitForSelector('#fast-slot .ticket');
const fastCards = await page.locator('#fast-slot .ticket').count();
check('selling fast shows cards', fastCards >= 1 && fastCards <= 4, `(${fastCards})`);
check(
  'every selling-fast card is flagged',
  (await page.locator('#fast-slot .ticket:has-text("Selling fast")').count()) === fastCards,
);

// Mood card -> browse pre-filtered
await page.click('#mood a[href="#/browse?type=club_night"]');
await page.waitForFunction(
  () => document.querySelector('#count')?.textContent.includes('event') && !document.querySelector('.skeleton--event'),
);
check('mood link filters browse by type', (await page.inputValue('#type')) === 'club_night');
check('browse shows only that type', (await page.locator('.grid-cards .ticket').count()) >= 1);

// Personalised for a signed-in student (demo is at Birmingham)
await signIn(page);
await go(page, '/');
await page.waitForSelector('#soon-slot .ticket');
const sub = await page.textContent('#soon-sub');
{
  check("subtitle names the student's university", sub.includes('Birmingham'));
  const first = await page.locator('#soon-slot .ticket').first().textContent();
  check("student's own city comes first", first.includes('Birmingham'), first.slice(0, 40));
}

// How it works additions
await go(page, '/how-it-works');
await page.waitForSelector('.flow');
check('ticket journey has 5 steps', (await page.locator('.flow__step').count()) === 5);
check('journey names who acts', (await page.textContent('.flow')).includes('StudentSwap'));
check('group chat vs StudentSwap table', (await page.locator('.compare tbody tr').count()) === 5);
check('table has both columns', (await page.textContent('.compare thead')).includes('Group chat'));
check('safety content is still there', (await page.textContent('#safety')).includes('Verified students only'));
check('ticket checks merged into safety', (await page.textContent('#safety')).includes('Scanned on upload'));
check(
  'journey steps are numbered 1 to 5',
  (await page.textContent('.flow')).match(/1[\s\S]*2[\s\S]*3[\s\S]*4[\s\S]*5/) !== null,
);
check('FAQ at the bottom of How it works', (await page.locator('#faq details').count()) >= 4);

finish(errors);
await browser.close();
