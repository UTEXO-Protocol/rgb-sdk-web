# @utexo/rgb-sdk-web

> **Beta notice:** This package is currently in beta. Test thoroughly before using in production.

Browser-first TypeScript SDK for the RGB protocol. All operations run locally via WebAssembly — no server, no Node.js, no native binaries required.


`UTEXOWallet` use `WasmRgbLibBinding` under the hood, which wraps `@utexo/rgb-lib-wasm`. WASM initializes automatically inside `WalletManager.create()` — no manual `initWasm()` call needed.

Wallet state is persisted to **IndexedDB** automatically and survives page refresh. There is no `dataDir` option — the browser manages storage.

For full details on security implications and recommended actions, please read **[SECURITY.md](./SECURITY.md)**.

> **RGB Protocol**: This SDK uses the [`rgb-lib-wasm`](https://github.com/UTEXO-Protocol/rgb-lib-wasm) wasm binding library to interact with the RGB protocol. All operations are performed locally, providing full control over wallet data and operations.

---

## Requirements

- **Browser environment** (Chrome, Firefox, Safari, Edge — any modern browser with WASM + IndexedDB support)
- **ESM bundler** (Vite, Webpack 5, Rollup, esbuild) — this package is ESM-only, no CommonJS
- Not compatible with Node.js (use [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk) for server-side usage)
- Not compatible with React Native (use [`@utexo/rgb-sdk-rn`](https://github.com/UTEXO-Protocol/rgb-sdk-rn) for mobile applications)

---

## Installation

```bash
npm install @utexo/rgb-sdk-web
```
---

## Basic Usage

### UTEXOWallet 

```typescript
import { UTEXOWallet, generateKeys } from '@utexo/rgb-sdk-web';

const keys = await generateKeys('testnet');

const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
await wallet.initialize(); 

const address = await wallet.getAddress();
const balance = await wallet.getBtcBalance();
```

---

## Core Workflows

### UTXO Management

```typescript
// One-call: begin → sign → broadcast
const count = await wallet.createUtxos({ num: 5, size: 1000 });

// Or manual begin/end for custom signing
const unsignedPsbt = await wallet.createUtxosBegin({ num: 5, size: 1000 });
const signedPsbt   = await wallet.signPsbt(unsignedPsbt);
await wallet.createUtxosEnd({ signedPsbt });
```

### Issue RGB Assets

```typescript
// Non-Inflatable Asset (NIA)
const asset = await wallet.issueAssetNia({
  ticker: 'USDT',
  name: 'Tether USD',
  amounts: [1000000],
  precision: 6,
});
console.log(asset.assetId);

// Inflatable Asset (IFA)
const ifa = await wallet.issueAssetIfa({
  ticker: 'IFA',
  name: 'My IFA',
  amounts: [500],
  inflationAmounts: [1000],
  replaceRightsNum: 1,
  precision: 0,
  rejectListUrl: null,
});
```

### Receive RGB Assets

```typescript
// Blinded UTXO invoice
const blind = await wallet.blindReceive({
  assetId: 'rgb:...',
  amount: 100,
  minConfirmations: 1,
  durationSeconds: 3600,
});
console.log(blind.invoice); // share with sender

// Witness (on-chain script) invoice
const witness = await wallet.witnessReceive({
  assetId: 'rgb:...',
  amount: 50,
});
console.log(witness.invoice);
```

### Send RGB Assets

```typescript
// One-call: begin → sign → broadcast
await wallet.send({
  invoice: 'rgb1...',
  assetId: 'rgb:...',
  amount: 100,
});

// Witness invoice: include witnessData (sat amount for the output)
await wallet.send({
  invoice: witnessInvoice,
  assetId: 'rgb:...',
  amount: 50,
  witnessData: { amountSat: 1000 },
});

// Manual begin/end for hardware wallet or external signer
const unsignedPsbt = await wallet.sendBegin({
  invoice: 'rgb1...',
  assetId: 'rgb:...',
  amount: 100,
});
const signedPsbt = await wallet.signPsbt(unsignedPsbt);
await wallet.sendEnd({ signedPsbt });
```

### Send BTC

```typescript
const unsignedPsbt = await wallet.sendBtcBegin({
  address: 'tb1q...',
  amount: 10000,   // satoshis
  feeRate: 2,
});
const signedPsbt = await wallet.signPsbt(unsignedPsbt);
const txid = await wallet.sendBtcEnd({ signedPsbt });
```

### Decode an RGB Invoice

```typescript
const data = await wallet.decodeRGBInvoice({ invoice: 'rgb1...' });
console.log(data.assetId, data.assignment, data.transportEndpoints);
```

### Transfers & Transactions

```typescript
await wallet.refreshWallet();

const transfers    = await wallet.listTransfers('rgb:...');
const transactions = await wallet.listTransactions();
const unspents     = await wallet.listUnspents();
```

---

## Backup & Restore

Backups return raw `Uint8Array` bytes — no filesystem. Store them with your own mechanism (file download, vss, etc.).

### WalletManager backup

```typescript
// File backup — returns raw bytes
await wallet.createBackup({ password: 'secure-password' });
const bytes = wallet.getLastBackupBytes(); // Uint8Array

// VSS (cloud) backup — requires explicit config
await wallet.configureVssBackup({ serverUrl, storeId, signingKey });
await wallet.vssBackup();
const info = await wallet.vssBackupInfo();
```

### UTEXOWallet backup local and VSS (cloud)

```typescript
// File backup — returns bytes for both layer1 and utexo wallets
const { layer1Bytes, utexoBytes } = await wallet.createBackup({
  password: 'secure-password',
});
// Download or store layer1Bytes and utexoBytes separately
```
or
```typescript
// VSS (cloud) backup — config is derived automatically from the mnemonic
await wallet.vssBackup();
const info = await wallet.vssBackupInfo();
```

### Restore

```typescript
import { restoreUtxoWalletFromBackup, restoreUtxoWalletFromVss } from '@utexo/rgb-sdk-web';

// From file bytes (Uint8Array from file input or download)
await restoreUtxoWalletFromBackup({
  layer1Bytes,
  utexoBytes,
  password: 'secure-password',
  mnemonic: keys.mnemonic,
  network: 'testnet',
});
// Then initialize a new UTEXOWallet — state is in IndexedDB

// From VSS
await restoreUtxoWalletFromVss({
  mnemonic: keys.mnemonic,
  network: 'testnet',
  vssServerUrl: 'https://vss.example.com',
});
```

---

## Key Utilities

```typescript
import {
  generateKeys,
  deriveKeysFromMnemonic,
  deriveKeysFromSeed,
  signPsbt,
  signMessage,
  verifyMessage,
  bip39,
} from '@utexo/rgb-sdk-web';

// Generate new keys
const keys = await generateKeys('mainnet');

// Derive from existing mnemonic
const derived = await deriveKeysFromMnemonic('testnet', 'word1 word2 ...');

// Sign PSBT standalone (no WalletManager)
const signed = await signPsbt(unsignedPsbt, { mnemonic: keys.mnemonic, network: 'testnet' });

// Sign/verify arbitrary messages (Schnorr)
const { signature } = await signMessage({ message: 'Hello RGB!', seed: seedHex, network: 'testnet' });
const valid = await verifyMessage({ message: 'Hello RGB!', signature, accountXpub: keys.accountXpubVanilla, network: 'testnet' });

// Validate a mnemonic
const isValid = bip39.validateMnemonic(phrase);
```

---

## Default Endpoints

Used automatically when no custom endpoint is passed:

**Transport (RGB protocol)**

| Network   | URL |
|-----------|-----|
| UTEXO     | `rpcs://rgb-proxy-utexo.utexo.com/json-rpc` |
| Mainnet   | `rpcs://rgb-proxy-mainnet.utexo.com/json-rpc` |
| Testnet   | `rpcs://rgb-proxy-testnet3.utexo.com/json-rpc` |
| Testnet4  | `rpcs://proxy.iriswallet.com/0.2/json-rpc` |
| Signet    | `rpcs://proxy.iriswallet.com/0.2/json-rpc` |
| Regtest   | `rpcs://proxy.iriswallet.com/0.2/json-rpc` |

**Indexer (Bitcoin data)**

| Network   | URL |
|-----------|-----|
| UTEXO     | `https://esplora-api.utexo.com` |
| Mainnet   | `ssl://electrum.iriswallet.com:50003` |
| Testnet   | `ssl://electrum.iriswallet.com:50013` |
| Testnet4  | `ssl://electrum.iriswallet.com:50053` |
| Signet    | `ssl://electrum.iriswallet.com:50033` |
| Regtest   | `tcp://regtest.thunderstack.org:50001` |

---

## WalletManager API Reference

| Method | Description |
|--------|-------------|
| `WalletManager.create(params)` | Async factory — loads WASM, creates wallet |
| `goOnline(indexerUrl?)` | Connect to indexer (required before network ops) |
| `registerWallet()` | Get initial address + BTC balance snapshot |
| `getAddress()` | New Bitcoin deposit address |
| `getBtcBalance()` | BTC balance (`vanilla` + `colored`) |
| `getXpub()` | Vanilla and colored xpubs |
| `getNetwork()` | Current network name |
| `listUnspents(settledOnly?)` | RGB-colored UTXOs |
| `listAssets()` | All known RGB assets |
| `getAssetBalance(assetId)` | Balance for one asset |
| `getAssetMetadata(assetId)` | Asset name, ticker, precision, supply |
| `createUtxos(params)` | Create UTXOs in one call |
| `createUtxosBegin(params)` | Prepare UTXO creation PSBT |
| `createUtxosEnd(params)` | Broadcast signed UTXO PSBT |
| `blindReceive(params)` | Blinded UTXO invoice |
| `witnessReceive(params)` | Witness script invoice |
| `decodeRGBInvoice(params)` | Decode an RGB invoice string |
| `send(params)` | Full send (begin → sign → end) |
| `sendBegin(params)` | Prepare send PSBT from invoice |
| `sendBeginBatch(params)` | Prepare send PSBT from recipient map |
| `sendEnd(params)` | Broadcast signed send PSBT |
| `sendBtcBegin(params)` | Prepare BTC send PSBT |
| `sendBtcEnd(params)` | Broadcast signed BTC PSBT |
| `signPsbt(psbt)` | Sign PSBT with wallet mnemonic |
| `refreshWallet()` | Sync + refresh transfer state |
| `syncWallet()` | Trigger indexer sync |
| `listTransactions()` | BTC-level transactions |
| `listTransfers(assetId?)` | RGB transfer history |
| `failTransfers(params)` | Mark pending transfers as failed |
| `createBackup(params)` | Encrypted backup (bytes via `getLastBackupBytes()`) |
| `getLastBackupBytes()` | Raw `Uint8Array` from last backup |
| `vssBackup()` | Upload backup to VSS server |
| `vssBackupInfo()` | Query VSS backup status |

---

## Examples

[`examples/`](./examples/) contains ES module snippets showing correct API usage. Import them as copy-paste references when building browser apps.

| File | What it shows |
|------|---------------|
| `new-wallet.mjs` | Generate keys, initialize `UTEXOWallet`, get address + balance |
| `read-wallet.mjs` | Offline vs online read operations |
| `create-utxos-asset.mjs` | Create UTXOs and issue a NIA asset |
| `transfer.mjs` | Blind + witness receive, `send()`, `refreshWallet()`, `listTransfers()` |
| `utexo-vss-backup-restore.mjs` | VSS cloud backup and restore |
| `utexo-file-backup-restore.mjs` | File backup (`Uint8Array`) and restore |

---

## TypeScript

All public types are exported. The raw WASM JSON shapes (snake_case) are available under the `WasmJson` namespace:

```typescript
import type { WasmJson } from '@utexo/rgb-sdk-web';

type RawRecipient = WasmJson.Recipient;  // { recipient_id, assignment, ... }
```
