// Type tests: checked by `npm run typecheck`, never run.
import type * as RgbLibWasm from '@utexo/rgb-lib-wasm';
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibWeb, generateKeys } from '../../src/index.js';
import type { RgbLibWasmRuntime } from '../../src/index.js';

// The real module matches the shape the adapter calls.
declare const runtime: typeof RgbLibWasm;
const asRuntime: RgbLibWasmRuntime = runtime;

const engine = new RgbLibWeb({
  network: 'utexo',
  mnemonic: 'mnemonic',
  runtime: asRuntime,
});
const wallet = new UTEXOWallet({ engine });
void wallet.unlock({ indexerUrl: 'https://esplora.example' });

// create() returns the opened engine.
const created: Promise<RgbLibWeb> = RgbLibWeb.create({
  network: 'testnet',
  mnemonic: 'mnemonic',
  reuseAddresses: true,
});
void created;

// generateKeys needs no WASM and feeds the config.
void generateKeys('testnet').then(({ mnemonic }) =>
  RgbLibWeb.create({ network: 'testnet', mnemonic })
);

// keys takes every key form: a reader, a provider, public keys.
new RgbLibWeb({ network: 'testnet', keys: () => 'mnemonic' });
new RgbLibWeb({ network: 'testnet', keys: { getMnemonic: async () => null } });
new RgbLibWeb({
  network: 'testnet',
  keys: {
    accountXpubVanilla: 'tpub',
    accountXpubColored: 'tpub',
    masterFingerprint: 'a1b2c3d4',
  },
});

// @ts-expect-error watch-only keys need all three public keys
new RgbLibWeb({ network: 'regtest', keys: { accountXpubVanilla: 'tpub' } });

// @ts-expect-error mnemonic and keys together
new RgbLibWeb({ network: 'regtest', mnemonic: 'm', keys: 'm' });

// @ts-expect-error keys are required
new RgbLibWeb({ network: 'regtest' });

// wasmUrl takes a string or a URL.
new RgbLibWeb({ network: 'testnet', mnemonic: 'm', wasmUrl: '/rgb.wasm' });
new RgbLibWeb({
  network: 'testnet',
  mnemonic: 'm',
  wasmUrl: new URL('https://cdn.example/rgb.wasm'),
});
// @ts-expect-error wasmUrl is a string or a URL
new RgbLibWeb({ network: 'testnet', mnemonic: 'm', wasmUrl: 42 });

// runtime and wasmUrl exclude each other: wasmUrl is only for the built-in loader.
const both = {
  network: 'testnet',
  mnemonic: 'm',
  runtime: asRuntime,
  wasmUrl: '/rgb.wasm',
} as const;
// @ts-expect-error runtime with wasmUrl
new RgbLibWeb(both);
