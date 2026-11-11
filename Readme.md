# RGB SDK for Web

> **Work in progress.** This branch turns `@utexo/rgb-sdk-web` into the RGB_L1
> wallet engine for browsers. It is not released. The published
> `@utexo/rgb-sdk-web` is the RLN (Lightning) wallet; that code stays on `dev`.

`RgbLibWeb` runs RGB on-chain (L1) wallets in the browser over
[`@utexo/rgb-lib-wasm`](https://github.com/UTEXO-Protocol/rgb-lib-wasm), behind
the `SharedWalletApi` contract of `@utexo/rgb-sdk-core`. Use it on its own, or
through the `UTEXOWallet` facade of `@utexo/rgb-sdk`, which gives the same API on
React Native (`@utexo/rgb-lib-rn`).

This package has no Lightning.

## Status

| Step | State |
|---|---|
| 1. Remove RLN, depend on the split core and `@utexo/rgb-lib-wasm` 1.0.0-beta.4 | done |
| 2. Move `RgbLibWeb` and its tests here | done |
| 3. Load the WASM runtime inside the package | done |
| 4. One-call start: `RgbLibWeb.create()`, `generateKeys` | next |

Today the app passes nothing but the options and the keys; `init()` loads the
WASM once per page:

```ts
import { RgbLibWeb } from '@utexo/rgb-sdk-web';

const wallet = new RgbLibWeb({ network: 'testnet' }, mnemonic);
await wallet.init();
```

`wasmUrl` points the loader at `rgb_lib_wasm_bindings_bg.wasm` when the bundler
does not serve it next to the `@utexo/rgb-lib-wasm` JS file. The third
constructor argument, `runtime`, takes a module the app already initialized, or
a test double.

The planned start:

```ts
import { RgbLibWeb, generateKeys } from '@utexo/rgb-sdk-web';

const keys = await generateKeys('testnet');
const wallet = await RgbLibWeb.create({ mnemonic: keys.mnemonic, network: 'testnet' });
const balance = await wallet.getBtcBalance();
```

## Development

```bash
npm install
npm test          # typecheck, lint, build, unit tests (node:test)
npm run test:e2e  # Playwright over the real WASM; needs the regtest stand (tests/e2e/README.md)
```

`@utexo/rgb-sdk` (the facade) is a dev dependency, only for tests that wrap
`RgbLibWeb` in `UTEXOWallet`.

`@utexo/rgb-sdk-core` comes from `../.local-packages/utexo-rgb-sdk-core-0.1.0.tgz`
(the split core) until it is published.
