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
 * Where the current code differs from what a strict decoder must do. ADR-0002
 * step 1 fixes these; remove each entry with its fix.
 */
const KNOWN_DEFECTS = {
  'negative: listAssets — Assets as a Map':
    'a Map is read as the Assets object: the lists come back empty, no error',
  'negative: refresh — refresh result as a plain object':
    'a plain object is accepted as the refresh Map',
  'negative: getBtcBalance — settled = u64::MAX + 1':
    'the input validator answers: INVALID_AMOUNT, not INVALID_NATIVE_RESPONSE',
  'negative: listAssets — timestamp below i64::MIN':
    'AMOUNT_OVERFLOW, not INVALID_NATIVE_RESPONSE',
  'negative: refresh — nested failure with BigInt details':
    'nested failure details become "[object Object]"',
  'handmade: refresh — failures: unit, struct with u64, nested struct':
    'nested failure details become "[object Object]"',
};

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

  it('differs from the strict rules only by the known defects', () => {
    const found = cases
      .filter((c) => outcomes[c.name] && defect(c, outcomes[c.name]))
      .map((c) => c.name)
      .sort();
    assert.deepEqual(found, Object.keys(KNOWN_DEFECTS).sort());
  });
});
