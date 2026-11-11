// codec.ts (ADR-0002 step 2): the field tables, the schema check, and a
// temporary equality test. Nothing calls the codec yet, so it is bundled here
// from src/ on its own.
//
// The equality test: for every fixture case, the codec's public projection
// must equal the golden result, which is what the current readers and
// mappers give through the engine. Step 3 moves each value family to the
// codec and deletes its rows here; the golden tests stay the reference.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { golden } from '../golden/rgb-lib-wasm-1.0.0-beta.4.golden.mjs';
import { collectCases, loadFixtures } from '../golden/runner.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const outDir = fs.mkdtempSync(path.join(root, 'tests/.codec-'));
let codec;

before(async () => {
  const outfile = path.join(outDir, 'codec.mjs');
  await build({
    entryPoints: [path.join(root, 'src/codec.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    packages: 'external',
    outfile,
    logLevel: 'silent',
  });
  codec = await import(pathToFileURL(outfile).href);
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
function expected(result) {
  return result.ok
    ? result
    : { ok: false, code: result.code, message: result.message };
}

describe('codec public projection equals the current readers and mappers', () => {
  it('covers every fixture method', () => {
    for (const c of cases)
      assert.ok(
        c.method in PROJECT || SCALARS.has(c.method),
        `no projection for ${c.method}`
      );
  });

  for (const c of cases.filter((x) => x.method in PROJECT)) {
    it(c.name, () => {
      const got = outcome(() =>
        PROJECT[c.method](codec, structuredClone(c.value))
      );
      assert.deepStrictEqual(got, expected(golden[c.name].result));
    });
  }
});

describe('codec field tables', () => {
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

  it('find an unknown field', () => {
    const c = mods.negative.cases.find((x) => x.kind === 'unknown-key');
    const found = codec.unknownFields(codec.RESULTS[c.method], c.value);
    assert.equal(found.length, 1, found.join(', '));
  });

  it('list exactly the fields the decoders read', () => {
    // Every plain object in a fixture is wrapped in a Proxy that records the
    // keys a decoder reads, per struct. The reads must be the table's
    // `mapped` and `internal` fields: a dropped field is never read, and a
    // field the table calls mapped is read.
    const reads = {};
    const seen = {};
    const wrap = (struct, value) => {
      if (value === null || typeof value !== 'object') return value;
      if (Array.isArray(value)) return value.map((v) => wrap(struct, v));
      if (value instanceof Map)
        return new Map([...value].map(([k, v]) => [k, wrap(struct, v)]));
      const table = codec.FIELDS[struct];
      const copy = {};
      for (const [k, v] of Object.entries(value)) {
        const child = table.nested?.[k];
        copy[k] = child ? wrap(child, v) : v;
        (seen[struct] ??= new Set()).add(k);
      }
      return new Proxy(copy, {
        get(target, key, receiver) {
          if (typeof key === 'string' && Object.hasOwn(target, key))
            (reads[struct] ??= new Set()).add(key);
          return Reflect.get(target, key, receiver);
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
      outcome(() =>
        PROJECT[method](codec, wrap(struct, structuredClone(value)))
      );
    }
    for (const [struct, table] of Object.entries(codec.FIELDS)) {
      if (!seen[struct]) continue;
      const used = Object.entries(table.fields)
        .filter(([, use]) => use === 'mapped' || use === 'internal')
        .map(([k]) => k)
        .filter((k) => seen[struct].has(k))
        .sort();
      assert.deepEqual([...(reads[struct] ?? [])].sort(), used, struct);
    }
  });

  it('see every struct of the tables in the fixtures', () => {
    // SendBeginResult is only an input to sendEnd here.
    const reached = new Set(['SendBeginResult']);
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
