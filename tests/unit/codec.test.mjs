// codec.ts (ADR-0002): the field tables and the schema check. The codec is
// bundled here from src/ on its own, so the tests can call its decoders.
// The public results themselves are checked by the golden tests, through the
// engine (the equality test of step 2 was removed when the engine moved to
// the codec in step 3).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { collectCases, loadFixtures } from '../golden/runner.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const outDir = fs.mkdtempSync(path.join(root, 'tests/.codec-'));
let codec;
let generated;

before(async () => {
  await build({
    entryPoints: {
      codec: path.join(root, 'src/runtime/codec.ts'),
      generated: path.join(root, 'src/runtime/rgb-lib-messages.generated.ts'),
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    packages: 'external',
    outdir: outDir,
    outExtension: { '.js': '.mjs' },
    logLevel: 'silent',
  });
  codec = await import(pathToFileURL(path.join(outDir, 'codec.mjs')).href);
  generated = await import(
    pathToFileURL(path.join(outDir, 'generated.mjs')).href
  );
});
after(() => fs.rmSync(outDir, { recursive: true, force: true }));

const mods = await loadFixtures();
const cases = collectCases(mods);

/** Per WasmWallet method: decode, then project, as the public call does. */
const PROJECT = {
  getBtcBalance: (c, v) => c.publicBtcBalance(c.decodeBtcBalance(v)),
  getAssetBalance: (c, v) => c.publicBalance(c.decodeBalance(v)),
  listAssets: (c, v) => c.publicAssets(c.decodeAssets(v)),
  listUnspents: (c, v) => c.decodeUnspents(v).map(c.publicUnspent),
  listTransactions: (c, v) => c.decodeTransactions(v).map(c.publicTransaction),
  listTransfers: (c, v) => c.decodeTransfers(v).map(c.publicTransfer),
  issueAssetNia: (c, v) => c.publicNia(c.decodeNia(v)),
  issueAssetIfa: (c, v) => c.publicIfa(c.decodeIfa(v)),
  blindReceive: (c, v) => c.publicReceive(c.decodeReceive(v)),
  witnessReceive: (c, v) => c.publicReceive(c.decodeReceive(v)),
  invoiceData: (c, v) =>
    c.publicInvoice(c.decodeInvoice(v), 'rgb:golden-invoice'),
  sendEnd: (c, v) => c.publicOperation(c.decodeOperation(v)),
  inflateEnd: (c, v) => c.publicOperation(c.decodeOperation(v)),
  refresh: (c, v) => c.publicRefresh(c.decodeRefresh(v)),
  getFeeEstimation: (c, v) => c.publicFeeEstimate(c.decodeFeeEstimate(v)),
};
/** Scalar results the codec does not decode: a string, a count, a flag. */
const SCALARS = new Set([
  'getAddress',
  'createUtxosEnd',
  'sendBtcEnd',
  'failTransfers',
]);

function outcome(run) {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    assert.ok(isEngineError(error), String(error));
    return { ok: false, code: error.code, message: error.message };
  }
}
describe('codec field tables', () => {
  it('decode every fixture method', () => {
    for (const c of cases)
      assert.ok(
        c.method in PROJECT || SCALARS.has(c.method),
        `no decoder for ${c.method}`
      );
  });

  it('name existing structs, and every method a fixture has', () => {
    for (const [name, table] of Object.entries(codec.FIELDS)) {
      assert.equal(typeof table.rust, 'string', name);
      for (const [field, child] of Object.entries(table.nested ?? {})) {
        assert.ok(field in table.fields, `${name}.${field}`);
        assert.ok(child in codec.FIELDS, `${name}.${field} → ${child}`);
      }
      for (const [field, use] of Object.entries(table.fields))
        assert.ok(
          typeof use === 'string' && use.length > 0,
          `${name}.${field} needs a use`
        );
    }
    for (const file of Object.keys(mods)) {
      if (['errors', 'handmade', 'negative'].includes(file)) continue;
      assert.ok(file in codec.RESULTS, `RESULTS has no ${file}`);
    }
  });

  it('know every field of every captured and handmade value', () => {
    const values = [
      ...Object.entries(mods)
        .filter(([f]) => !['errors', 'handmade', 'negative'].includes(f))
        .flatMap(([method, mod]) =>
          mod.samples.map((s) => [method, s.label, s.value])
        ),
      ...mods.handmade.cases.map((c) => [c.method, c.label, c.value]),
    ];
    for (const [method, label, value] of values) {
      const struct = codec.RESULTS[method];
      if (!struct) continue;
      assert.deepEqual(
        codec.unknownFields(struct, value),
        [],
        `${method}: ${label}`
      );
    }
  });

  it('find each unknown field', () => {
    const cases_ = mods.negative.cases.filter((x) => x.kind === 'unknown-key');
    assert.ok(cases_.length >= 2);
    for (const c of cases_) {
      const found = codec.unknownFields(codec.RESULTS[c.method], c.value);
      assert.equal(found.length, 1, `${c.label}: ${found.join(', ')}`);
    }
  });

  it('find an unknown refresh failure variant', () => {
    const value = new Map([[1, { failure: 'ImaginaryVariant' }]]);
    assert.deepEqual(codec.unknownFields('RefreshedTransfer', value), [
      '${0}.failure.ImaginaryVariant',
    ]);
  });

  it('accept each beta.4 AssetSchema in a failure, and only those', () => {
    const failure = (schema) =>
      new Map([
        [
          1,
          {
            updatedStatus: 'Failed',
            failure: { UnsupportedSchema: { asset_schema: schema } },
          },
        ],
      ]);
    for (const schema of ['Nia', 'Ifa', 'Bfa']) {
      const [entry] = codec.decodeRefresh(failure(schema));
      assert.equal(
        entry.failure.message,
        `UnsupportedSchema (asset_schema: ${schema})`
      );
    }
    for (const schema of ['Cfa', 'Uda', 'nia']) {
      const result = outcome(() => codec.decodeRefresh(failure(schema)));
      assert.equal(result.code, 'INVALID_NATIVE_RESPONSE', schema);
    }
  });

  it('handle every field type of the generated Error variants', () => {
    const types = new Set(
      Object.values(generated.RGB_LIB_ERROR_VARIANTS).flatMap((f) =>
        Object.values(f ?? {})
      )
    );
    assert.deepEqual(
      [...types].filter((t) => !codec.ERROR_FIELD_TYPES.includes(t)),
      []
    );
    assert.equal(Object.keys(generated.RGB_LIB_ERROR_VARIANTS).length, 136);
  });

  /**
   * Structs the fixtures do not pass through a struct table, and why. Every
   * other struct must be seen in a captured or handmade value.
   */
  const NOT_SEEN = {
    SendBeginResult: 'read by the session (psbt only), no codec decoder',
    BurnBeginResult:
      'read by the burn operation (psbt only), no codec decoder; the stand has no burn fixture',
    AssignmentsCollection:
      'inside a refresh failure; its text is checked by the golden nested-failure test',
  };

  it('read exactly the mapped and internal fields, and fixtures have them all', () => {
    // Every plain object in a fixture is wrapped in a Proxy that records the
    // keys a decoder touches (get, has, own-property checks), per struct.
    const reads = {};
    const seen = {};
    const touch = (struct, key) => {
      if (typeof key === 'string') (reads[struct] ??= new Set()).add(key);
    };
    const wrap = (struct, value) => {
      if (value === null || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.map((v) => wrap(struct, v));
      if (value instanceof Map)
        return new Map([...value].map(([k, v]) => [k, wrap(struct, v)]));
      const table = codec.FIELDS[struct];
      const copy = {};
      seen[struct] ??= new Set();
      for (const [k, v] of Object.entries(value)) {
        const child = table.nested?.[k];
        copy[k] = child ? wrap(child, v) : v;
        seen[struct].add(k);
      }
      return new Proxy(copy, {
        get(target, key, receiver) {
          touch(struct, key);
          return Reflect.get(target, key, receiver);
        },
        has(target, key) {
          touch(struct, key);
          return Reflect.has(target, key);
        },
        getOwnPropertyDescriptor(target, key) {
          touch(struct, key);
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
    };
    const samples = [
      ...Object.entries(mods)
        .filter(([f]) => f in PROJECT)
        .flatMap(([method, mod]) => mod.samples.map((s) => [method, s.value])),
      ...mods.handmade.cases.map((c) => [c.method, c.value]),
    ];
    for (const [method, value] of samples) {
      const struct = codec.RESULTS[method];
      if (!struct) continue;
      const result = outcome(() =>
        PROJECT[method](codec, wrap(struct, structuredClone(value)))
      );
      assert.ok(result.ok, `${method}: ${result.message}`);
    }
    for (const [struct, table] of Object.entries(codec.FIELDS)) {
      if (struct in NOT_SEEN) {
        assert.equal(
          seen[struct],
          undefined,
          `${struct} is seen: drop it from NOT_SEEN`
        );
        continue;
      }
      assert.ok(seen[struct], `no fixture has a ${struct}`);
      const used = Object.entries(table.fields)
        .filter(([, use]) => use === 'mapped' || use === 'internal')
        .map(([k]) => k)
        .sort();
      const missing = used.filter((k) => !seen[struct].has(k));
      assert.deepEqual(missing, [], `${struct}: fields no fixture has`);
      const touched = [...(reads[struct] ?? [])].filter((k) =>
        Object.hasOwn(table.fields, k)
      );
      assert.deepEqual(touched.sort(), used, `${struct}: fields read`);
    }
  });

  it('connect every table to a result (graph only, no fixtures)', () => {
    const reached = new Set(Object.keys(NOT_SEEN));
    const walk = (struct) => {
      if (reached.has(struct)) return;
      reached.add(struct);
      Object.values(codec.FIELDS[struct].nested ?? {}).forEach(walk);
    };
    Object.values(codec.RESULTS).filter(Boolean).forEach(walk);
    assert.deepEqual(
      Object.keys(codec.FIELDS).filter((s) => !reached.has(s)),
      []
    );
  });
});
