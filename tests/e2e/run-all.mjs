// Runs every browser suite in sequence. Start the app first (npm run dev) and Chrome must be installed.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const suites = readdirSync(dir).filter(
  (f) => f.endsWith('.mjs') && !['harness.mjs', 'run-all.mjs', 'shot.mjs'].includes(f),
);
let failed = 0;
for (const f of suites) {
  const r = spawnSync(process.execPath, [`${dir}${f}`], { encoding: 'utf8', timeout: 180000 });
  const out = `${r.stdout}${r.stderr}`;
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f}  (${(out.match(/^PASS/gm) ?? []).length} checks)`);
  if (!ok)
    console.log(
      out
        .split('\n')
        .filter((l) => /FAIL|ERR|Error|Timeout/.test(l))
        .slice(0, 6)
        .join('\n'),
    );
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
