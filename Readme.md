# RGB SDK for Web

[`@utexo/rgb-sdk-web`](https://www.npmjs.com/package/@utexo/rgb-sdk-web)

> **Beta release** — APIs may change between releases.
> Report issues on [GitHub](https://github.com/UTEXO-Protocol/rgb-sdk-web/issues).

Browser-first TypeScript SDK for in-browser RGB assets and Lightning payments via the **RGB Lightning Node (RLN)** — an LDK-based node compiled to WebAssembly that runs entirely in the browser. No RGB server, no Node.js, no native binaries.

[![npm version](https://img.shields.io/npm/v/@utexo/rgb-sdk-web)](https://www.npmjs.com/package/@utexo/rgb-sdk-web)
[![license](https://img.shields.io/npm/l/@utexo/rgb-sdk-web)](https://www.npmjs.com/package/@utexo/rgb-sdk-web)

> **Note**: The web SDK of the UTEXO RGB SDK ecosystem. Use [`@utexo/rgb-sdk`](https://github.com/UTEXO-Protocol/rgb-sdk) for Node.js and [`@utexo/rgb-sdk-rn`](https://github.com/UTEXO-Protocol/rgb-sdk-rn) for React Native. The `UTEXOWallet` surface mirrors the RN SDK, so app code ports across web ↔ mobile with minimal change.

## Requirements

- **Browser environment** — any modern browser with WebAssembly and top-level `await` support (Chrome, Firefox, Safari, Edge)
- **ESM bundler** (Vite, Webpack 5, Rollup, esbuild) — this package is ESM-only, no CommonJS
- At create time: an Esplora/Electrum indexer, an RGB proxy (transport) endpoint, and — for Lightning — a WebSocket LN gateway. Known networks get defaults — see [Default endpoints](#default-endpoints)
- Not compatible with Node.js or React Native (see the sibling SDKs above)

## Install

```bash
npm install @utexo/rgb-sdk-web
```

### Bundler setup (Vite)

The WASM module initializes asynchronously; exclude the package from Vite's dependency pre-bundling and enable WASM + top-level-await support:

```typescript
// vite.config.ts
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), react()],
  optimizeDeps: { exclude: ['@utexo/rgb-sdk-web'] },
});
```

## Quick start

```typescript
import { UTEXOWallet, generateKeys } from '@utexo/rgb-sdk-web';

const network = 'utexo';
const keys = await generateKeys(network);

// Constructor stores params synchronously; init() does all local setup
// (WASM, keys, wallet, node handle) and returns the wallet LOCKED;
// unlock() validates the password and brings it online. indexerUrl /
// transportEndpoint / proxyUrl default per network when omitted (see
// Default endpoints). One-call alternative: await UTEXOWallet.create(params)
// (constructor + init + unlock).
const wallet = new UTEXOWallet({
  mnemonic: keys.mnemonic,
  password: 'my-secure-password',
  network,
});
await wallet.init();
// Restoring on a new device? await wallet.restoreFromVss() goes HERE
// (see "VSS — encrypted cloud backup & restore").
await wallet.unlock();

// unlock() connects non-fatally — if the indexer was unreachable the wallet
// comes back offline; retry with goOnline() (idempotent). No-arg retries the
// network default indexer (https://esplora-api.utexo.com for 'utexo').
if (!wallet.isOnline()) {
  await wallet.goOnline();
}

// Fund the wallet, then carve out colored UTXOs for RGB
const address = await wallet.getAddress();
// ... send BTC to `address` ...

await wallet.syncWallet();
await wallet.createUtxos({ upTo: true, num: 4, feeRate: 2 });

// RGB invoice — witness by default; share with the sender
const { invoice } = await wallet.onchainReceive({});
console.log('RGB invoice:', invoice);
```

---

## What You Can Do

- Run a full Lightning node in the browser via the RLN WASM SDK
- Open Lightning channels and send/receive BTC or RGB asset payments
- LSP integration: receive RGB via Lightning, send RGB to on-chain recipients, Lightning Address — see [docs/lsp.md](./docs/lsp.md)
- Async payments (APay): hash pool + Lightning Address via utexo-lsp — see [docs/async-payments.md](./docs/async-payments.md)
- Issue, transfer, and manage RGB assets (NIA, IFA, CFA)
- Manage UTXOs and BTC on-chain sends — atomic (`sendBtc`) or 3-step begin → sign → end for external signers
- Encrypted file backup (raw bytes, browser-download friendly) and VSS cloud backup
- HODL invoices: create, claim, cancel

---

## Primary Class: `UTEXOWallet`

`UTEXOWallet` implements `IWalletManager` + `IUTEXOProtocol` and is backed by the RLN WASM node. It mirrors the `@utexo/rgb-sdk-rn` surface: RGB sends are exposed under the RN-parity names (`onchainSend`, `onchainSendBegin`, `onchainSendEnd`), receive is the single `onchainReceive()` entry point.

### Construction

Three-phase, RN-parity lifecycle — the constructor is sync and cheap (params are only stored); `init()` does all the local WASM work (wallet LOCKED); `unlock()` brings it online:

```typescript
import { UTEXOWallet, type UTEXOWalletCreateParams } from '@utexo/rgb-sdk-web';

const wallet = new UTEXOWallet({
  mnemonic: 'word1 word2 ...',
  password: 'my-secure-password',   // RLN SDK password (encrypts local state)
  network: 'utexo',
  // indexerUrl: '...',             // optional — network default
  // transportEndpoint: '...',      // optional — network default
  // proxyUrl: 'ws://...',          // optional — enables the Lightning node
  // lspBaseUrl: 'https://...',     // optional — enables createLsp() auto-discovery
  // lspBearerToken: '...',         // optional — required for APay
});
await wallet.init();     // locked — the gap here is the VSS restore window
await wallet.unlock();   // online
```

`init()` and `unlock()` are idempotent (concurrent calls share one in-flight promise) and retryable after a thrown failure; `unlock()` throws unless `init()` ran first. Wallet/network methods throw until `unlock()` resolves. `UTEXOWallet.create(params)` is a one-call convenience doing exactly constructor + `init()` + `unlock()`.

#### `UTEXOWalletCreateParams`

| Field | Type | Description |
|-------|------|-------------|
| `mnemonic` | `string` | BIP39 mnemonic — required |
| `password` | `string` | RLN SDK password — required (init/unlock of the local wallet state) |
| `network` | `string?` | Bitcoin network (`'utexo'`, `'regtest'`, `'testnet'`, `'mainnet'`, …). Default `'utexo'` |
| `indexerUrl` | `string?` | Esplora/Electrum URL for `goOnline`. Defaults per network. `unlock()` always attempts to connect; failure is non-fatal (wallet returned offline) |
| `transportEndpoint` | `string?` | RGB proxy for consignment delivery. Defaults per network (utexo) |
| `proxyUrl` | `string?` | WebSocket LN gateway URL — enables the embedded Lightning node. Defaults per network (utexo); on networks without a default, omitting it means no Lightning |
| `nodeRuntimeId` | `string?` | Stable runtime ID so node state persists across page reloads |
| `skipConsistencyCheck` | `boolean?` | Skip the indexer consistency check on connect |
| `vssUrl` | `string? \| null` | VSS server URL for encrypted cloud backup. Defaults to `DEFAULT_VSS_SERVER_URL`; pass `null` to disable VSS |
| `dataDir` | `string?` | Local wallet DB directory (default: auto-generated) |
| `supportedSchemas` | `string[]?` | Asset schemas (default `['Nia', 'Ifa']`) |
| `enableVirtualChannels` | `boolean?` | Enable virtual channels v0 on the Lightning node (default `true`). Applies node-wide to all peers, persisted per `nodeRuntimeId` |
| `lspBaseUrl` | `string?` | utexo-lsp HTTP base URL — source for no-arg `createLsp()` peer discovery |
| `lspBearerToken` | `string?` | LSP bearer token — required for APay routes |

### Lifecycle

RN-parity three-phase lifecycle — the init→unlock gap is the explicit VSS-restore window:

1. **`new UTEXOWallet(params)` + `await wallet.init()`** — loads the WASM (singleton), derives keys, creates the wallet from local storage, creates the Lightning node handle (runtime not started, when `proxyUrl` resolves) and configures the VSS backup client. The wallet is **LOCKED**: wallet/network ops throw; key reads (`getXpub`, `getNodePubkey`) and the VSS restore APIs work.
2. **Optional: `await wallet.restoreFromVss({ takeoverFence? })`** — explicit cloud restore on a new device (see the VSS section below). Restore is never automatic.
3. **`await wallet.unlock()`** — validates the password, configures LDK/channel VSS replication (guarded channel restore, pre-runtime) and auto-connects to the indexer non-fatally.
4. **`isOnline()` / `goOnline(indexerUrl)`** — check the connection; retry when offline. `goOnline` is idempotent, so legacy create-then-goOnline code keeps working.
5. **`dispose()`** — release the WASM wallet/node handles. Check with `isDisposed()`.

`UTEXOWallet.create(params)` = constructor + `init()` + `unlock()` in one call; `initialize()` is an alias for the init + unlock sequence.

---

### Method Reference

#### IWalletManager — Balance & Address

| Method | Description |
|--------|-------------|
| `getBtcBalance()` | BTC balance (vanilla + colored) |
| `getAddress()` | Current on-chain deposit address |
| `getXpub()` | `{ xpubVan, xpubCol }` |
| `getNetwork()` | Configured network string |

#### IWalletManager — UTXO Management

| Method | Description |
|--------|-------------|
| `createUtxos({ upTo?, num?, size?, feeRate? })` | Create UTXOs — atomic (begin → sign → end) |
| `createUtxosBegin(params)` / `createUtxosEnd({ signedPsbt })` | 3-step variant for external signing |
| `listUnspents()` | List unspent UTXOs with RGB allocations |

#### IWalletManager — Assets

| Method | Description |
|--------|-------------|
| `listAssets()` | All RGB assets |
| `getAssetBalance(assetId)` | Balance for one asset |
| `issueAssetNia({ ticker, name, precision, amounts })` | Issue a Non-Inflatable Asset |
| `issueAssetIfa({ ticker, name, precision, amounts, inflationAmounts, replaceRightsNum, rejectListUrl })` | Issue an Inflatable Fungible Asset |
| `issueAssetCfa(params)` | Issue a CFA asset (requires the Lightning node) |
| `inflate(params)` / `inflateBegin` / `inflateEnd` | Inflate an IFA asset (atomic or 3-step) |
| `sendRgbFromGroups(params)` | Group-based RGB asset send |
| `decodeRGBInvoice({ invoice })` | Decode an RGB invoice |

#### IUTEXOProtocol — Onchain (RGB)

| Method | Description |
|--------|-------------|
| `onchainReceive({ assetId?, amount?, durationSeconds?, minConfirmations?, witness? })` | RGB invoice — witness by default. Pass `witness: false` for a blinded invoice. Returns `{ invoice, recipientId, expirationTimestamp }` |
| `onchainSend({ invoice, assetId?, amount?, donation?, feeRate?, minConfirmations?, witnessData? })` | Atomic RGB send (begin → sign with the stored mnemonic → end). `witnessData: { amountSat }` required for witness invoices |
| `onchainSendBegin(params)` / `onchainSendEnd({ signedPsbt })` | 3-step variant for external signing |
| `listOnchainTransfers(assetId?)` | Alias of `listTransfers()` (RN-parity name) |

`blindReceive(params)` and `witnessReceive(params)` remain available as the underlying receive primitives.

#### IWalletManager — BTC Sends

| Method | Description |
|--------|-------------|
| `sendBtc({ address, amount, feeRate })` | Atomic on-chain BTC send |
| `sendBtcBegin(params)` / `sendBtcEnd({ signedPsbt })` | 3-step variant |
| `signPsbt(psbt)` | Sign a PSBT with the wallet mnemonic (BDK path) |

#### IWalletManager — Transactions & Transfers

| Method | Description |
|--------|-------------|
| `listTransactions()` | On-chain transaction history |
| `listTransfers(assetId?)` | RGB transfer history |
| `failTransfers({ batchTransferIdx? })` | Mark pending transfers as failed |
| `refreshWallet()` | Refresh pending RGB transfer state |
| `syncWallet()` | Sync BTC/UTXO blockchain state |

#### IWalletManager — Fees, Backup & Crypto

| Method | Description |
|--------|-------------|
| `estimateFeeRate(blocks)` | Fee rate estimate for target confirmation |
| `estimateFee(psbtBase64)` | Fee estimate for a PSBT |
| `createBackup({ backupPath: '', password })` | Encrypted backup — bytes via `getLastBackupBytes()` |
| `getLastBackupBytes()` | Raw `Uint8Array` of the last backup (web-specific) |
| `restoreFromBackupBytes(bytes, password)` | Restore wallet state from backup bytes (web-specific) |
| `restoreFromVss(opts?)` | Explicit one-call VSS restore — init→unlock gap only (see VSS section) |
| `configureVssBackup(config)` / `disableVssAutoBackup()` | Override / disable VSS (cloud) auto-backup (on by default) |
| `vssBackup(config?)` / `vssBackupInfo(config?)` | Trigger / query a VSS backup |
| `vssClearFence()` / `ldkVssBackupInfo()` | Bare fence clear (locked gap) / channel-replication health |
| `signMessage(message)` / `verifyMessage(message, signature)` | Schnorr message signing with wallet keys |

#### IUTEXOProtocol — Lightning

| Method | Description |
|--------|-------------|
| `createLightningInvoice({ amountSats?, expirySeconds?, asset? })` | Create a Lightning invoice — BTC via `amountSats`, RGB via `asset: { assetId, amount }` (`assetAmount` accepted as an alias for `amount`) |
| `payLightningInvoice({ lnInvoice, amount?, assetId?, assetAmount? })` | Atomic pay via the local RLN node (`amount` is sats) — returns `{ txid: paymentHash, status }` |
| `getLightningSendRequest(paymentHash)` | Poll send status (`'WaitingCounterparty'` → `'Settled'` \| `'Failed'`) |
| `getLightningReceiveRequest(invoice)` | Poll receive status |
| `listLightningPayments()` | List all Lightning payments |

#### IUTEXOProtocol — LSP & Async payments (APay)

| Method | Description |
|--------|-------------|
| `createLsp(peer?, peerPort?)` | Create an `UtexoLsp` session. No-arg: discovers the peer from `lspBaseUrl` via `GET /get_info` (host from the URL, port defaults to 9735). Pass an `LspPeer` to override |
| `getLspConfig()` | `{ baseUrl, bearerToken }` this wallet was created with |
| `apayNewWithAddress(hostNodeId, username, domain)` | Register an attested hash pool (signs `address_sig`) — hash-substitution resistant |
| `apayNew(hostNodeId)` | Register a hash pool without an address attestation |
| `createHodlLnInvoice(params)` | Create a HODL invoice tied to a specific payment hash |
| `claimHodlInvoice(paymentHash, preimage)` | Reveal preimage to claim an inbound HODL payment |
| `cancelHodlInvoice(paymentHash)` | Cancel a HODL invoice |

See **[docs/lsp.md](./docs/lsp.md)** for `UtexoLsp` composed flows and full examples.

#### RLN Extras — Node, Peers & Channels

| Method | Description |
|--------|-------------|
| `getNodeInfo()` / `getNetworkInfo()` | Node pubkey, channel counts, sync status / network info |
| `getNodePubkey()` | Node pubkey (`null` when no Lightning node is configured) |
| `attachLightningNode()` | Attach the wallet to the LN node explicitly (otherwise lazy on first use) |
| `getLightningNode()` | The underlying `IRlnNodeBinding`, or `null` |
| `connectPeer(peerAddr, peerPubkey)` | Connect to a peer (`'host:port'`, pubkey) |
| `disconnectPeer(peerPubkey)` | Disconnect a peer |
| `listPeers()` | List connected peers |
| `openChannel({ peerPubkey, capacitySat, isPublic, assetId?, assetLocalAmount? })` | Open a channel (`capacitySat` / `assetLocalAmount` are `bigint`) — returns the temporary channel ID |
| `closeChannel(channelId, peerPubkey?, force?)` | Close a channel |
| `listChannels()` | List channels |
| `keysend(destPubkey, amtMsat, assetId?, assetAmount?)` | Spontaneous keysend payment |
| `listPayments()` / `getPayment(paymentHash)` | Payment history / one payment — records carry `rawStatus` (unfolded HODL states like `Claimable`) and `preimage` when known |
| `decodeLnInvoice(invoice)` | Decode a Lightning invoice |
| `invoiceStatus(invoice)` | Raw invoice status (`'Pending'` \| `'Paid'` \| `'Expired'`) |

---

## Core Workflows

### Fund, Create UTXOs, Issue an Asset

```typescript
const address = await wallet.getAddress();
// ... send BTC to address, mine/wait for confirmation ...

await wallet.syncWallet();
await wallet.createUtxos({ upTo: true, num: 4, feeRate: 2 });

const asset = await wallet.issueAssetNia({
  ticker: 'DEMO',
  name: 'Demo Token',
  precision: 0,
  amounts: [1000],
});
console.log('Asset ID:', asset.assetId);
```

### Receive RGB Assets

```typescript
// Witness invoice (default — on-chain script receive)
const receive = await wallet.onchainReceive({
  assetId: asset.assetId,   // optional — omit if you don't hold the asset yet
  amount: 100,              // optional
});
console.log(receive.invoice); // share the full rgb:… invoice with the sender

// Blinded UTXO invoice
const blind = await wallet.onchainReceive({ witness: false });
```

### Send RGB Assets

```typescript
// Atomic: begin → sign with the stored mnemonic → end
const result = await wallet.onchainSend({
  invoice: 'rgb:...',
  assetId: asset.assetId,
  amount: 100,
  feeRate: 2,
  // Witness invoices (recipient ID like wvout:…) need witnessData;
  // blind invoices (…utxob:…) must NOT have it:
  witnessData: { amountSat: 1000 },
});

// Or 3-step for a hardware wallet / external signer
const unsignedPsbt = await wallet.onchainSendBegin({ invoice, assetId, amount });
const signedPsbt   = await wallet.signPsbt(unsignedPsbt);
await wallet.onchainSendEnd({ signedPsbt });

// Then poll transfer state
await wallet.refreshWallet();
const transfers = await wallet.listTransfers(asset.assetId);
```

### Send BTC

```typescript
// Atomic
const txid = await wallet.sendBtc({ address: 'bcrt1q...', amount: 10_000, feeRate: 2 });

// 3-step
const unsigned = await wallet.sendBtcBegin({ address, amount: 10_000, feeRate: 2 });
const signed   = await wallet.signPsbt(unsigned);
const txid2    = await wallet.sendBtcEnd({ signedPsbt: signed });
```

### Open a Lightning Channel

```typescript
// Requires the Lightning node (proxyUrl set or defaulted, e.g. utexo)
await wallet.connectPeer('peer.example.com:9735', peerPubkey);

const tempChannelId = await wallet.openChannel({
  peerPubkey,
  capacitySat: 100_000n,
  isPublic: false,
  assetId: asset.assetId,     // optional — RGB asset channel
  assetLocalAmount: 600n,     // optional
});

// Wait for the channel to become usable
let usable = false;
while (!usable) {
  await wallet.syncWallet();
  const channels = await wallet.listChannels();
  usable = channels.some((c) => c.isUsable);
  if (!usable) await new Promise((r) => setTimeout(r, 2000));
}
```

### Lightning Payment

```typescript
// Receiver creates the invoice
const { lnInvoice } = await receiverWallet.createLightningInvoice({
  expirySeconds: 900,
  asset: { assetId, amount: 10 },   // or amountSats for BTC-only
});

// Sender pays (atomic — the node signs internally)
const { txid: paymentHash } = await senderWallet.payLightningInvoice({ lnInvoice });

// Poll until settled
let status = null;
while (status !== 'Settled') {
  status = await senderWallet.getLightningSendRequest(paymentHash);
  if (status === 'Failed') throw new Error('Payment failed');
  if (status !== 'Settled') await new Promise((r) => setTimeout(r, 2000));
}
```

---

## Backup & Restore

Backups return raw `Uint8Array` bytes — no filesystem. Store them with your own mechanism (file download, upload, etc.).

### File backup

```typescript
await wallet.createBackup({ backupPath: '', password: 'backup-password' });
const bytes = wallet.getLastBackupBytes(); // Uint8Array — trigger a download, upload, …
```

### File restore

```typescript
// Restores into the active wallet's in-memory state
wallet.restoreFromBackupBytes(bytes, 'backup-password');
```

### VSS — encrypted cloud backup & restore

VSS (Versioned Storage Service) keeps an encrypted remote copy of the wallet
(RGB assets, stock, BDK state) and the node's LDK/channel state. When a device
is lost or the browser profile is wiped, a fully-functional wallet + node is
restored from the VSS server using only the **mnemonic** and password.

#### Enabling — zero-config

On by default: the identity (signing key + store id) is derived from the
mnemonic at `init()`, the server defaults to `DEFAULT_VSS_SERVER_URL`. Backup
is fully automatic — every state-changing op uploads a wallet snapshot in the
background, and channel state replicates continuously while the node runs. No
extra calls needed during normal operation.

```typescript
new UTEXOWallet({ ..., vssUrl: 'https://vss.example.com' }); // custom server
new UTEXOWallet({ ..., vssUrl: null });                      // disable VSS

const info = await wallet.vssBackupInfo(); // { backupExists, serverVersion, … }
await wallet.vssBackup();                  // force an upload now
```

#### Restoring from VSS

Restore is **explicit** — one call in the init→unlock gap, never automatic
(restoring overwrites local wallet state):

```typescript
const wallet = new UTEXOWallet({ mnemonic, password, network }); // same mnemonic
await wallet.init();            // locked
await wallet.restoreFromVss();  // wallet stream restored now (+ fence takeover)
await wallet.unlock();          // channels restored here, then online
```

The call also takes over the old device's VSS single-writer fence **by
default** (`takeoverFence: true`) — restoring from the mnemonic on a new
device almost always means the old one is gone (wiped profile / dead device),
and a wiped device can never release its own fence. Only restore when that is
actually true: if the old device might still be running, pass
`{ takeoverFence: false }` (two live writers on one channel store risk fund
loss — the old owner stops itself only at its next fence check):

```typescript
await wallet.restoreFromVss({ takeoverFence: false }); // keep the fence
```

`restoreFromVss()` returns `{ walletRestored, serverVersion }`, throws on
failure (no silent fresh start) and throws when called after `unlock()`. Plain
`unlock()` on a fresh device logs a loud warning when an unrestored cloud
backup exists — the next auto-backup would overwrite it. `vssClearFence()` is
still available for a bare fence clear (RN parity), and `ldkVssBackupInfo()`
reports channel-replication health (a held fence shows up in `lastError`).

#### How it works under the hood

- **Identity** is deterministic from the mnemonic: signing key =
  HMAC-SHA256 over the mnemonic, store id = `wallet_<masterFingerprint>` —
  which is why the same mnemonic on any browser reaches the same backup with
  no extra input.
- **Two encrypted streams** on the VSS server: the *wallet stream* (RGB
  assets, stock, BDK state — snapshot uploaded after each state-changing op)
  and the *LDK/channel stream* (`<storeId>-ldk`: channel monitors/manager,
  network graph, per-channel RGB state — replicated continuously while the
  node runs). Values are encrypted client-side; the server never sees keys.
- **Single-writer fence**: the channel stream is guarded so two devices can
  never write the same channel state (stale-commitment / fund-loss risk). A
  page reload re-acquires its own fence; a second browser is refused until
  the fence is taken over (`restoreFromVss()` default) or released.
- **Held fence detected after unlock()** (`ldkVssBackupInfo().lastError`
  matches `owned by another`): recover with `disableLdkVssReplication()` →
  `vssClearFence()` → `unlock()` — unlock runs once, so the disable is what
  makes it retryable.

---

## Default endpoints

Used automatically when the corresponding create param is omitted.

**Full RLN stack defaults** (`DEFAULT_RLN_URLS`):

| Network | LN gateway (`proxyUrl`) | RGB transport (`transportEndpoint`) | Indexer (`indexerUrl`) |
|---------|------------------------|-------------------------------------|------------------------|
| utexo   | `wss://rln-proxy-utexo.utexo.com/rgb/json-rpc` | `rpcs://rgb-proxy.utexo.com/json-rpc` | `https://esplora-api.utexo.com` |

**Indexer-only defaults** (`DEFAULT_INDEXER_URLS`) for the other networks:

| Network  | URL |
|----------|-----|
| mainnet  | `https://esplora-mainnet.utexo.com` |
| testnet  | `https://esplora-testnet3.utexo.com` |
| testnet4 | `https://esplora-testnet4.utexo.com` |

On networks without a `proxyUrl` default, pass one explicitly to enable the Lightning node; without it the wallet is on-chain RGB only.

---

## Standalone helpers

| Function | Description |
|----------|-------------|
| `generateKeys(network?)` | Generate mnemonic, xpubs, master fingerprint |
| `restoreKeys(network, mnemonic)` / `deriveKeysFromMnemonic` / `deriveKeysFromSeed` | Derive keys from existing material |
| `signPsbt(psbt, { mnemonic, network })` | Sign a PSBT standalone (no wallet) |
| `signMessage` / `verifyMessage` | Schnorr message signing (standalone) |
| `deriveVssSigningKeyFromMnemonic(mnemonic)` | VSS signing key derivation |
| `bip39` | Mnemonic validation utilities |
| `initRlnWasm()` | Explicit WASM init (singleton — `create()` calls it automatically) |

---

## `RlnWalletManager` (advanced)

`RlnWalletManager` and the lower-level bindings expose the raw RLN stack when you don't want `UTEXOWallet`'s RN-shaped wrapper:

```typescript
import { RlnWalletManager, RlnWasmBinding, initRlnWasm } from '@utexo/rgb-sdk-web';

const manager = await RlnWalletManager.create({
  mnemonic, password, network: 'utexo',
});
await manager.syncWallet();
const node = manager.getLightningNode();  // IRlnNodeBinding | null
```

Layering: `UTEXOWallet` → `RlnWalletManager` → `RlnWasmBinding` (RGB wallet) + `RlnNodeBinding` (Lightning) → `rln-wasm-sdk` (WASM).

---

## Further reading

| Doc | Description |
|-----|-------------|
| [docs/lsp.md](./docs/lsp.md) | Full LSP reference: `UtexoLsp`, `LspPeer`, all methods, examples |
| [docs/async-payments.md](./docs/async-payments.md) | Async payment (APay) protocol, six-step flow, SDK usage |

---

## Examples

[`examples/`](./examples/) contains ES module snippets showing correct API usage:

| File | What it shows |
|------|---------------|
| `new-wallet.mjs` | Generate keys, `new UTEXOWallet()` + `init()` + `unlock()`, address + balance |
| `read-wallet.mjs` | Read operations and online/offline state |
| `create-utxos-asset.mjs` | Create UTXOs and issue a NIA asset |
| `transfer.mjs` | `onchainReceive()` (witness + blind), `onchainSend()`, transfer polling |
| `utexo-file-backup-restore.mjs` | File backup (`Uint8Array`) and restore |
| `utexo-vss-backup-restore.mjs` | VSS cloud backup |

## Demo App

A full working demo is available at **[rgb-sdk-web-demo](https://github.com/UTEXO-Protocol/rgb-sdk-web-demo)**. It demonstrates:

- `UTEXOWallet` full lifecycle: create → fund → `createUtxos()` → issue assets → send/receive RGB → Lightning invoices, peers & channels
- LSP flows: create + connect, receive asset (Lightning → RGB), send asset (RGB → Lightning), Lightning Address, APay
- File + VSS backup and restore
- Low-level `RlnWalletManager` usage for comparison

```bash
git clone https://github.com/UTEXO-Protocol/rgb-sdk-web-demo
cd rgb-sdk-web-demo
npm install
npm run dev   # Vite dev server on port 5173
```

## TypeScript

All public types are exported: the wallet create params (`UTEXOWalletCreateParams`), the RLN model (`OpenChannelParams`, `LightningChannel`, `LightningPayment`, `CreateHodlLnInvoiceParams`, …), the LSP types (`LspPeer`, `ReceiveAssetOptions`, `WaitOptions`, …) and the shared core models. Amount fields on the low-level Lightning APIs (`capacitySat`, `amtMsat`, `assetAmount`) are `bigint`.
