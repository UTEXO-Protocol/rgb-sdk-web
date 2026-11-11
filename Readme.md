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

## Requirements

- A modern browser with WebAssembly and IndexedDB.
- An ESM bundler. The package is ESM only.
- An Esplora (HTTP) indexer and an RGB proxy. Known networks have defaults;
  regtest has none. Electrum indexers do not work in the browser.

## Quick start

```ts
import { RgbLibWeb, generateKeys } from '@utexo/rgb-sdk-web';

const keys = await generateKeys('testnet'); // pure JS, no WASM
const wallet = await RgbLibWeb.create({
  network: 'testnet',
  mnemonic: keys.mnemonic,
});

const address = await wallet.getAddress();
const balance = await wallet.getBtcBalance();
```

`create()` loads the WASM, opens the wallet from IndexedDB and returns it. The
WASM is loaded once per `@utexo/rgb-lib-wasm` module, shared by all wallets and
by every copy of this package on the page. The first network operation connects; `unlock()` is needed only for
connection settings other than the config's.

Store `keys.mnemonic` safely. It is the only way to restore the wallet.

## Config

One object for `RgbLibWeb.create(config)` and `new RgbLibWeb(config)`:

| Field | Meaning |
|---|---|
| `network` | `mainnet`, `testnet`, `testnet4`, `signet`, `regtest` or `utexo` |
| `mnemonic` | the wallet mnemonic; or use `keys` |
| `keys` | a function or `{ getMnemonic }` that returns the mnemonic on `init()`, optionally with public keys that must match; or public keys alone for a watch-only wallet |
| `dataDir` | IndexedDB key prefix. Default `':memory:'`, which is a prefix too: the state is still saved to IndexedDB and restored with the same keys |
| `reuseAddresses` | one pinned address instead of a new one per call |
| `maxAllocationsPerUtxo` | default 5 |
| `indexerUrl` / `indexer` | Esplora server; default per network |
| `proxyEndpoint` | RGB proxy; default per network |
| `evmRpcUrls`, `evmMintLockBlocks`, `proxyAuthKeys` | BFA mint locks and proxy auth |
| `wasmUrl` | where to load `rgb_lib_wasm_bindings_bg.wasm` from; default next to the module's JS |
| `runtime` | an initialized `@utexo/rgb-lib-wasm` module, or a test double; not with `wasmUrl` |

Pass exactly one of `mnemonic` and `keys`, and at most one of `runtime` and
`wasmUrl`. A `wasmUrl` is read once, at construction, and made absolute
against the page URL.

Errors follow the `EngineError` shape of `@utexo/rgb-sdk-core`: a `code`
(`INVALID_CONFIG`, `KEYS_UNAVAILABLE`, `UNSUPPORTED_CAPABILITY`, …),
`operation` and `protocol`. The package's own errors are `RgbLibWebError`, but
an engine error from the runtime passes through as it is, so check errors with
`isEngineError(error, code)`, not `instanceof`.

## Restore between open and connect

```ts
const wallet = new RgbLibWeb({ network: 'testnet', mnemonic, dataDir: 'my-app' });
await wallet.init();   // opened from IndexedDB, not online yet
// restore from a backup here (planned: ADR-0003)
await wallet.unlock(); // online
```

## With the facade

```ts
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibWeb } from '@utexo/rgb-sdk-web';

const wallet = new UTEXOWallet({
  engine: new RgbLibWeb({ network: 'testnet', mnemonic }),
});
await wallet.init();
```

## Bundler setup

`@utexo/rgb-lib-wasm` fetches its `.wasm` file from
`new URL('rgb_lib_wasm_bindings_bg.wasm', import.meta.url)`. The bundler must
copy that file next to the bundled JS, or the app sets `wasmUrl`.

- **esbuild:** copy the file next to the bundle. This is what the e2e tests do
  (`tests/e2e/serve.mjs`).
- **Vite** (checked with 6.4.3, dev and production, no WASM plugin): exclude the
  packages from dependency pre-bundling in dev, so `import.meta.url` keeps
  pointing at the package files. A production build emits the `.wasm` as a
  hashed asset by itself.

  ```ts
  // vite.config.ts
  export default defineConfig({
    optimizeDeps: { exclude: ['@utexo/rgb-sdk-web', '@utexo/rgb-lib-wasm'] },
  });
  ```

## Examples

See [`examples/`](examples/README.md): a new wallet, reading a wallet, UTXOs and
issuing, a transfer.

## Status

| Step | State |
|---|---|
| 1. Remove RLN, depend on the split core and `@utexo/rgb-lib-wasm` 1.0.0-beta.4 | done |
| 2. Move `RgbLibWeb` and its tests here | done |
| 3. Load the WASM runtime inside the package | done |
| 4. One-call start: `RgbLibWeb.create()`, `generateKeys`, one config object | done |
| Backup and VSS (ADR-0003) | planned |

## Development

```bash
npm install
npm test          # typecheck, lint, build, unit tests (node:test), examples
npm run test:e2e  # Playwright over the real WASM; needs the regtest stand (tests/e2e/README.md)
npm run capture:fixtures  # re-capture raw runtime values (tests/fixtures/README.md)
npm run golden:update     # rewrite the golden results after an intended change
```

`@utexo/rgb-sdk-core` comes from `../.local-packages/utexo-rgb-sdk-core-0.1.0.tgz`
(the split core) until it is published. `@utexo/rgb-sdk` (the facade) is a dev
dependency, only for tests that wrap `RgbLibWeb` in `UTEXOWallet`.
