# RGB SDK for Web

> **Work in progress.** This branch turns `@utexo/rgb-sdk-web` into the RGB_L1
> wallet engine for browsers. It is not released. The published
> `@utexo/rgb-sdk-web` is the RLN (Lightning) wallet; that code stays on `dev`.

`RgbLibWeb` runs RGB on-chain (L1) wallets in the browser over
[`@utexo/rgb-lib-wasm`](https://www.npmjs.com/package/@utexo/rgb-lib-wasm), behind
the `SharedWalletApi` contract of `@utexo/rgb-sdk-core`. Use it on its own, or
through the `UTEXOWallet` facade of `@utexo/rgb-sdk`, which gives the same API on
React Native (`@utexo/rgb-sdk-rn`).

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
| `vssUrl` | VSS backup server; default the UTEXO server (on regtest: off), `null` turns VSS off |
| `vss` | an explicit VSS identity `{ serverUrl, storeId, signingKey }` instead of the derived one; not with `vssUrl` |

Pass exactly one of `mnemonic` and `keys`, and at most one of `runtime` and
`wasmUrl`. A `wasmUrl` is read once, at construction, and made absolute
against the page URL.

Errors follow the `EngineError` shape of `@utexo/rgb-sdk-core`: a `code`
(`INVALID_CONFIG`, `KEYS_UNAVAILABLE`, `UNSUPPORTED_CAPABILITY`, …),
`operation` and `protocol`. The package's own errors are `RgbLibWebError`, but
an engine error from the runtime passes through as it is, so check errors with
`isEngineError(error, code)`, not `instanceof`.

## VSS backup

VSS (cloud) backup is on by default, with no setup, as on the RLN web wallet.
On regtest it is off unless `vssUrl` or `vss` names a server, so test wallets
do not upload to the production server.

- `init()` derives the identity from the mnemonic with the core helpers:
  store `wallet_<masterFingerprint>`, signing key from the mnemonic. The key
  goes to the runtime only; it is not kept, logged or put in errors.
- Each successful mutation (create UTXOs, send, issue, inflate, receive, fail
  transfers, refresh) queues one upload. It runs as its own task after the
  mutation, uploads only when the wallet changed, and a failure is logged
  (`logger.warn`) without failing anything. `destroy()` waits for it.
- Nothing is uploaded on `init()`: a restore may still run before the wallet
  connects.
- `backupToVss()` uploads now and returns the server version.
- `getVssBackupInfo()` reads the server state: `{ backupExists,
  serverVersion, backupRequired, lastBackupError }`.
- A watch-only wallet has no mnemonic, so it gets VSS only with `vss`.

## Restore between open and connect

```ts
const wallet = new RgbLibWeb({ network: 'testnet', mnemonic, dataDir: 'my-app' });
await wallet.init();            // opened from IndexedDB, not online yet
await wallet.restoreFromVss();  // the VSS backup of this mnemonic, saved locally
await wallet.unlock();          // online
```

- `restoreFromVss()` runs only after `init()` and before the first
  connection (`unlock()` or any online call); later it rejects with
  `WALLET_INVALID_STATE`. To restore later, destroy the wallet, create it
  again and restore before `unlock()`.
- A wallet with local data (assets, transfers, UTXOs or transactions) is
  refused unless `{ overwrite: true }`, so a restore never wipes newer local
  state by accident.
- The `UTEXOWallet` facade forwards it, with `backupToVss()` and
  `getVssBackupInfo()`.
- **Unrestored backup.** On the first connection of a wallet that was empty
  before it (judged before the connect: its chain scan brings in the UTXOs of
  this mnemonic) and was not restored, the engine asks the server whether a
  backup exists. If one does, it belongs to this mnemonic from another
  device: the engine logs a warning and holds automatic uploads, so the first
  mutation does not replace it. `backupToVss()` lifts the hold and replaces the
  server copy on purpose.
- The core logger prints only errors by default. To see the VSS warnings
  (a held upload, a failed automatic backup), raise its level:
  `logger.setLevel(LogLevel.WARN)` from `@utexo/rgb-sdk-core`.

## Byte backup

`BackupExportApi` and `BackupRestoreApi` from core: an encrypted backup as
bytes, with no server. The app stores them where it wants (a file download,
its own storage). A backup restores only on this engine: a React Native
backup does not open here, and the other way round.

```ts
const bytes = await wallet.exportBackup({ password }); // Uint8Array
// later, in an empty profile:
await wallet.init();
await wallet.restoreBackup({ bytes, password });       // before unlock()
await wallet.unlock();
```

- `exportBackup()` works offline, on any wallet, watch-only included.
- `restoreBackup()` follows the rules of `restoreFromVss()`: only between
  `init()` and the first connection, and `{ overwrite: true }` for a wallet
  with local data. The restored state is saved to IndexedDB before it
  resolves.
- A missing or empty password, or `bytes` that are not a nonempty
  `Uint8Array`, is `INVALID_CONFIG` (as on React Native). Damaged bytes are
  `INVALID_PARAMS`; a wrong password is `NATIVE_ERROR` ("Wrong password").
  A failed restore changes nothing.
- The `UTEXOWallet` facade forwards both methods.

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

## How it works

Layout:

```
src/
  index.ts            exports only
  rgb-lib-web.ts      RgbLibWeb: the public API, 29 SharedWalletApi methods
  backend.ts          lifecycle (init, connect, destroy), admission, serial queue
  operations.ts       per method: prepare (checks, WASM arguments) and execute
  config.ts           options, defaults per network, config checks
  keys.ts             mnemonic or public keys, watch-only
  errors.ts           public error codes, shared by every layer
  runtime/            everything tied to the @utexo/rgb-lib-wasm version
    load.ts           loads the WASM module once per page
    types.ts          the runtime API this package calls
    session.ts        the open wallet: handle, sync, sign, flush
    codec.ts          decoding of every WasmWallet result to the core types
    rgb-lib-messages.generated.ts   beta.4 error table (generated)
```

Rules:

- Imports point one way: `rgb-lib-web` → `backend` → `operations` →
  `runtime/`. `config`, `keys` and `errors` are shared; `runtime/` imports
  nothing from `backend` or `operations`.
- A runtime upgrade changes `runtime/` (and the fixtures and golden results)
  only.
- A new file only when an existing one passes about 800 lines or gets a second
  job. No `utils/`: each helper belongs to the layer that uses it.
- Each file starts with what it does, who calls it and what it depends on.

`prepare` runs before the call is queued and has no side effects, so an
invalid call fails at once. `execute` runs as one queued task: WASM calls
never overlap. A synchronous WASM mutation is reported only after it is
flushed to IndexedDB.

### Decoding rules

The runtime is `@utexo/rgb-lib-wasm` 1.0.0-beta.4; the normative source is its
tag `v1.0.0-beta.4` (`f0e266f`).

- Each result is decoded in two stages. `decode*` checks the raw value and
  keeps numbers exact (u64 and i64 stay `BigInt`); a value that breaks the
  Rust type fails with `INVALID_NATIVE_RESPONSE`. `public*` converts to the
  core types; a number above `Number.MAX_SAFE_INTEGER` fails with
  `AMOUNT_OVERFLOW`, never rounds.
- Containers are strict: a `Map` where Rust has a map keyed by integers
  (`refresh`), a plain object for `unknownQueryParams`, `undefined` for an
  absent `Option`.
- Integers are checked by their Rust type (`u8`, `u32`, `i32`, `u64`, `i64`);
  enum variants must be ones beta.4 has.
- `FIELDS` in `src/runtime/codec.ts` lists every field of the 21 beta.4 structs the
  adapter reads, each `mapped` (public), `internal` (used, not public) or
  dropped with the reason. Only `mapped` and `internal` fields are read;
  unknown fields are ignored at runtime, so an additive runtime release keeps
  working, and fail the fixture schema test (`tests/unit/codec.test.mjs`).
- Inputs go in the wire form beta.4 takes: `BigInt` for u64 amounts, expiry
  and fee rates; decimal strings for `WitnessData`.
- Runtime errors map to public codes by the table in
  `src/runtime/rgb-lib-messages.generated.ts`, generated from the Rust source; other
  messages are `NATIVE_ERROR`.

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
| VSS backup: zero config, `backupToVss()`, automatic upload | done |
| VSS restore before connect, unrestored-backup hold | done |
| Byte backup: `exportBackup()`, `restoreBackup()`, with e2e | done |
| VSS backup and restore e2e against a local VSS server | done |

## Development

```bash
npm install
npm test          # typecheck, lint, build, unit tests (node:test), examples
npm run test:e2e  # Playwright over the real WASM; needs the regtest stand (tests/e2e/README.md)
npm run capture:fixtures  # re-capture raw runtime values (tests/fixtures/README.md)
npm run golden:update     # rewrite the golden results after an intended change
RGB_LIB_WASM_SRC=<rgb-lib-wasm checkout> npm run errors:check  # the error table matches the Rust source
```

`@utexo/rgb-sdk` (the facade) is a dev dependency, only for tests that wrap
`RgbLibWeb` in `UTEXOWallet`.
