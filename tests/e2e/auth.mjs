import { launch, go, signIn, check, finish } from './harness.mjs';

const { browser, page, errors } = await launch();
await go(page, '/');
await page.evaluate(() => localStorage.clear());

// Protected route bounces to sign-in with ?next
await go(page, '/account');
await page.waitForURL(/sign-in/);
check('guest on /account is sent to sign-in', page.url().includes('#/sign-in?next=%2Faccount'));

// Bad credentials
await page.fill('#email', 'demo@bham.ac.uk');
await page.fill('#password', 'wrongpass1');
await page.click('button[type=submit]');
await page.waitForSelector('.form-error:not(:empty)');
check('wrong password shows an error', (await page.textContent('.form-error')).includes('Incorrect'));

// Sign-up: non-university email rejected
await go(page, '/sign-up');
await page.fill('#email', 'someone@gmail.com');
await page.fill('#password', 'Password1!');
await page.click('button[type=submit]');
check('non-uni email rejected', (await page.textContent('#email-error')).includes("isn't a supported"));

// Sign-up: full flow
await page.fill('#email', 'newbie@aston.ac.uk');
check('uni detected live', (await page.textContent('#uni-match')).includes('Aston University'));
await page.click('button[type=submit]');
check('18+ must be ticked', (await page.textContent('#age-error')).includes('18'));
await page.check('#age');
await page.check('#terms');
await page.click('button[type=submit]');
await page.waitForSelector('#code');
await page.fill('#code', '000000');
await page.click('button[type=submit]');
await page.waitForSelector('#code-error:not(:empty)');
check('wrong code rejected', true);
await page.fill('#code', '123456');
await page.click('button[type=submit]');
await page.waitForSelector('.header-user');
check('profile named from the email, signed in', (await page.textContent('.header-user')).includes('Newbie'));
check('lands on browse', page.url().includes('#/browse'));

// Sign out & demo sign in
await page.evaluate(() => localStorage.removeItem('ss.session'));
await signIn(page);
check('demo user signs in', (await page.textContent('.header-user')).includes('Alex'));

finish(errors);
await browser.close();
