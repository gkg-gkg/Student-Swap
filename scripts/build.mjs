// Static build: write config from env vars, optionally bundle Amplify, then copy the site into dist/.
// There is no compile step for our own code (plain ES modules), so dist/ is a straight copy.
import { cp, rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (script, ...args) =>
  execFileSync(process.execPath, [`${root}scripts/${script}`, ...args], { stdio: 'inherit', env: process.env });

await rm(`${root}dist`, { recursive: true, force: true });
await mkdir(`${root}dist`, { recursive: true });
await cp(`${root}index.html`, `${root}dist/index.html`);
await cp(`${root}robots.txt`, `${root}dist/robots.txt`);
for (const dir of ['src', 'public'])
  await cp(`${root}${dir}`, `${root}dist/${dir}`, { recursive: true, filter: (p) => !/\.test\.js$/.test(p) });
// Config for this build comes from environment variables; the dev copy in src/ is left untouched.
run('write-env.mjs');
if (process.env.COGNITO_USER_POOL_ID && process.env.STUDENTSWAP_USE_MOCKS !== 'true')
  run('bundle-amplify.mjs', `${root}dist/public/vendor/amplify-auth.js`);
console.log('build: dist/ ready');
