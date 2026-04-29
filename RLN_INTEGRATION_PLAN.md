# RLN WASM Integration Plan (v3)

## Context

This plan covers adding `@utexo/rln-wasm` as a second binding in `rgb-sdk-web`, with all interface changes to `rgb-sdk-core` designed to be **reusable across all platforms** (WASM web, React Native TurboModule, and future Kotlin UniFFI).

Current platform landscape:

| Platform | SDK repo | Native layer | Binding class |
|---|---|---|---|
| Web browser | `rgb-sdk-web` | `@utexo/rgb-lib-wasm` (WASM) | `WasmRgbLibBinding` |
| React Native | `rgb-sdk-rn` | TurboModule (Swift/Kotlin) | `RNRgbLibBinding` |
| Android/Kotlin | _(future)_ | UniFFI | _(TBD)_ |
| Web + Lightning | `rgb-sdk-web` [this PR] | `rln-wasm-sdk` (WASM) | `RlnWasmBinding` [NEW] |

All bindings share interfaces and base classes from `@utexo/rgb-sdk-core`.

**Important:** `RlnWasmBinding` does **not** import or depend on `@utexo/rgb-lib-wasm` at all. Everything goes through `rln-wasm-sdk-pkg` only, which bundles its own RGB wallet layer internally.

---

## Interface Design Decision

### Problem

`IRgbLibBinding` (existing) covers the rgb-lib wallet surface. RLN exposes a **much larger surface** via `RlnWasmSdk`:

- RGB wallet operations (similar to rgb-lib, some differences in API shape)
- Native Lightning node: channels, payments, peers, HODL invoices, keysend
- Asset-level Swaps (maker/taker atomic swaps)
- Media uploads for assets
- Lock/unlock (SDK-level state)
- Group-based RGB sends (`sendRgbFromGroups`)
- Runtime / LDK status

Extending `IRgbLibBinding` directly would force all existing implementations (RN, web) to handle methods they don't support, and would conflate two very different concerns (RGB wallet and LN node).

### Decision: Additive interface hierarchy, no breaking changes

Keep `IRgbLibBinding` unchanged. Add new focused interfaces on top:

```
rgb-sdk-core interfaces:
─────────────────────────────────────────────────────────────
IRgbLibBinding          (EXISTING — unchanged)
    ↑ implemented by: WasmRgbLibBinding (web), RNRgbLibBinding (RN)

IRlnWalletBinding       (NEW — extends IRgbLibBinding)
    adds: sendRgbFromGroups(), postAssetMedia()
    ↑ implemented by: RlnWasmBinding (web), future Kotlin UniFFI binding

IRlnNodeBinding         (NEW — standalone, not extends IRgbLibBinding)
    covers: channels, payments, peers, invoices, HODL, keysend, status
    ↑ implemented by: RlnNodeBinding (web), future Kotlin UniFFI binding

IRlnSdkBinding          (NEW — combines wallet + node)
    extends IRlnWalletBinding
    adds: initSdk(), lock(), unlock(), nodeInfo(), swaps
    optional node: IRlnNodeBinding | null
    ↑ this is the "full RLN capability" contract
```

**Why this works for Kotlin UniFFI:**
- UniFFI exposes Rust functions as regular methods — same interface shape
- The Kotlin binding will implement `IRlnWalletBinding` + `IRlnNodeBinding` wrapping UniFFI-generated stubs
- `rgb-sdk-core` interfaces are TypeScript — they become the source of truth for contracts; Kotlin typings are generated/verified against them during integration
- No changes to `rgb-sdk-core` should be needed when adding Kotlin — only a new implementation

---

## `RlnWasmSdk` — entry point and object model

The correct entry point is **`RlnWasmSdk`** — the stateful facade.

### Class hierarchy (v3 — updated)

```
RlnWasmSdk (main object — holds internal SDK state)
├── initJson(password, mnemonic?)
│     → initializes SDK + creates WASM_SDK_DEFAULT_WALLET from mnemonic (auto-attached to nodes)
│
├── createWalletHandle(walletDataJson) → RlnWasmSdkWalletHandle  ← preferred for wallet ops
├── createWalletHandleAsync(walletDataJson) → Promise<RlnWasmSdkWalletHandle>
├── createWallet(walletDataJson) → Promise<RlnWasmWallet>         ← async direct wallet
├── newWallet(walletDataJson) → RlnWasmWallet                     ← sync direct wallet
│
├── createNodeHandle(proxyUrl) → RlnWasmSdkNodeHandle
│     → also auto-attaches WASM_SDK_DEFAULT_WALLET to the node
├── newNode(proxyUrl) → RlnWasmNode
│     → also auto-attaches WASM_SDK_DEFAULT_WALLET to the node
│
├── attachWallet(node, wallet)     ← explicit wallet↔node bridge (override auto-attach)
│
├── wallet ops via SDK (take wallet arg):
│     walletGetAddress(wallet), walletGetBtcBalanceJson(wallet),
│     walletListAssetsJson(wallet), walletListTransactionsJson(wallet),
│     walletGetAssetMediaJson(wallet), walletIssueAssetUdaJson(wallet),
│     walletSendRgbFromGroupsJson(wallet)
│
├── node+wallet ops via SDK (take node arg — node must have wallet attached):
│     issueAssetNiaJson(node, req), issueAssetCfaJson(node, req)
│
├── node ops via SDK (take node arg):
│     sendPaymentJson(node, ...), listChannelsJson(node, ...), etc.
│
├── global ops:    sendRgbFromGroupsJson(req), postAssetMediaJson(mime, hex)
├── swap ops:      makerInitJson(), makerExecuteJson(), taker(), getSwapJson(), listSwapsJson()
└── misc:          lock(), unlock(), version(), healthcheck(), runtimeCapabilitiesJson()
```

### Key architectural insight: auto wallet attachment

`initJson(password, mnemonic)` does two things:
1. Stores mnemonic in `WASM_SDK_LIFECYCLE_STATE` (thread-local)
2. Creates a `WASM_SDK_DEFAULT_WALLET` (thread-local) from that mnemonic

When `createNodeHandle(proxyUrl)` or `newNode(proxyUrl)` is called, the SDK **automatically attaches** `WASM_SDK_DEFAULT_WALLET` to the new node. Additionally, `with_attached_wallet` (called internally by `issueAssetNia` etc.) lazily retries auto-attachment if no wallet is set.

This means:
- After `sdk.initJson(password, mnemonic)` + `sdk.createNodeHandle(proxyUrl)` → the node **already has the wallet attached** and can issue assets
- `attachWallet(node, wallet)` is an explicit override for cases where a non-default wallet is needed
- `lock()` clears `WASM_SDK_DEFAULT_WALLET` — nodes lose wallet access after lock

### Handle vs direct object

`RlnWasmSdkWalletHandle` and `RlnWasmSdkNodeHandle` are reference-counted handles to wallet/node state held **inside the SDK**. They avoid Rust ownership transfer issues in WASM. Prefer handles over direct `RlnWasmWallet`/`RlnWasmNode` objects.

### Single `RlnWasmWallet` pattern — confirmed from official example

The official example (`manual_js_rgb_asset_transfer.js`) **exclusively uses `RlnWasmWallet`** (via `sdk.createWallet()`) for all wallet operations. `RlnWasmSdkWalletHandle` is never used. `RlnWasmWallet` has the complete surface including methods the handle lacks:
- `blindReceiveJson` / `witnessReceiveJson`
- `getAssetBalanceJson` / `getAssetBalanceValue`
- `getAssetMetadataJson`
- `listTransfersJson` / `listTransfersValue`
- `listUnspentsJson(settled_only)` — sync, no online ref needed
- `getWalletDataJson()` — useful for wallet inspection

**Conclusion: `RlnWasmBinding` uses a single `RlnWasmWallet` object for all wallet operations.** No `walletHandle` needed.

### Asset issuance — node-side (v3 change)

`issueAssetNia` and `issueAssetCfa` are **not** on the wallet. They are on:
- `RlnWasmNode.issueAssetNiaJson(request)` — direct node
- `RlnWasmSdkNodeHandle.issueAssetNiaJson(request)` — node handle (preferred)
- `RlnWasmSdk.issueAssetNiaJson(node, request)` — SDK facade

Only `issueAssetUdaJson` is on `RlnWasmWallet` directly.

---

## Initialization sequence

Confirmed from `manual_js_rgb_asset_transfer.js` (official example):

```typescript
// 1. Init WASM
await initRlnWasm();

// 2. Create SDK
const sdk = new RlnWasmSdk();

// 3. Init lifecycle state (stores mnemonic in WASM_SDK_LIFECYCLE_STATE)
await sdk.initValue(params.password, params.mnemonic);

// 4. Unlock SDK (separate step — initValue alone does not unlock)
await sdk.unlock(JSON.stringify({ password: params.password }));

// 5. Build walletData from keys derived via rgbRestoreKeysValue
//    walletData shape: { data_dir, bitcoin_network, database_type,
//      max_allocations_per_utxo, account_xpub_vanilla, account_xpub_colored,
//      mnemonic, master_fingerprint, vanilla_keychain, supported_schemas }
const walletDataJson = JSON.stringify(walletData);

// 6. Create wallet — single object for ALL wallet ops
const wallet = await sdk.createWallet(walletDataJson);

// 7. (Optional) Create LN node + explicitly attach wallet
if (params.proxyUrl) {
  const nodeHandle = sdk.createNodeHandle(params.proxyUrl);
  nodeHandle.attachWallet(wallet);   // explicit — not relying on auto-attach
  const rlnNode = new RlnNodeBinding(sdk, nodeHandle);
}

// 8. Go online (required before any network op) — called on wallet directly
const onlineRef = await wallet.goOnlineValue(skipConsistencyCheck, indexerUrl);
```

**PSBT signing** is externalized — the app injects a `signPsbt(unsignedPsbt: string): Promise<string>` function. `RlnWasmBinding.signPsbt()` delegates to the BDK-based signer in `src/crypto/signer.ts` (uses `@bitcoindevkit/bdk-wallet-web`, not `rgb_lib_wasm`).

---

## Files to Create / Change

### rgb-sdk-core (shared platform contract)

#### `src/interfaces/IRlnWalletBinding.ts` [NEW]

Extends `IRgbLibBinding` with RLN wallet-specific extras:

```typescript
import type { IRgbLibBinding } from './IRgbLibBinding';
import type {
  SendRgbFromGroupsRequest,
  SendRgbFromGroupsResult,
} from '../types/rln-model';

export interface IRlnWalletBinding extends IRgbLibBinding {
  /**
   * Group-based RGB asset send — RLN's alternative to sendBeginBatch.
   * Sends multiple asset groups in a single transaction via the SDK-level call.
   */
  sendRgbFromGroups(params: SendRgbFromGroupsRequest): Promise<SendRgbFromGroupsResult>;

  /**
   * Upload asset media (image/video) to the RGB proxy.
   * Returns a digest string.
   */
  postAssetMedia(mimeType: string, bytesHex: string): Promise<string>;
}
```

#### `src/interfaces/IRlnNodeBinding.ts` [NEW]

Standalone interface for direct Lightning node operations:

```typescript
import type {
  LightningChannel,
  OpenChannelParams,
  LightningInvoice,
  CreateLnInvoiceParams,
  CreateHodlLnInvoiceParams,
  LightningPayment,
  SendPaymentParams,
  SendPaymentResult,
  KeysendParams,
  LightningPeer,
  LightningNodeInfo,
  LdkRuntimeStatus,
  LightningNetworkInfo,
  InvoiceStatus,
  DecodedLnInvoice,
  HodlInvoiceResult,
  PaymentStatusUpdate,
  ListRuntimeEventsResult,
  IssueAssetNiaRequest,
  IssueAssetCfaRequest,
  AssetNIA,
  AssetCFA,
} from '../types/rln-model';

export interface IRlnNodeBinding {
  // ── Asset Issuance (node-side, requires wallet attached) ─────────────────
  issueAssetNia(params: IssueAssetNiaRequest): Promise<AssetNIA>;
  issueAssetCfa(params: IssueAssetCfaRequest): Promise<AssetCFA>;

  // ── Channels ─────────────────────────────────────────────────────────────
  openChannel(params: OpenChannelParams): Promise<string>;
  closeChannel(channelId: string, peerPubkey?: string, force?: boolean): void;
  listChannels(): Promise<LightningChannel[]>;

  // ── Payments ──────────────────────────────────────────────────────────────
  createLnInvoice(params: CreateLnInvoiceParams): Promise<LightningInvoice>;
  sendPayment(params: SendPaymentParams): Promise<SendPaymentResult>;
  keysend(params: KeysendParams): Promise<SendPaymentResult>;
  listPayments(): Promise<LightningPayment[]>;
  getPayment(paymentHash: string): Promise<LightningPayment | null>;
  invoiceStatus(invoice: string): Promise<InvoiceStatus>;
  failPendingPayments(): Promise<void>;
  updatePaymentStatus(params: PaymentStatusUpdate): Promise<void>;

  // ── HODL invoices ─────────────────────────────────────────────────────────
  createHodlLnInvoice(params: CreateHodlLnInvoiceParams): Promise<LightningInvoice>;
  cancelHodlInvoice(paymentHash: string): Promise<HodlInvoiceResult>;
  claimHodlInvoice(paymentHash: string, preimage: string): Promise<HodlInvoiceResult>;

  // ── Peers ─────────────────────────────────────────────────────────────────
  connectPeer(peerAddr: string, peerPubkey: string): Promise<void>;
  disconnectPeer(peerPubkey: string): Promise<void>;
  listPeers(): Promise<LightningPeer[]>;

  // ── Info & Status ─────────────────────────────────────────────────────────
  nodeInfo(): Promise<LightningNodeInfo>;
  networkInfo(): Promise<LightningNetworkInfo>;
  ldkRuntimeStatus(): Promise<LdkRuntimeStatus>;
  listRuntimeEvents(): Promise<ListRuntimeEventsResult>;

  // ── Decoding ──────────────────────────────────────────────────────────────
  decodeLnInvoice(invoice: string): Promise<DecodedLnInvoice>;
  decodeRgbInvoice(invoice: string): Promise<unknown>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  signMessage(message: string): Promise<string>;
}
```

#### `src/interfaces/IRlnSdkBinding.ts` [NEW]

Top-level contract for the full RLN capability set:

```typescript
import type { IRlnWalletBinding } from './IRlnWalletBinding';
import type { IRlnNodeBinding } from './IRlnNodeBinding';
import type {
  RlnSdkInitParams,
  SwapMakerInitParams,
  SwapMakerInitResult,
  SwapInfo,
} from '../types/rln-model';

export interface IRlnSdkBinding extends IRlnWalletBinding {
  /** SDK-level initialization (password + optional mnemonic). */
  initSdk(params: RlnSdkInitParams): Promise<void>;

  /** Lock the SDK (wipe in-memory keys + default wallet). */
  lock(): Promise<void>;

  /** Unlock the SDK with password. */
  unlock(password: string): Promise<void>;

  /** SDK version string. */
  version(): string;

  // ── Swaps (optional — throw NotSupportedError if not available) ───────────
  makerInit(params: SwapMakerInitParams): Promise<SwapMakerInitResult>;
  makerExecute(swapString: string): Promise<void>;
  taker(requestJson: string): Promise<void>;
  getSwap(swapString: string): Promise<SwapInfo>;
  listSwaps(): Promise<SwapInfo[]>;

  // ── Node access ───────────────────────────────────────────────────────────
  /** Returns the LN node binding, null if proxyUrl was not configured. */
  getLightningNode(): IRlnNodeBinding | null;
}
```

#### `src/types/rln-model.ts` [NEW]

All new types needed for RLN interfaces:

```typescript
// ── Asset Issuance (node-side) ─────────────────────────────────────────────
export interface IssueAssetNiaRequest {
  ticker: string;
  name: string;
  precision: number;
  amounts: bigint[];
}

export interface IssueAssetCfaRequest {
  name: string;
  precision: number;
  amounts: bigint[];
  description?: string;
  fileDigest?: string;
  fileMime?: string;
  filePath?: string;
}

export interface AssetNIA {
  assetId: string;
  ticker: string;
  name: string;
  precision: number;
  issuedSupply: bigint;
  timestamp: number;
}

export interface AssetCFA {
  assetId: string;
  name: string;
  precision: number;
  issuedSupply: bigint;
  timestamp: number;
  description?: string;
}

// ── Channels ──────────────────────────────────────────────────────────────
export interface LightningChannel {
  channelId: string;
  peerPubkey: string;
  capacitySat: number;
  localBalanceMsat: number;
  remoteBalanceMsat: number;
  isPublic: boolean;
  isActive: boolean;
  assetId?: string;
  assetLocalAmount?: number;
}

export interface OpenChannelParams {
  peerPubkey: string;
  capacitySat: bigint;
  isPublic: boolean;
  assetId?: string;
  assetLocalAmount?: bigint;
}

// ── Invoices & Payments ───────────────────────────────────────────────────
export interface CreateLnInvoiceParams {
  amtMsat?: bigint;
  expirySec: number;
  assetId?: string;
  assetAmount?: bigint;
}

export interface CreateHodlLnInvoiceParams extends CreateLnInvoiceParams {
  paymentHash: string;
}

export interface LightningInvoice {
  invoice: string;
  paymentHash: string;
  expirySeconds: number;
  amtMsat?: bigint;
  assetId?: string;
  assetAmount?: bigint;
}

export type LightningPaymentStatus = 'Pending' | 'Succeeded' | 'Failed';

export interface LightningPayment {
  paymentHash: string;
  amtMsat?: bigint;
  status: LightningPaymentStatus;
  assetId?: string;
  assetAmount?: bigint;
  invoice?: string;
}

export interface SendPaymentParams {
  invoice: string;
  amtMsat?: bigint;
  assetId?: string;
  assetAmount?: bigint;
}

export interface SendPaymentResult extends LightningPayment {}

export interface KeysendParams {
  destPubkey: string;
  amtMsat: bigint;
  assetId?: string;
  assetAmount?: bigint;
}

export type InvoiceStatus = 'Pending' | 'Expired' | 'Paid';

export interface HodlInvoiceResult {
  paymentHash: string;
  status: string;
}

export interface PaymentStatusUpdate {
  paymentHash?: string;
  invoice?: string;
  status: string;
}

// ── Peers ──────────────────────────────────────────────────────────────────
export interface LightningPeer {
  pubkey: string;
  address?: string;
  isConnected: boolean;
}

// ── Node Info ──────────────────────────────────────────────────────────────
export interface LightningNodeInfo {
  pubkey: string;
  numChannels: number;
  numUsableChannels: number;
  localBalanceMsat: number;
}

export interface LightningNetworkInfo {
  network: string;
  blockHeight: number;
}

export interface LdkRuntimeStatus {
  isRunning: boolean;
}

export interface ListRuntimeEventsResult {
  events: unknown[];
}

// ── Decoded invoice ────────────────────────────────────────────────────────
export interface DecodedLnInvoice {
  paymentHash: string;
  amtMsat?: bigint;
  description?: string;
  expirySeconds: number;
  payee?: string;
}

// ── RLN-specific wallet ────────────────────────────────────────────────────
export interface SendRgbFromGroupsRequest {
  groups: unknown;   // SDK-specific shape; platform binding normalizes
}

export interface SendRgbFromGroupsResult {
  txid?: string;
}

// ── SDK lifecycle ──────────────────────────────────────────────────────────
export interface RlnSdkInitParams {
  password: string;
  mnemonic?: string;
}

// ── Swaps ──────────────────────────────────────────────────────────────────
export interface SwapMakerInitParams {
  requestJson: string;
}

export interface SwapMakerInitResult {
  swapString: string;
}

export interface SwapInfo {
  swapString: string;
  status: string;
}
```

#### Extend `src/interfaces/index.ts`

Re-export the three new interfaces so consumers import from `@utexo/rgb-sdk-core`.

---

### rgb-sdk-web — new files

#### `src/wasm/initRln.ts` [NEW]

```typescript
import init from 'rln-wasm-sdk';

let initPromise: Promise<void> | null = null;

export function initRlnWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = init().then(() => undefined);
  }
  return initPromise;
}
```

Mirrors the existing `src/wasm/init.ts`. The two WASM bundles are independent memory spaces; each must be initialized separately.

---

#### `src/binding/RlnWasmTypes.ts` [NEW]

Raw JSON shapes for `RlnWasmSdkWalletHandle.*Json()`, `RlnWasmWallet.*Json()`, and `RlnWasmSdkNodeHandle.*Json()` return values. These are internal translation-layer types, never exported from the package.

Key types:
- `RlnWalletData` — input to `sdk.createWallet()` (includes `data_dir`, `bitcoin_network`, `database_type`, `max_allocations_per_utxo`, `account_xpub_vanilla`, `account_xpub_colored`, `mnemonic`, `master_fingerprint`, `vanilla_keychain`, `supported_schemas`)
- `RlnOnline` — opaque JS object returned by `wallet.goOnlineValue()`; passed to every network call
- `RlnBtcBalance`, `RlnBalance` — shapes of `getBtcBalanceValue()` output
- `RlnListAssets`, `RlnAssetNia`, `RlnAssetCfa`, `RlnAssetUda` — listAssets output
- `RlnTransfer`, `RlnTransaction` — listTransfers / listTransactions output
- `RlnInvoiceReceiveData` — blindReceive / witnessReceive output
- `RlnRecipientMap` — sendBegin recipient map shape (`{ [assetId]: Recipient[] }`)

---

#### `src/binding/RlnWasmBinding.ts` [NEW]

Implements `IRlnSdkBinding` (which transitively covers `IRlnWalletBinding` → `IRgbLibBinding`).

**Internal structure:**
```typescript
export class RlnWasmBinding implements IRlnSdkBinding {
  private sdk: RlnWasmSdk;
  private wallet: RlnWasmWallet;                   // ALL wallet operations
  private nodeHandle: RlnWasmSdkNodeHandle | null = null;  // LN + issueAssetNia/Cfa
  private onlineRef: any = null;       // from wallet.goOnlineValue()
  private lastBackupBytes: Uint8Array | null = null;
  private rlnNode: RlnNodeBinding | null = null;
}
```

**Initialization flow (`static async create(params)`):**
```
1. initRlnWasm()
2. sdk = new RlnWasmSdk()
3. await sdk.initValue(params.password, params.mnemonic)
4. await sdk.unlock(JSON.stringify({ password: params.password }))
5. walletDataJson = buildWalletDataJson(params)   // includes xpubs, mnemonic, data_dir, etc.
6. wallet = await sdk.createWallet(walletDataJson)
7. if (params.proxyUrl):
     nodeHandle = sdk.createNodeHandle(params.proxyUrl)
     nodeHandle.attachWallet(wallet)              // explicit attach
     rlnNode = new RlnNodeBinding(sdk, nodeHandle)
8. return new RlnWasmBinding(...)
```

**Online connection (`connect(indexerUrl, skipConsistencyCheck)`):**
```
onlineRef = await wallet.goOnlineValue(skipConsistencyCheck, indexerUrl)
```
All network methods receive this `onlineRef`.

**Complete method mapping** (all wallet ops on `wallet: RlnWasmWallet` — confirmed from official example):

| `IRgbLibBinding` method | Object | Method called | Notes |
|---|---|---|---|
| `getBtcBalance()` | `wallet` | `getBtcBalanceValue()` | normalize to `BtcBalance` |
| `getAddress()` | `wallet` | `getAddress()` | direct string |
| `rotateVanillaAddress()` | `wallet` | `getAddress()` | no separate rotate in RLN |
| `rotateColoredAddress()` | `wallet` | `getAddress()` | same |
| `listUnspents()` | `wallet` | `listUnspentsJson(false)` | sync, no online needed; settled_only=false |
| `createUtxosBegin(p)` | `wallet` | `createUtxosBegin(online, upTo, num, size, feeRate, false)` | confirmed in example |
| `createUtxosEnd(p)` | `wallet` | `createUtxosEnd(online, signedPsbt, false)` | returns number |
| `listAssets()` | `wallet` | `listAssetsJson(['NIA','CFA','UDA'])` | normalize to `ListAssets` |
| `getAssetBalance(id)` | `wallet` | `getAssetBalanceValue(id)` | confirmed in example |
| `issueAssetNia(p)` | **`nodeHandle`** | `issueAssetNiaValue(request)` | **node-side**; confirmed in example |
| `issueAssetIfa(p)` | **`nodeHandle`** | `issueAssetCfaJson(request)` | IFA → CFA mapping; see open question 3 |
| `inflateBegin(p)` | `wallet` | `inflateBegin(online, assetId, amounts, feeRate, minConfs)` | |
| `inflateEnd(p)` | `wallet` | `inflateEndJson(online, signedPsbt)` | |
| `sendBegin(p)` | `wallet` | `sendBegin(online, recipientMap, donation, feeRate, minConfs)` | confirmed in example |
| `sendBeginBatch(p)` | `wallet` | `sendBegin(online, recipientMap, ...)` | same call, multi-asset map |
| `sendEnd(p)` | `wallet` | `sendEndValue(online, signedPsbt, false)` | confirmed in example |
| `sendBtcBegin(p)` | `wallet` | `sendBtcBegin(online, address, amount, feeRate, false)` | |
| `sendBtcEnd(p)` | `wallet` | `sendBtcEnd(online, signedPsbt, false)` | returns txid |
| `blindReceive(p)` | `wallet` | `blindReceiveValue(assetId, assignment, duration, endpoints, minConfs)` | confirmed in example |
| `witnessReceive(p)` | `wallet` | `witnessReceiveValue(assetId, assignment, duration, endpoints, minConfs)` | |
| `decodeRGBInvoice(p)` | `nodeHandle` | `decodeRgbInvoiceJson(invoice)` | use `RlnWasmInvoice` class as fallback; see open question 2 |
| `listTransactions()` | `wallet` | `listTransactionsJson()` | normalize to `Transaction[]` |
| `listTransfers(id?)` | `wallet` | `listTransfersJson(id)` | |
| `failTransfers(p)` | `wallet` | `failTransfers(online, idx, noAssetOnly, false)` | |
| `refreshWallet()` | `wallet` | `refreshJson(online, null, null, false)` | |
| `syncWallet()` | `wallet` | `syncOnline(online)` | confirmed in example |
| `getFeeEstimation(p)` | `wallet` | `getFeeEstimation(online, blocks)` | wrap in `GetFeeEstimationResponse` |
| `createBackup(p)` | `wallet` | `backup(password)` → `Uint8Array` | store in `lastBackupBytes` |
| `configureVssBackup(c)` | `wallet` | `configureVssBackup(serverUrl, storeId, signingKeyHex)` | unpack config object |
| `disableVssAutoBackup()` | `wallet` | `disableVssBackup()` | |
| `vssBackup(c)` | `wallet` | `vssBackupJson()` | parse response |
| `vssBackupInfo(c)` | `wallet` | `vssBackupInfoJson()` | parse response |
| `getOnline()` | — | check `this.onlineRef != null` | |
| `dropWallet()` | both | `wallet.free()`, `nodeHandle?.free()`, `sdk.free()` | |
| `registerWallet()` | `wallet` | composite: `getAddress()` + `getBtcBalance()` | same pattern as WasmRgbLibBinding |

**IRlnWalletBinding extras:**
| Method | Object | Implementation |
|---|---|---|
| `sendRgbFromGroups(p)` | `wallet` | `sendRgbFromGroupsJson(request)` |
| `postAssetMedia(mime, hex)` | `sdk` | `postAssetMediaJson(mime, hex)` |

**IRlnNodeBinding (via `RlnNodeBinding`):**
| Method | Object | Implementation |
|---|---|---|
| `issueAssetNia(p)` | `nodeHandle` | `issueAssetNiaJson(request)` |
| `issueAssetCfa(p)` | `nodeHandle` | `issueAssetCfaJson(request)` |
| `openChannel(p)` | `nodeHandle` | `openChannelJson(...)` |
| `createLnInvoice(p)` | `nodeHandle` | `createLnInvoiceJson(...)` |
| `sendPayment(p)` | `nodeHandle` | `sendPaymentJson(...)` |
| `keysend(p)` | `nodeHandle` | `keysendJson(...)` |
| `connectPeer(p)` | `nodeHandle` | `connectPeer(...)` |
| `signMessage(m)` | `nodeHandle` | `signMessageJson(m)` |
| etc. | `nodeHandle` | `*Json(...)` |

**IRlnSdkBinding extras:**
| Method | Implementation |
|---|---|
| `initSdk(p)` | `await sdk.initJson(p.password, p.mnemonic)` |
| `lock()` | `await sdk.lock()` |
| `unlock(pw)` | `await sdk.unlock(pw)` |
| `version()` | `sdk.version()` |
| `makerInit(p)` | `sdk.makerInitJson(p.requestJson)` |
| `makerExecute(s)` | `sdk.makerExecuteJson(s)` |
| `taker(r)` | `sdk.taker(r)` |
| `getSwap(s)` | `sdk.getSwapJson(s)` |
| `listSwaps()` | `sdk.listSwapsJson()` |
| `getLightningNode()` | `this.rlnNode` |

**WASM-specific extras (not in interface):**
- `getLastBackupBytes(): Uint8Array | null`
- `restoreFromBackupBytes(bytes, password): void` — calls `walletHandle.restoreBackup(bytes, password)`

---

#### `src/lightning/RlnNodeBinding.ts` [NEW]

Implements `IRlnNodeBinding` using `RlnWasmSdkNodeHandle`.

```typescript
export class RlnNodeBinding implements IRlnNodeBinding {
  private sdk: RlnWasmSdk;
  private nodeHandle: RlnWasmSdkNodeHandle;

  constructor(sdk: RlnWasmSdk, nodeHandle: RlnWasmSdkNodeHandle) {
    this.sdk = sdk;
    this.nodeHandle = nodeHandle;
  }
  // All methods delegate to this.nodeHandle.*Json() and normalize output
}
```

All JSON outputs are parsed and normalized to the types in `rln-model.ts`.

---

#### `src/wallet/rln-wallet-manager.ts` [NEW]

Extends `BaseWalletManager`. Differences from `wallet-manager.ts`:
1. Uses `RlnWasmBinding` instead of `WasmRgbLibBinding`
2. Exposes `getLightningNode(): IRlnNodeBinding | null`
3. Exposes `getLastBackupBytes()` and `restoreFromBackupBytes()`
4. `create()` accepts `RlnWalletInitParams`

```typescript
export interface RlnWalletInitParams extends WalletInitParams {
  proxyUrl?: string;   // LN WebSocket proxy URL — enables LN node creation
  password: string;    // required for RlnWasmSdk.initJson()
}

export class RlnWalletManager extends BaseWalletManager {
  private readonly rlnBinding: RlnWasmBinding;

  static async create(params: RlnWalletInitParams): Promise<RlnWalletManager> { ... }

  async initialize(): Promise<void> { /* no-op — ready after create() */ }

  async goOnline(indexerUrl: string, skip = false): Promise<void> {
    await this.rlnBinding.connect(indexerUrl, skip);
  }

  getLightningNode(): IRlnNodeBinding | null {
    return this.rlnBinding.getLightningNode();
  }

  getLastBackupBytes(): Uint8Array | null { ... }
  restoreFromBackupBytes(bytes: Uint8Array, password: string): void { ... }
}

export async function createRlnWalletManager(
  params: RlnWalletInitParams
): Promise<RlnWalletManager> {
  return RlnWalletManager.create(params);
}
```

---

#### `src/utexo/rln-utexo-wallet.ts` [NEW]

**Does NOT extend `UTEXOWalletCore`** — no dual-wallet pattern, no UTEXO bridge. Lightning is native via `RlnWasmNode`; there is nothing to bridge.

`RlnUTEXOWallet` is a standalone class built on a single `RlnWalletManager`. It exposes the full RLN surface as a unified API: RGB wallet ops + Lightning node ops together. The primary use case is creating two instances, opening a channel between them, exchanging LN invoices and payments, while also supporting blind/witness receive and regular on-chain RGB transfers.

```typescript
export class RlnUTEXOWallet {
  private manager: RlnWalletManager;

  private constructor(manager: RlnWalletManager) {
    this.manager = manager;
  }

  static async create(params: RlnWalletInitParams): Promise<RlnUTEXOWallet> {
    const manager = await RlnWalletManager.create(params);
    return new RlnUTEXOWallet(manager);
  }

  // ── Online ──────────────────────────────────────────────────────────────
  async goOnline(indexerUrl: string, skipConsistencyCheck = false): Promise<void> {
    await this.manager.goOnline(indexerUrl, skipConsistencyCheck);
  }

  // ── RGB Wallet ───────────────────────────────────────────────────────────
  async getBtcBalance(): Promise<BtcBalance> { ... }
  async getAddress(): Promise<string> { ... }
  async listUnspents(): Promise<Unspent[]> { ... }
  async createUtxos(params): Promise<number> { ... }

  async listAssets(): Promise<ListAssets> { ... }
  async getAssetBalance(assetId: string): Promise<AssetBalance> { ... }

  // Issuance goes through node (NIA/CFA) or wallet (UDA)
  async issueAssetNia(params: IssueAssetNiaRequest): Promise<AssetNIA> { ... }
  async issueAssetCfa(params: IssueAssetCfaRequest): Promise<AssetCFA> { ... }

  // Receiving
  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> { ... }
  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> { ... }
  async decodeRGBInvoice(invoice: string): Promise<InvoiceData> { ... }

  // Sending RGB on-chain
  async send(params: SendAssetBeginRequestModel, signPsbt: SignPsbtFn): Promise<SendResult> { ... }
  async sendBtc(params: SendBtcBeginRequestModel, signPsbt: SignPsbtFn): Promise<string> { ... }
  async sendRgbFromGroups(params: SendRgbFromGroupsRequest): Promise<SendRgbFromGroupsResult> { ... }

  async listTransactions(): Promise<Transaction[]> { ... }
  async listTransfers(assetId?: string): Promise<Transfer[]> { ... }
  async refreshWallet(): Promise<void> { ... }

  // ── Lightning Node ───────────────────────────────────────────────────────
  getLightningNode(): IRlnNodeBinding | null {
    return this.manager.getLightningNode();
  }

  // Convenience pass-throughs so callers don't need to unwrap the node:
  async connectPeer(peerAddr: string, peerPubkey: string): Promise<void> { ... }
  async openChannel(params: OpenChannelParams): Promise<string> { ... }
  async closeChannel(channelId: string, force?: boolean): Promise<void> { ... }
  async listChannels(): Promise<LightningChannel[]> { ... }

  async createLnInvoice(params: CreateLnInvoiceParams): Promise<LightningInvoice> { ... }
  async sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> { ... }
  async keysend(params: KeysendParams): Promise<SendPaymentResult> { ... }
  async listPayments(): Promise<LightningPayment[]> { ... }

  async createHodlLnInvoice(params: CreateHodlLnInvoiceParams): Promise<LightningInvoice> { ... }
  async claimHodlInvoice(paymentHash: string, preimage: string): Promise<HodlInvoiceResult> { ... }
  async cancelHodlInvoice(paymentHash: string): Promise<HodlInvoiceResult> { ... }

  async nodeInfo(): Promise<LightningNodeInfo> { ... }
  async listPeers(): Promise<LightningPeer[]> { ... }

  // ── Backup ───────────────────────────────────────────────────────────────
  async createBackup(password: string): Promise<Uint8Array> { ... }
  getLastBackupBytes(): Uint8Array | null { ... }
}
```

**Typical two-instance flow:**
```typescript
// Instance A (sender/issuer)
const alice = await RlnUTEXOWallet.create({ mnemonic, password, proxyUrl, ... });
await alice.goOnline(indexerUrl);
const asset = await alice.issueAssetNia({ ticker: 'TST', name: 'Test', precision: 0, amounts: [1000n] });

// Instance B (receiver)
const bob = await RlnUTEXOWallet.create({ mnemonic: bobMnemonic, password, proxyUrl, ... });
await bob.goOnline(indexerUrl);

// Open RGB Lightning channel A → B
await alice.connectPeer(bobAddr, bobPubkey);
await alice.openChannel({ peerPubkey: bobPubkey, capacitySat: 100_000n, isPublic: true, assetId: asset.assetId, assetLocalAmount: 500n });

// LN invoice + payment
const invoice = await bob.createLnInvoice({ amtMsat: 1000n, expirySec: 3600, assetId: asset.assetId, assetAmount: 100n });
await alice.sendPayment({ invoice: invoice.invoice });

// On-chain blind receive
const receiveData = await bob.blindReceive({ assetId: asset.assetId, ... });
await alice.send({ recipientMap: { [asset.assetId]: [{ ... }] }, ... }, mySignPsbt);
```

---

### `src/index.ts` — updated exports

```typescript
// RLN binding
export { RlnWasmBinding } from './binding/RlnWasmBinding';

// RLN wallet manager
export { RlnWalletManager, createRlnWalletManager } from './wallet/rln-wallet-manager';
export type { RlnWalletInitParams } from './wallet/rln-wallet-manager';

// Lightning node binding
export { RlnNodeBinding } from './lightning/RlnNodeBinding';

// RLN unified wallet (RGB + Lightning in one class, no bridge)
export { RlnUTEXOWallet } from './utexo/rln-utexo-wallet';
```

---

## Cross-Platform Unified Contracts (rgb-sdk-core)

| Interface | rgb-sdk-web (rgb-lib-wasm) | rgb-sdk-web (rln-wasm) | rgb-sdk-rn (TurboModule) | future Kotlin (UniFFI) |
|---|---|---|---|---|
| `IRgbLibBinding` | `WasmRgbLibBinding` ✓ | `RlnWasmBinding` ✓ | `RNRgbLibBinding` ✓ | KotlinRgbBinding |
| `IRlnWalletBinding` | — | `RlnWasmBinding` ✓ | — | KotlinRlnBinding |
| `IRlnNodeBinding` | — | `RlnNodeBinding` ✓ | — | KotlinRlnNodeBinding |
| `IRlnSdkBinding` | — | `RlnWasmBinding` ✓ | — | KotlinRlnBinding |

---

## Package Setup

### `package.json` (rgb-sdk-web)
```json
{
  "dependencies": {
    "rln-wasm-sdk": "file:./rln-wasm-sdk-pkg_1"
  }
}
```
Package name in `rln-wasm-sdk-pkg_1/package.json` is `"rln-wasm-sdk"` (not `@utexo/rln-wasm`). Update to versioned npm package when published.

---

## Implementation Order

| Step | What | Where | Depends on |
|---|---|---|---|
| 1 | Add `rln-wasm-sdk` dep, point to `rln-wasm-sdk-pkg_1` | `rgb-sdk-web/package.json` | — |
| 2 | Add `rln-model.ts` | `rgb-sdk-core/src/types/` | — |
| 3 | Add `IRlnWalletBinding`, `IRlnNodeBinding`, `IRlnSdkBinding` | `rgb-sdk-core/src/interfaces/` | step 2 |
| 4 | Build + publish core | `rgb-sdk-core` | steps 2–3 |
| 5 | Add `initRln.ts` | `rgb-sdk-web/src/wasm/` | step 1 |
| 6 | Add `RlnWasmTypes.ts` | `rgb-sdk-web/src/binding/` | step 1 |
| 7 | Add `RlnWasmBinding.ts` | `rgb-sdk-web/src/binding/` | steps 3–6 |
| 8 | Add `RlnNodeBinding.ts` | `rgb-sdk-web/src/lightning/` | steps 3–7 |
| 9 | Add `rln-wallet-manager.ts` | `rgb-sdk-web/src/wallet/` | steps 7–8 |
| 10 | Add `rln-utexo-wallet.ts` | `rgb-sdk-web/src/utexo/` | step 9 |
| 11 | Update `src/index.ts` | `rgb-sdk-web` | steps 7–10 |
| 12 | Tests | `rgb-sdk-web/tests/` | steps 7–10 |

---

## Open Questions

1. ~~**`blindReceive` / `witnessReceive`**~~ **RESOLVED.** Only on `RlnWasmWallet`. Handled by dual-object pattern.

2. **`decodeRGBInvoice` without a node:** `RlnWasmInvoice` (exported from rln-wasm-sdk, used in the official example) can parse an RGB invoice standalone — `new RlnWasmInvoice(invoiceString).invoiceDataValue()`. This can be the fallback when `nodeHandle` is null, avoiding a `NotSupportedError` for a pure parsing operation.

3. **IFA → CFA mapping:** `IRgbLibBinding.issueAssetIfa` maps to `nodeHandle.issueAssetCfaJson()` in RLN (which calls `wallet.issue_asset_ifa()` internally via `with_attached_wallet`). Field names may differ from the existing `IssueAssetIfaRequestModel`. Document what inflation-specific fields are not supported, or throw `NotSupportedError` for them.

4. **`rotateVanillaAddress` / `rotateColoredAddress`:** RLN likely rotates internally on `getAddress()`. Confirm — if so, both methods just call `getAddress()`.

5. ~~**`options.rlnPassword` in `ConfigOptions`**~~ **N/A.** `RlnUTEXOWallet` does not extend `UTEXOWalletCore` so `ConfigOptions` is not involved. `password` is a plain field in `RlnWalletInitParams`.

6. ~~**Asset sharing between wallet and node**~~ **RESOLVED.** `initJson()` creates `WASM_SDK_DEFAULT_WALLET`; `createNodeHandle()` auto-attaches it. Both share the same underlying `rgb_lib_wasm::Wallet` instance via `Rc<RefCell<...>>`. `lock()` clears the wallet from memory.
