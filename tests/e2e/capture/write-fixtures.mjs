/**
 * Writes captured runtime values to tests/fixtures/rgb-lib-wasm-<version>/:
 * one module per WasmWallet method, plus errors.mjs. Each sample keeps its
 * source text (BigInt, Map, undefined intact) and its type map.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkgDir = path.dirname(
  require.resolve('@utexo/rgb-lib-wasm/package.json')
);
const pkg = JSON.parse(
  fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')
);
const wasmSha256 = createHash('sha256')
  .update(fs.readFileSync(path.join(pkgDir, 'rgb_lib_wasm_bindings_bg.wasm')))
  .digest('hex');

export const FIXTURE_DIR = path.resolve(
  here,
  `../../fixtures/rgb-lib-wasm-${pkg.version}`
);

/** At most this many samples per method; distinct shapes first. */
const PER_METHOD = 4;

const shape = (types) => Object.keys(types).join('|');

function pick(records) {
  const seen = new Set();
  const byShape = new Map();
  for (const r of records) {
    if (seen.has(r.source)) continue;
    seen.add(r.source);
    const key = shape(r.types);
    if (!byShape.has(key)) byShape.set(key, []);
    byShape.get(key).push(r);
  }
  // One per shape first, then the rest in capture order.
  const firsts = [...byShape.values()].map((list) => list[0]);
  const rest = records.filter((r) => seen.has(r.source) && !firsts.includes(r));
  const out = [];
  for (const r of [...firsts, ...rest]) {
    if (out.length >= PER_METHOD) break;
    if (!out.some((o) => o.source === r.source)) out.push(r);
  }
  return out;
}

const header = (
  meta
) => `// Captured from ${meta.runtime} ${meta.version} by \`npm run capture:fixtures\`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); \`types\` lists the kind at every path.
export const meta = ${JSON.stringify(meta, null, 2)};
`;

export function writeFixtures(records, { capturedAt }) {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const f of fs.readdirSync(FIXTURE_DIR)) {
    if (f.endsWith('.mjs') && !/^(negative|handmade)\.mjs$/.test(f)) {
      fs.rmSync(path.join(FIXTURE_DIR, f));
    }
  }
  const base = {
    runtime: '@utexo/rgb-lib-wasm',
    version: pkg.version,
    wasmSha256,
    source: 'captured',
    capturedAt,
  };
  const values = records.filter((r) => r.ok && r.source !== undefined);
  const methods = [...new Set(values.map((r) => r.method))].sort();
  const written = {};
  for (const method of methods) {
    const samples = pick(values.filter((r) => r.method === method));
    const body = samples
      .map(
        (s) =>
          `  {\n    label: ${JSON.stringify(s.label)},\n    types: ${JSON.stringify(s.types)},\n    value: ${s.source.replace(/\n/g, '\n    ')},\n  },`
      )
      .join('\n');
    fs.writeFileSync(
      path.join(FIXTURE_DIR, `${method}.mjs`),
      `${header({ ...base, method })}\nexport const samples = [\n${body}\n];\n`
    );
    written[method] = samples.length;
  }
  const errors = [];
  for (const r of records.filter((x) => !x.ok)) {
    if (!errors.some((e) => e.method === r.method && e.error === r.error)) {
      errors.push({
        method: r.method,
        label: r.label,
        error: r.error,
        errorKind: r.errorKind,
      });
    }
  }
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'errors.mjs'),
    `${header({ ...base, method: '(rejections)' })}\nexport const samples = ${JSON.stringify(errors, null, 2)};\n`
  );
  written.errors = errors.length;
  return written;
}
