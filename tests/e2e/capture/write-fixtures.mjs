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

/** Samples per method at least; every distinct shape is kept even beyond it. */
const PER_METHOD = 4;

/**
 * Methods whose results may fail to encode, method → reason. Empty: every
 * recorded value must be kept, or the capture fails.
 */
const ALLOWED_SKIPS = {};

/**
 * The shape of one value: every path with its kind, array and Map positions
 * folded, so two lists of different length have one shape, while a field
 * that is `bigint` in one sample and `undefined` in another makes two.
 */
export function shape(types) {
  const parts = Object.entries(types).map(
    ([p, kind]) =>
      `${p
        .replace(/\[\d+\]/g, '[]')
        .replace(/<\d+>/g, '<>')
        .replace(/\{\d+\}/g, '{}')}:${kind}`
  );
  return [...new Set(parts)].sort().join('|');
}

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
  // Every distinct shape, then the rest in capture order up to PER_METHOD.
  const out = [...byShape.values()].map((list) => list[0]);
  for (const list of byShape.values()) {
    for (const r of list.slice(1)) {
      if (out.length >= PER_METHOD) break;
      out.push(r);
    }
  }
  return { samples: out, shapes: byShape.size };
}

const header = (
  meta
) => `// Captured from ${meta.runtime} ${meta.version} by \`npm run capture:fixtures\`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); \`types\` lists the kind at every path.
export const meta = ${JSON.stringify(meta, null, 2)};
`;

export function writeFixtures(records, { capturedAt }) {
  // Fail before the old fixtures are removed.
  const skipped = records.filter(
    (r) => r.skipped !== undefined && !(r.method in ALLOWED_SKIPS)
  );
  if (skipped.length > 0) {
    throw new Error(
      `values that cannot be kept exactly:\n${skipped
        .map((r) => `  ${r.method} (${r.label}): ${r.skipped}`)
        .join('\n')}`
    );
  }
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
    const { samples, shapes } = pick(values.filter((r) => r.method === method));
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
    written[method] = { samples: samples.length, shapes };
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
