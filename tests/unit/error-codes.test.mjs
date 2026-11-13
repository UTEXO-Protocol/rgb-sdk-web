// rgb-lib-wasm rejects with the error's display text only. RgbLibWeb finds
// the rgb-lib variant from the beta.4 texts and gives the rgb-sdk-rn code
// (Invalid* → INVALID_PARAMS, Insufficient* → INSUFFICIENT_FUNDS, …).
// fixtures/error-texts/ is generated from the pinned Rust source with
// `npm run errors:generate`; it lists every public Error and binding text.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { RgbLibWeb } from '../../dist/index.mjs';
import { KEYS, createFakeRuntime } from '../fake-rgb-lib-wasm.mjs';
import { samples as captured } from '../fixtures/rgb-lib-wasm-1.0.0-beta.4/errors.mjs';
import {
  meta,
  texts,
} from '../fixtures/error-texts/rgb-lib-wasm-1.0.0-beta.4.mjs';

async function codeFor(message) {
  const runtime = createFakeRuntime({
    overrides: {
      getFeeEstimation: async () => {
        throw message;
      },
    },
  });
  const engine = new RgbLibWeb({
    network: 'regtest',
    mnemonic: KEYS.mnemonic,
    runtime,
    indexerUrl: 'http://127.0.0.1:3002',
    proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
  });
  await engine.init();
  try {
    await engine.estimateFeeRate(1);
    assert.fail('expected a rejection');
  } catch (error) {
    assert.ok(isEngineError(error), String(error));
    assert.equal(error.operation, 'estimateFeeRate');
    // Watch-only gets its own message (it names the operation); others keep the text.
    if (error.code !== 'UNSUPPORTED_CAPABILITY')
      assert.equal(error.message, message);
    return error.code;
  } finally {
    await engine.destroy();
  }
}

// Behavior that depends on the field text, or on texts outside the enum.
const CASES = [
  ['Address error: base58 error', 'INVALID_PARAMS'],
  ['Address error: ', 'INVALID_PARAMS'],
  [
    "Insufficient bitcoin funds: needed '1000', available '10'",
    'INSUFFICIENT_FUNDS',
  ],
  ['Invalid amounts array: invalid type: string', 'INVALID_PARAMS'],
  // A text the table does not know.
  ['Cannot estimate fees', 'NATIVE_ERROR'],
  ['Invalid', 'NATIVE_ERROR'],
  ['Invalid invoice', 'NATIVE_ERROR'],
  ['invalid txid', 'NATIVE_ERROR'],
  ['Invalid TXID ', 'NATIVE_ERROR'],
  // BackupInvalidPath is internal: it reaches JS as "Internal error: …".
  ['Internal error: Invalid backup path', 'NATIVE_ERROR'],
];

describe('rgb-lib-wasm beta.4 error texts', () => {
  it('lists the pinned source', () => {
    assert.equal(meta.version, '1.0.0-beta.4');
    assert.equal(meta.rustCommit, 'f0e266f039744896baa39e3a35766ef01c0f369a');
    assert.equal(texts.filter((t) => t.source === 'error').length, 136);
  });

  for (const t of texts) {
    it(`${t.code} for ${t.variant} "${t.sample}"`, async () => {
      assert.equal(await codeFor(t.sample), t.code);
    });
  }

  it('maps the variants by the rgb-sdk-rn rules', () => {
    const exceptions = new Set(Object.keys(meta.ambiguous));
    for (const t of texts.filter((x) => x.source === 'error')) {
      if (exceptions.has(t.text)) continue;
      const v = t.variant;
      const code =
        v === 'AssetNotFound'
          ? 'ASSET_NOT_FOUND'
          : v === 'WatchOnly'
            ? 'UNSUPPORTED_CAPABILITY'
            : v === 'Offline'
              ? 'WALLET_OFFLINE'
              : v.startsWith('Invalid')
                ? 'INVALID_PARAMS'
                : v.startsWith('Insufficient')
                  ? 'INSUFFICIENT_FUNDS'
                  : 'NATIVE_ERROR';
      assert.equal(t.code, code, v);
    }
  });

  it('gives the one shared "Invalid expiration" text INVALID_PARAMS', () => {
    const both = texts.filter((t) => t.text === 'Invalid expiration');
    assert.deepEqual(both.map((t) => t.variant).sort(), [
      'ExpirationInvalid',
      'InvalidExpiration',
    ]);
    assert.ok(both.every((t) => t.code === 'INVALID_PARAMS'));
  });

  for (const [message, code] of CASES) {
    it(`${code} for "${message}"`, async () => {
      assert.equal(await codeFor(message), code);
    });
  }

  it('classifies every captured runtime rejection', async () => {
    const expected = {
      'Asset with id rgb:unknown-asset not found': 'ASSET_NOT_FOUND',
      'Address error: base58 error': 'INVALID_PARAMS',
    };
    for (const s of captured) {
      assert.ok(s.error in expected, `classify the captured "${s.error}"`);
      assert.equal(await codeFor(s.error), expected[s.error], s.error);
    }
  });
});
