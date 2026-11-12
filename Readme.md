# @utexo/rgb-sdk-web

> **Not released yet.** This branch turns `@utexo/rgb-sdk-web` into the RGB
> on-chain wallet engine for browsers. The version on npm today is the RLN
> (Lightning) wallet.

`RgbLibWeb` is an RGB on-chain (`RGB_L1`) wallet that runs in the browser, over
[`@utexo/rgb-lib-wasm`](https://www.npmjs.com/package/@utexo/rgb-lib-wasm). It
holds bitcoin and RGB assets, creates invoices, sends and receives assets, and
keeps its state in IndexedDB. Use it on its own, or wrap it in `UTEXOWallet` from
[`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk) to get the same API
as on React Native.

This package has no Lightning.

## Requirements

- A modern browser with WebAssembly and IndexedDB.
- An ESM bundler. The package is ESM only.
- An Esplora (HTTP) indexer and an RGB proxy. Electrum indexers do not work in
  the browser; see [Configuration](#configuration) for the network defaults.

## Installation

```bash
npm install @utexo/rgb-sdk-web @utexo/rgb-sdk-core
```

## Bundler setup

`@utexo/rgb-lib-wasm` fetches its `.wasm` file from
`new URL('rgb_lib_wasm_bindings_bg.wasm', import.meta.url)`. The bundler must
copy that file next to the bundled JS, or the app sets `wasmUrl`.

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

- **esbuild:** copy the file next to the bundle.

## Quick start

```ts
import { RgbLibWeb, generateKeys } from '@utexo/rgb-sdk-web';

// 1. Create keys once and store the mnemonic safely.
const { mnemonic } = await generateKeys('testnet');

// 2. Open the wallet. Its state is saved in IndexedDB under `dataDir`.
const wallet = await RgbLibWeb.create({
  network: 'testnet',
  mnemonic,
  dataDir: 'my-app',
});

// 3. Use it. The first call that needs the network connects by itself.
const address = await wallet.getAddress();
const balance = await wallet.getBtcBalance();

// 4. Close it.
await wallet.destroy();
```

`create()` loads the WASM (once per page), opens the wallet and returns it.
To open the same wallet later, call `create()` again with the same mnemonic,
`network` and `dataDir`.

The mnemonic restores the keys and bitcoin. RGB assets also need a backup of
the wallet state: see [Backup and restore](#backup-and-restore).

## Fund the wallet

Every transfer pays a Bitcoin fee, and RGB assets live on UTXOs of the wallet.
Send some BTC to `getAddress()` first and wait for it to confirm.

`getBtcBalance()` returns two balances: `vanilla` (plain BTC, for fees) and
`colored` (UTXOs that can hold RGB assets).

## Receive RGB assets

Create an invoice and give `invoice` to the sender:

```ts
const { invoice, recipientId } = await wallet.onchainReceive({
  assetId, // omit to accept any asset
  amount: 100, // omit to accept any amount
  minConfirmations: 1,
  durationSeconds: 86_400,
});
```

- **Witness invoice** (the default): the asset arrives on a new output of the
  sender's transaction. The wallet needs no free UTXOs; the sender pays that
  output's sats with `witnessData`.
- **Blinded invoice** (`witness: false`): the asset arrives on a UTXO this
  wallet already has. Create a few first with `createUtxos()`.

`witnessReceive()` and `blindReceive()` are shortcuts for the two kinds.

## Send RGB assets

```ts
const { txid } = await wallet.onchainSend({
  invoice,
  amount: 100,
  feeRate: 2,
  minConfirmations: 1,
  witnessData: { amountSat: 1000 }, // only for a witness invoice
});
```

A transfer completes in steps: the receiver accepts the consignment, then the
transaction confirms. Call `refresh()` on both wallets until the transfer is
`Settled`:

```ts
await wallet.refresh();
const transfer = (await wallet.listTransfers(assetId)).find(
  (t) => t.recipientId === recipientId
);
if (transfer?.status === 'Settled') {
  // done
}
```

A transfer that cannot complete becomes `Failed`; `failTransfers()` marks
stuck pending transfers as failed.

## Send Bitcoin

```ts
const txid = await wallet.sendBtc({ address, amount: 10_000, feeRate: 2 });
```

## Create UTXOs and issue an asset

```ts
await wallet.createUtxos({ num: 5, feeRate: 2 });
// after the UTXO transaction confirms:
const asset = await wallet.issueAssetNia({
  ticker: 'DEMO',
  name: 'Demo Asset',
  precision: 2,
  amounts: [100_000],
});
```

- `amount` and `amounts` are in the asset's smallest units. With
  `precision: 2`, `100_000` is 1000.00 of the asset.
- `feeRate` is in sat/vB.
- `issueAssetIfa()` issues an inflatable asset, and `inflate()` issues more of
  it.

## Read balances and history

```ts
const btc = await wallet.getBtcBalance();
const { nia, ifa } = await wallet.listAssets();
const balance = await wallet.getAssetBalance(assetId); // settled, future, spendable
const transfers = await wallet.listTransfers(assetId);
const transactions = await wallet.listTransactions();
```

These calls work offline: `getAddress()`, `listAssets()`, `getAssetBalance()`
and `listTransfers()`. `getBtcBalance()`, `listUnspents()` and
`listTransactions()` sync with the indexer first, unless you pass
`{ skipSync: true }`. `refresh()` always needs the network.

## Backup and restore

The mnemonic is not enough to restore RGB assets: the wallet's contracts and
transfer history live only in its state. Keep a backup of that state.

- **VSS (cloud) backup is on by default.** After each change (send, receive,
  issue, refresh…) the wallet uploads a backup to the UTEXO VSS server. A
  failed upload is logged and does not fail the change, so a completed
  transfer does not mean a completed backup: call `backupToVss()` to upload
  now and get an error if it fails. Pass `vssUrl: null` to turn VSS off. On
  regtest it is off unless you set `vssUrl`.
- **Restore before the first connection.** `restoreFromVss()` and
  `restoreBackup()` run only after `init()` and before the wallet connects.

```ts
const wallet = new RgbLibWeb({
  network: 'testnet',
  mnemonic,
  dataDir: 'my-app',
});
await wallet.init(); // opened from IndexedDB, not online yet
await wallet.restoreFromVss(); // the VSS backup of this mnemonic
await wallet.unlock(); // online
```

- **Byte backup**, with no server: export the encrypted state and store it
  where you want. Restore it into a new wallet profile:

```ts
const bytes = await wallet.exportBackup({ password }); // Uint8Array

const restored = new RgbLibWeb({
  network: 'testnet',
  mnemonic,
  dataDir: 'restored',
});
await restored.init();
await restored.restoreBackup({ bytes, password });
await restored.unlock();
```

A wallet with local data is not overwritten unless you pass
`{ overwrite: true }`. A backup restores only with this engine. All the rules
are in [docs/backup.md](docs/backup.md).

## Configuration

One object for `RgbLibWeb.create(config)` and `new RgbLibWeb(config)`:

| Field                                              | Meaning                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network`                                          | `mainnet`, `testnet`, `testnet4`, `signet`, `regtest` or `utexo`                                                                                                 |
| `mnemonic`                                         | the wallet mnemonic; or use `keys`                                                                                                                               |
| `keys`                                             | a function or `{ getMnemonic }` that returns the mnemonic on `init()`, optionally with public keys that must match; or public keys alone for a watch-only wallet |
| `dataDir`                                          | IndexedDB key prefix. Default `':memory:'`, which is a prefix too: the state is still saved to IndexedDB and restored with the same keys                         |
| `reuseAddresses`                                   | one pinned address instead of a new one per call                                                                                                                 |
| `maxAllocationsPerUtxo`                            | default 5                                                                                                                                                        |
| `indexerUrl` / `indexer`                           | Esplora server; default per network                                                                                                                              |
| `proxyEndpoint`                                    | RGB proxy; default per network                                                                                                                                   |
| `evmRpcUrls`, `evmMintLockBlocks`, `proxyAuthKeys` | BFA mint locks and proxy auth                                                                                                                                    |
| `wasmUrl`                                          | where to load `rgb_lib_wasm_bindings_bg.wasm` from; default next to the module's JS                                                                              |
| `runtime`                                          | an initialized `@utexo/rgb-lib-wasm` module, or a test double; not with `wasmUrl`                                                                                |
| `vssUrl`                                           | VSS backup server; default the UTEXO server (on regtest: off), `null` turns VSS off                                                                              |
| `vss`                                              | an explicit VSS identity `{ serverUrl, storeId, signingKey }` instead of the derived one; not with `vssUrl`                                                      |

Pass exactly one of `mnemonic` and `keys`, and at most one of `runtime` and
`wasmUrl`.

Network defaults:

| Network                        | Enough to set `network` alone?                                                |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `testnet`, `testnet4`, `utexo` | Yes: UTEXO Esplora and proxy                                                  |
| `mainnet`, `signet`            | No: the default indexer is Electrum, so set `indexerUrl` to an Esplora server |
| `regtest`                      | No: set `indexerUrl` and `proxyEndpoint` to your local stand                  |

`unlock(params)` connects with other settings than the config's.

## API

| Group     | Methods                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Lifecycle | `RgbLibWeb.create()`, `init()`, `unlock()` / `goOnline()`, `destroy()`, `isDisposed()`                     |
| Network   | `getNetwork()`, `getNetworkInfo()`, `getWalletIdentity()`, `estimateFeeRate()`                             |
| Bitcoin   | `getAddress()`, `getBtcBalance()`, `listUnspents()`, `createUtxos()`, `sendBtc()`                          |
| Assets    | `listAssets()`, `getAssetBalance()`, `issueAssetNia()`, `issueAssetIfa()`, `inflate()`                     |
| Invoices  | `onchainReceive()`, `witnessReceive()`, `blindReceive()`, `decodeRGBInvoice()`, `onchainSend()`            |
| Transfers | `listTransfers()`, `listTransactions()`, `refresh()`, `refreshWallet()`, `syncWallet()`, `failTransfers()` |
| Backup    | `exportBackup()`, `restoreBackup()`, `backupToVss()`, `restoreFromVss()`, `getVssBackupInfo()`             |

## Error handling

Errors have a stable `code`, the `operation` and the `protocol`. Check them with
`isEngineError` from `@utexo/rgb-sdk-core`, not with `instanceof`: an error from
the WASM runtime passes through as it is.

```ts
import { isEngineError } from '@utexo/rgb-sdk-core';

try {
  await wallet.onchainSend({ invoice, amount: 100, feeRate: 2 });
} catch (error) {
  if (isEngineError(error, 'INSUFFICIENT_FUNDS')) {
    // fund the wallet or create UTXOs
  } else if (isEngineError(error)) {
    console.warn(error.code, error.operation);
  } else {
    throw error;
  }
}
```

Common codes: `INVALID_CONFIG`, `INVALID_PARAMS`, `INSUFFICIENT_FUNDS`,
`KEYS_UNAVAILABLE`, `UNSUPPORTED_CAPABILITY` (for example sending from a
watch-only wallet), `WALLET_INVALID_STATE`, `NATIVE_ERROR`.

## With the facade

```ts
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibWeb } from '@utexo/rgb-sdk-web';

const wallet = new UTEXOWallet({
  engine: new RgbLibWeb({ network: 'testnet', mnemonic }),
});
await wallet.init();
```

## Examples

[`examples/`](examples/README.md) has one file per flow: a new wallet, reading a
wallet, UTXOs and issuing, a transfer.

## Development

```bash
npm install
npm test          # typecheck, lint, build, unit tests (node:test), examples
npm run test:e2e  # Playwright over the real WASM; needs the regtest stand (tests/e2e/README.md)
npm run capture:fixtures  # re-capture raw runtime values (tests/fixtures/README.md)
npm run golden:update     # rewrite the golden results after an intended change
RGB_LIB_WASM_SRC=<rgb-lib-wasm checkout> npm run errors:check  # the error table matches the Rust source
```

How the package is built: [docs/architecture.md](docs/architecture.md).

## Related packages

- [`@utexo/rgb-sdk-rn`](https://github.com/UTEXO-Protocol/rgb-sdk-rn): the
  React Native engine.
- [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk): the
  `UTEXOWallet` facade and WebRGB.
- [`@utexo/rgb-sdk-core`](https://github.com/UTEXO-Protocol/rgb-sdk-core):
  shared types, errors, key helpers and the engine contract.
- [`@utexo/rgb-lib-wasm`](https://www.npmjs.com/package/@utexo/rgb-lib-wasm):
  the WASM runtime this engine runs on.

## License

See [LICENCE](LICENCE).
