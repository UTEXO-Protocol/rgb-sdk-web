// toSource / describeTypes (fixture text form) and the capture's shape().
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeTypes, toSource } from '../fixtures/source.mjs';
import { shape, writeFixtures } from '../e2e/capture/write-fixtures.mjs';

const evaluate = (source) => (0, eval)(`(${source})`);

describe('fixture source text', () => {
  it('reads back BigInt, -0, NaN, undefined keys and nested Maps', () => {
    const value = {
      a: 2n ** 64n - 1n,
      b: -0,
      c: NaN,
      d: undefined,
      m: new Map([[1, new Map([['k', [1n]]])]]),
    };
    assert.deepStrictEqual(evaluate(toSource(value)), value);
  });

  it('keeps an own __proto__ key as an own key', () => {
    const value = JSON.parse('{"__proto__": {"x": 1}, "y": 2}');
    const back = evaluate(toSource(value));
    assert.ok(Object.hasOwn(back, '__proto__'));
    assert.equal(Object.getPrototypeOf(back), Object.prototype);
    assert.deepStrictEqual(back, value);
  });

  it('rejects what would not read back equal', () => {
    assert.throws(() => toSource(new Array(3)), /sparse/);
    assert.throws(() => toSource(Object.assign([1], { extra: 2 })), /sparse/);
    assert.throws(() => toSource(Object.create(null)), /null-prototype/);
    assert.throws(() => toSource({ [Symbol('s')]: 1 }), /symbol/);
    assert.throws(() => toSource(new Date(0)), /Date/);
  });

  it('quotes keys that are not identifiers in paths', () => {
    assert.deepEqual(describeTypes({ 'a.b': 1n, 'a': { b: 'x' } }), {
      '$': 'object',
      '$["a.b"]': 'bigint',
      '$.a': 'object',
      '$.a.b': 'string',
    });
  });
});

describe('capture shape', () => {
  it('folds positions and keeps kinds', () => {
    const one = describeTypes({ list: [{ v: 1n }] });
    const two = describeTypes({ list: [{ v: 1n }, { v: 2n }] });
    const absent = describeTypes({ list: [{ v: undefined }] });
    assert.equal(shape(one), shape(two));
    assert.notEqual(shape(one), shape(absent));
  });
});

describe('capture writer', () => {
  it('fails on a value it cannot keep, before touching the fixtures', () => {
    const records = [
      { method: 'listAssets', label: 'x', ok: true, skipped: 'a Date' },
    ];
    assert.throws(
      () => writeFixtures(records, { capturedAt: 0 }),
      /listAssets \(x\): a Date/
    );
  });
});
