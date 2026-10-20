// Bundles AWS Amplify Auth into public/vendor/amplify-auth.js (or the path given) so it is self-hosted (no CDN).
// Only needed in live mode (USE_MOCKS = false). Run by `npm run build` when Cognito is configured.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  entryPoints: [`${root}src/auth/amplify-entry.js`],
  outfile: process.argv[2] ?? `${root}public/vendor/amplify-auth.js`,
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  logLevel: 'info',
});
