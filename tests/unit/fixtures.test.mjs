// The rgb-lib-wasm fixtures (ADR-0002 step 0) load back without loss and
// match the installed runtime. A runtime upgrade fails here until the fixtures
// are captured again (`npm run capture:fixtures`).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describeTypes, toSource } from '../fixtures/source.mjs';
import { loadFixtures } from '../golden/runner.mjs';

/** The rgb-lib-wasm commit the handmade shapes follow (tag v1.0.0-beta.4). */
const RUST_COMMIT = 'f0e266f039744896baa39e3a35766ef01c0f369a';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(
  require.resolve('@utexo/rgb-lib-wasm/package.json')
);
const installed = {
  version: JSON.parse(
    fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')
  ).version,
  wasmSha256: createHash('sha256')
    .update(fs.readFileSync(path.join(pkgDir, 'rgb_lib_wasm_bindings_bg.wasm')))
    .digest('hex'),
};

const mods = await loadFixtures();
const HANDMADE = new Set(['handmade', 'negative']);
const captured = Object.entries(mods).filter(([f]) => !HANDMADE.has(f));
const evaluate = (source) => (0, eval)(`(${source})`);

describe('rgb-lib-wasm fixtures', () => {
  it('were captured from the installed runtime', () => {
    for (const [file, mod] of captured) {
      assert.equal(mod.meta.runtime, '@utexo/rgb-lib-wasm', file);
      assert.equal(mod.meta.source, 'captured', file);
      assert.equal(mod.meta.version, installed.version, `${file}: recapture`);
      assert.equal(
        mod.meta.wasmSha256,
        installed.wasmSha256,
        `${file}: recapture`
      );
      assert.equal(typeof mod.meta.capturedAt, 'number', file);
    }
  });

  it('keep every recorded kind (BigInt, Map, undefined) at every path', () => {
    for (const [file, mod] of captured) {
      if (file === 'errors') continue;
      for (const s of mod.samples) {
        assert.deepEqual(
          describeTypes(s.value),
          s.types,
          `${file}: ${s.label}`
        );
      }
    }
  });

  it('read back equal from their source text', () => {
    const all = [
      ...captured
        .filter(([f]) => f !== 'errors')
        .flatMap(([, m]) => m.samples.map((s) => s.value)),
      ...mods.handmade.cases.map((c) => c.value),
      ...mods.negative.cases.map((c) => c.value),
    ];
    for (const value of all) {
      const back = evaluate(toSource(value));
      assert.deepStrictEqual(back, value);
      assert.deepEqual(describeTypes(back), describeTypes(value));
    }
  });

  it('cover the values the engine decodes', () => {
    for (const method of [
      'getBtcBalance',
      'listUnspents',
      'listTransactions',
      'listTransfers',
      'listAssets',
      'getAssetBalance',
      'issueAssetNia',
      'issueAssetIfa',
      'blindReceive',
      'witnessReceive',
      'invoiceData',
      'refresh',
      'sendEnd',
      'inflateEnd',
      'createUtxosEnd',
      'sendBtcEnd',
      'getFeeEstimation',
      'failTransfers',
    ]) {
      assert.ok(mods[method]?.samples.length > 0, `no captured ${method}`);
    }
    const values = (m) => mods[m].samples.map((s) => s.value);
    assert.ok(
      values('listTransfers')
        .flat()
        .some((t) => typeof t.consignmentPath === 'string'),
      'a transfer with consignmentPath'
    );
    assert.ok(
      values('listAssets').some((a) => a.nia?.length && a.ifa?.length),
      'NIA and IFA in one listAssets'
    );
    assert.ok(
      values('refresh').some((r) => r instanceof Map && r.size > 0),
      'a non-empty refresh Map'
    );
    assert.ok(mods.errors.samples.length > 0, 'runtime rejections');
  });

  it('build AssignmentsCollection as beta.4 does', () => {
    // src/wallet/online.rs: no rename_all, so the fields stay snake_case.
    const found = [];
    const walk = (value) => {
      if (value instanceof Map) return value.forEach(walk);
      if (value === null || typeof value !== 'object') return;
      if ('non_fungible' in value) found.push(value);
      Object.values(value).forEach(walk);
    };
    for (const file of HANDMADE)
      mods[file].cases
        // A negative case may add an unknown key on purpose.
        .filter((c) => c.kind !== 'unknown-key')
        .forEach((c) => walk(c.value));
    assert.ok(found.length >= 2);
    for (const a of found) {
      assert.deepEqual(Object.keys(a).sort(), [
        'fungible',
        'inflation',
        'link',
        'mint',
        'non_fungible',
      ]);
      assert.equal(typeof a.fungible, 'bigint');
      assert.equal(typeof a.inflation, 'bigint');
      assert.equal(typeof a.mint, 'bigint');
      assert.equal(typeof a.non_fungible, 'boolean');
      assert.equal(typeof a.link, 'boolean');
    }
  });

  it('mark handmade samples as handmade, with what they are built on', () => {
    for (const file of HANDMADE) {
      assert.equal(mods[file].meta.source, 'handmade', file);
      assert.equal(mods[file].meta.rustCommit, RUST_COMMIT, file);
      for (const c of mods[file].cases) {
        assert.equal(typeof c.method, 'string');
        assert.equal(typeof c.label, 'string');
        if (file === 'negative') {
          assert.equal(typeof c.kind, 'string', c.label);
          assert.equal(typeof c.expect, 'string', c.label);
        } else {
          assert.equal(typeof c.basedOn, 'string', c.label);
        }
      }
    }
  });
});
