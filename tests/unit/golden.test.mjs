// Golden public results (ADR-0002 step 0). Every fixture case runs through
// the built engine; its result, error and runtime calls must equal the
// golden file. Regenerate with `npm run golden:update` only for an intended
// change, and review the diff.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toSource } from '../fixtures/source.mjs';
import { golden } from '../golden/rgb-lib-wasm-1.0.0-beta.4.golden.mjs';
import { collectCases, loadFixtures, runCase } from '../golden/runner.mjs';

const mods = await loadFixtures();
const cases = collectCases(mods);

/**
 * Where the current code differs from what a strict decoder must do, case name
 * → reason. Empty since ADR-0002 step 1. A new negative case that the code
 * gets wrong fails until it is fixed or listed here with its reason.
 */
const KNOWN_DEFECTS = {};

function defect(c, outcome) {
  const text = toSource(outcome.result);
  if (text.includes('[object Object]')) return true;
  if (c.expect === undefined) return false;
  if (c.expect.startsWith('ok')) return !outcome.result.ok;
  return outcome.result.ok || outcome.result.code !== c.expect;
}

describe('golden RgbLibWeb results for rgb-lib-wasm fixtures', () => {
  it('has one golden entry per case, and no stale entry', () => {
    assert.deepEqual(
      cases.map((c) => c.name).sort(),
      Object.keys(golden).sort()
    );
  });

  const outcomes = {};
  for (const c of cases) {
    it(c.name, async () => {
      outcomes[c.name] = await runCase(mods, c);
      assert.deepStrictEqual(outcomes[c.name], golden[c.name]);
    });
  }

  it('shows every nested refresh failure field, numbers exact', () => {
    // Independent of the golden file: every key and every BigInt of a
    // failure in the fixture must appear in the public message as is.
    const leaves = (value, out = { keys: [], bigints: [] }) => {
      if (typeof value === 'bigint') out.bigints.push(value.toString());
      else if (value && typeof value === 'object')
        for (const [k, v] of Object.entries(value)) {
          out.keys.push(k);
          leaves(v, out);
        }
      return out;
    };
    let checked = 0;
    // Unknown keys are ignored, so they are not in the message.
    for (const c of cases.filter(
      (x) => x.method === 'refresh' && x.kind !== 'unknown-key'
    )) {
      const outcome = outcomes[c.name];
      if (!outcome?.result.ok) continue;
      for (const [idx, item] of c.value) {
        if (item.failure === undefined || typeof item.failure === 'string')
          continue;
        const [variant, fields] = Object.entries(item.failure)[0];
        const { message } = outcome.result.value.transfers[idx].failure;
        assert.ok(message.startsWith(`${variant} (`), message);
        const { keys, bigints } = leaves(fields);
        for (const k of keys)
          assert.ok(message.includes(`${k}: `), `${k} in ${message}`);
        for (const n of bigints)
          assert.ok(message.includes(`: ${n}`), `${n} in ${message}`);
        checked += 1;
      }
    }
    assert.ok(checked >= 3, `checked ${checked} nested failures`);
  });

  it('leaves an unknown failure field out of the message', () => {
    const c = cases.find(
      (x) => x.method === 'refresh' && x.kind === 'unknown-key'
    );
    const { message } = outcomes[c.name].result.value.transfers[4].failure;
    assert.ok(!message.includes('newField'), message);
  });

  it('sorts invoice query params by key', () => {
    // deepStrictEqual ignores key order; the order itself is checked here.
    const c = cases.find(
      (x) => x.label === 'query params out of key order (valid)'
    );
    const params = outcomes[c.name].result.value.unknownQueryParams;
    assert.deepEqual(Object.keys(params), ['a', 'z']);
  });

  it('differs from the strict rules only by the known defects', () => {
    const found = cases
      .filter((c) => outcomes[c.name] && defect(c, outcomes[c.name]))
      .map((c) => c.name)
      .sort();
    assert.deepEqual(found, Object.keys(KNOWN_DEFECTS).sort());
  });
});
