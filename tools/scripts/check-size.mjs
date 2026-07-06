/**
 * Bundle-size gate (spec §6): core ≤ 18KB gz, Angular wrapper ≤ 6KB gz.
 * Measures the gzipped ESM entry chain of each built package.
 *
 * Usage: node tools/scripts/check-size.mjs <core|ngx>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { transformSync } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const TARGETS = {
  core: {
    dir: 'dist/packages/quill-ink-core',
    budgetKb: 18,
    // rollup output: measure the ESM bundle (what bundlers consume)
    match: (f) => f.endsWith('.esm.js') || f.endsWith('.mjs'),
    exclude: (f) => f.includes('.cjs') || f.includes('.map'),
  },
  ngx: {
    dir: 'dist/packages/ngx-quill-ink',
    budgetKb: 6,
    // ng-packagr: measure the FESM2022 bundle only (what bundlers consume)
    match: (f) => f.includes('fesm2022') && f.endsWith('.mjs'),
    exclude: (f) => f.includes('.map'),
  },
};

function collect(dir, match, exclude, files = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) collect(p, match, exclude, files);
    else if (match(p) && !exclude(p)) files.push(p);
  }
  return files;
}

const which = process.argv[2];
const target = TARGETS[which];
if (!target) {
  console.error(`usage: check-size.mjs <${Object.keys(TARGETS).join('|')}>`);
  process.exit(2);
}

const dir = resolve(root, target.dir);
const files = collect(dir, target.match, target.exclude);
if (!files.length) {
  console.error(`no bundle files found under ${dir} — build first`);
  process.exit(2);
}

let total = 0;
for (const f of files) {
  // consumers minify: measure minified+gz (the real bundle impact)
  const { code } = transformSync(readFileSync(f, 'utf8'), { minify: true });
  const gz = gzipSync(Buffer.from(code)).length;
  total += gz;
  console.log(`  ${(gz / 1024).toFixed(2).padStart(7)} KB min+gz  ${f.slice(root.length + 1)}`);
}
const kb = total / 1024;
const ok = kb <= target.budgetKb;
console.log(`${which}: ${kb.toFixed(2)}KB gz (budget ${target.budgetKb}KB) ${ok ? 'OK' : 'OVER BUDGET'}`);
process.exit(ok ? 0 : 1);
