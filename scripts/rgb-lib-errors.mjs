#!/usr/bin/env node
// Generates the rgb-lib-wasm error table from the pinned Rust source.
//
//   node scripts/rgb-lib-errors.mjs [--check] [--source <rgb-lib-wasm checkout>]
//
// The source defaults to $RGB_LIB_WASM_SRC. It must be at RUST_COMMIT. Reads
// the public `pub enum Error` of src/error.rs (not IndexerError or
// InternalError: those reach JS wrapped in a public variant) and the
// binding's own messages in bindings/wasm/src/lib.rs. Writes:
//   src/runtime/rgb-lib-messages.generated.ts  message pattern → variant → code
//   tests/fixtures/error-texts/rgb-lib-wasm-<v>.mjs  every text, for tests
// --check compares instead of writing and fails on any difference.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '1.0.0-beta.4';
const RUST_COMMIT = 'f0e266f039744896baa39e3a35766ef01c0f369a'; // tag v1.0.0-beta.4

/**
 * Texts that several sources produce with different codes. Each needs a
 * decision here; any other ambiguity fails the generator.
 */
const AMBIGUOUS = {
  'Invalid expiration': {
    variant: 'InvalidExpiration',
    code: 'INVALID_PARAMS',
    reason:
      'ExpirationInvalid (NATIVE_ERROR by the rgb-lib-rn rule) and InvalidExpiration print the same text; both reject the expiration the caller passed, and the earlier prefix rule gave INVALID_PARAMS',
  },
};

/** The rgb-lib-rn rule (rgb-lib-rn/src/wallet/rgb-lib/errors.ts), plus Offline. */
function codeOf(source, variant) {
  if (source === 'binding') return 'INVALID_PARAMS';
  if (variant === 'AssetNotFound') return 'ASSET_NOT_FOUND';
  if (variant === 'WatchOnly') return 'UNSUPPORTED_CAPABILITY';
  // Kept from the earlier prefix rule; rgb-lib-rn reports NATIVE_ERROR here.
  if (variant === 'Offline') return 'WALLET_OFFLINE';
  if (variant.startsWith('Invalid')) return 'INVALID_PARAMS';
  if (variant.startsWith('Insufficient')) return 'INSUFFICIENT_FUNDS';
  return 'NATIVE_ERROR';
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const at = args.indexOf('--source');
const source = at >= 0 ? args[at + 1] : process.env.RGB_LIB_WASM_SRC;
if (!source)
  fail('pass --source <rgb-lib-wasm checkout> or set RGB_LIB_WASM_SRC');

function fail(message) {
  console.error(`rgb-lib-errors: ${message}`);
  process.exit(1);
}

const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
if (head !== RUST_COMMIT)
  fail(`${source} is at ${head}, expected ${RUST_COMMIT} (v${VERSION})`);

function unescape(text) {
  return text.replace(/\\(["\\'n])/g, (_, c) => (c === 'n' ? '\n' : c));
}

/**
 * The public Error variants with their `#[error("…")]` texts, and for a
 * struct variant its fields with their Rust types (null for a unit variant).
 */
function publicErrors() {
  const file = 'src/error.rs';
  const lines = readFileSync(join(source, file), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('pub enum Error {'));
  const end = lines.findIndex((l, i) => i > start && l === '}');
  if (start < 0 || end < 0) fail(`no pub enum Error in ${file}`);
  const out = [];
  let text;
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('#[error')) {
      const m = /^#\[error\("((?:[^"\\]|\\.)*)"\)\]$/.exec(line);
      if (!m) fail(`${file}:${i + 1}: unsupported #[error] form: ${line}`);
      if (text !== undefined) fail(`${file}:${i + 1}: two #[error] in a row`);
      text = { text: unescape(m[1]), line: i + 1 };
      continue;
    }
    const v = /^([A-Z][A-Za-z0-9]*)(\s*\{|,)$/.exec(line);
    if (!v) {
      if (/^[A-Z]/.test(line))
        fail(`${file}:${i + 1}: unsupported variant form: ${line}`);
      continue;
    }
    if (text === undefined) fail(`${file}:${i + 1}: ${v[1]} has no #[error]`);
    let fields = null;
    if (v[2].trim() === '{') {
      fields = {};
      for (i += 1; lines[i].trim() !== '},'; i += 1) {
        const f = lines[i].trim();
        if (f === '' || f.startsWith('///') || f.startsWith('#[')) continue;
        const m = /^([a-z_][a-z0-9_]*): ([A-Za-z0-9_<>, ]+),$/.exec(f);
        if (!m) fail(`${file}:${i + 1}: unsupported field: ${f}`);
        fields[m[1]] = m[2];
      }
    }
    out.push({ source: 'error', variant: v[1], ...text, file, fields });
    text = undefined;
  }
  return out;
}

/**
 * The binding's own error texts: `JsValue::from_str(&format!("…", …))`, and
 * `Err(JsValue::from_str("…"))` (other `from_str("…")` calls are object keys).
 */
function bindingErrors() {
  const file = 'bindings/wasm/src/lib.rs';
  const text = readFileSync(join(source, file), 'utf8');
  const re =
    /(?:JsValue::from_str\(\s*&format!\(|Err\(JsValue::from_str\()\s*"((?:[^"\\]|\\.)*)"/g;
  const seen = new Map();
  for (const m of text.matchAll(re)) {
    const message = unescape(m[1]);
    if (seen.has(message)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    seen.set(message, { source: 'binding', text: message, line, file });
  }
  return [...seen.values()].map((e) => ({
    ...e,
    variant: `Binding: ${e.text.replace(/[:,] .*$/s, '')}`,
  }));
}

const PLACEHOLDER = /\{\{|\}\}|\{[A-Za-z0-9_]*\}/g;

/** The text as an anchored pattern; a `{field}` matches any text. */
function patternOf(text) {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    out += escape(text.slice(last, m.index));
    out += m[0] === '{{' ? '\\{' : m[0] === '}}' ? '\\}' : '[\\s\\S]*';
    last = m.index + m[0].length;
  }
  return `^${out}${escape(text.slice(last))}$`;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** The text as rgb-lib prints it, with `fill` for every field. */
function sampleOf(text, fill) {
  return text.replace(PLACEHOLDER, (m) =>
    m === '{{' ? '{' : m === '}}' ? '}' : fill
  );
}

/** Literal parts of the text, which the compiled .wasm must contain. */
function literals(text) {
  return text
    .split(PLACEHOLDER)
    .map((s) => s.replace(/\{\{/g, '{').replace(/\}\}/g, '}'))
    .filter((s) => s.length >= 4);
}

const entries = [...publicErrors(), ...bindingErrors()].map((e) => ({
  ...e,
  code: codeOf(e.source, e.variant),
  pattern: patternOf(e.text),
}));

// The texts must come from the same build as the installed runtime.
const require = createRequire(join(root, 'package.json'));
const pkg = require.resolve('@utexo/rgb-lib-wasm/package.json');
const installed = JSON.parse(readFileSync(pkg, 'utf8')).version;
if (installed !== VERSION)
  fail(`installed runtime is ${installed}, not ${VERSION}`);
const wasm = readFileSync(
  join(dirname(pkg), 'rgb_lib_wasm_bindings_bg.wasm')
).toString('latin1');
const missing = entries.flatMap((e) =>
  literals(e.text)
    .filter((part) => !wasm.includes(Buffer.from(part).toString('latin1')))
    .map((part) => `${e.variant}: "${part}"`)
);
if (missing.length)
  fail(`texts not in the installed .wasm:\n  ${missing.join('\n  ')}`);

// Each entry's sample text must resolve to that entry's code, unless an
// explicit AMBIGUOUS decision covers it.
const byText = new Map();
for (const e of entries) {
  const list = byText.get(e.text) ?? [];
  list.push(e);
  byText.set(e.text, list);
}
const table = [];
for (const [text, list] of byText) {
  const codes = new Set(list.map((e) => e.code));
  if (codes.size === 1) {
    if (list[0].code !== 'NATIVE_ERROR') table.push(list[0]);
    continue;
  }
  const decision = AMBIGUOUS[text];
  if (!decision)
    fail(
      `"${text}" is produced by ${list.map((e) => `${e.variant} (${e.code})`).join(', ')}: add an AMBIGUOUS decision`
    );
  const chosen = list.find((e) => e.variant === decision.variant);
  if (!chosen || chosen.code !== decision.code)
    fail(`AMBIGUOUS decision for "${text}" names no matching variant`);
  if (chosen.code !== 'NATIVE_ERROR') table.push(chosen);
}
for (const text of Object.keys(AMBIGUOUS))
  if (!byText.has(text) || byText.get(text).length < 2)
    fail(`AMBIGUOUS "${text}" is no longer ambiguous: remove it`);

const compiled = table.map((e) => ({ ...e, re: new RegExp(e.pattern) }));
function resolveCode(message) {
  const hits = compiled.filter((e) => e.re.test(message));
  const codes = new Set(hits.map((e) => e.code));
  if (codes.size > 1)
    fail(
      `"${message}" matches ${hits.map((e) => `${e.variant} (${e.code})`).join(', ')}`
    );
  return hits[0]?.code ?? 'NATIVE_ERROR';
}
// Two fills: an empty field, and one that looks like other texts.
const FILLS = ['', 'x', "Invalid details: needed '1', available '2'"];
for (const e of entries) {
  const expected = AMBIGUOUS[e.text]?.code ?? e.code;
  for (const fill of FILLS) {
    const got = resolveCode(sampleOf(e.text, fill));
    if (got !== expected)
      fail(
        `${e.variant} "${sampleOf(e.text, fill)}" resolves to ${got}, not ${expected}`
      );
  }
}

const banner = `// Generated by scripts/rgb-lib-errors.mjs from rgb-lib-wasm v${VERSION}
// (${RUST_COMMIT}). Do not edit; run \`npm run errors:generate\`.`;

const tableTs = `${banner}
//
// rgb-lib-wasm rejects with the error's display text only. Each row is a text
// whose code is not NATIVE_ERROR: [variant, code, pattern]. A {field} in the
// Rust text matches any text.
import type { RgbLibWebErrorCode } from '../errors.js';

export const RGB_LIB_WASM_VERSION = '${VERSION}';

/**
 * The variants of the public \`Error\` enum (src/error.rs): null for a unit
 * variant, else each field with its Rust type. Fields are snake_case: the
 * enum has no \`rename_all\`.
 */
export const RGB_LIB_ERROR_VARIANTS: Readonly<
  Record<string, Readonly<Record<string, string>> | null>
> = {
${entries
  .filter((e) => e.source === 'error')
  .map(
    (e) => `  ${e.variant}: ${e.fields ? JSON.stringify(e.fields) : 'null'},`
  )
  .join('\n')}
};

export const RGB_LIB_MESSAGES: ReadonlyArray<
  readonly [variant: string, code: RgbLibWebErrorCode, pattern: RegExp]
> = [
${table.map((e) => `  [${JSON.stringify(e.variant)}, '${e.code}', /${e.pattern}/],`).join('\n')}
];
`;

const textsMjs = `${banner}
//
// Every error text of the public Error enum and of the binding, with the code
// RgbLibWeb must give it. \`sample\` fills each {field} with "x".

export const meta = {
  runtime: '@utexo/rgb-lib-wasm',
  version: '${VERSION}',
  rustCommit: '${RUST_COMMIT}',
  ambiguous: ${JSON.stringify(AMBIGUOUS, null, 2).replace(/\n/g, '\n  ')},
};

export const texts = [
${entries
  .map((e) =>
    [
      '  {',
      `    source: '${e.source}',`,
      `    variant: ${JSON.stringify(e.variant)},`,
      `    at: '${e.file}:${e.line}',`,
      `    text: ${JSON.stringify(e.text)},`,
      `    sample: ${JSON.stringify(sampleOf(e.text, 'x'))},`,
      `    code: '${AMBIGUOUS[e.text]?.code ?? e.code}',`,
      '  },',
    ].join('\n')
  )
  .join('\n')}
];
`;

const outputs = [
  [join(root, 'src/runtime/rgb-lib-messages.generated.ts'), tableTs],
  [
    join(root, `tests/fixtures/error-texts/rgb-lib-wasm-${VERSION}.mjs`),
    textsMjs,
  ],
];
let stale = false;
for (const [path, content] of outputs) {
  let current;
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    current = undefined;
  }
  if (check) {
    if (current !== content) {
      console.error(`rgb-lib-errors: ${path} is out of date`);
      stale = true;
    }
  } else if (current !== content) {
    writeFileSync(path, content);
    console.log(`wrote ${path}`);
  }
}
const counts = entries.reduce((n, e) => ((n[e.source] += 1), n), {
  error: 0,
  binding: 0,
});
console.log(
  `${counts.error} Error variants, ${counts.binding} binding texts, ${table.length} table rows`
);
if (stale) process.exit(1);
