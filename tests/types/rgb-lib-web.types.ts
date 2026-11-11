// Type tests: checked by `npm run typecheck`, never run.
import type * as RgbLibWasm from '@utexo/rgb-lib-wasm';
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibWeb } from '../../src/index.js';
import type { RgbLibWasmRuntime } from '../../src/index.js';

// The real module matches the shape the adapter calls.
declare const runtime: typeof RgbLibWasm;
const asRuntime: RgbLibWasmRuntime = runtime;

const engine = new RgbLibWeb({ network: 'utexo' }, 'mnemonic', asRuntime);
const wallet = new UTEXOWallet({ engine });
void wallet.unlock({ indexerUrl: 'https://esplora.example' });

// @ts-expect-error watch-only keys need all three public keys
new RgbLibWeb({ network: 'regtest' }, { accountXpubVanilla: 'tpub' }, runtime);

// The runtime is optional: init() loads the module, from wasmUrl if set.
new RgbLibWeb({ network: 'testnet' }, 'mnemonic');
new RgbLibWeb({ network: 'testnet', wasmUrl: '/rgb.wasm' }, 'mnemonic');
new RgbLibWeb(
  { network: 'testnet', wasmUrl: new URL('https://cdn.example/rgb.wasm') },
  'mnemonic'
);
// @ts-expect-error wasmUrl is a string or a URL
new RgbLibWeb({ network: 'testnet', wasmUrl: 42 }, 'mnemonic');
