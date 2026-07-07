# RFC 001 — UTEXOWallet v2 interfaces (RLN-native contract)

- **Status:** Draft (document only — no contract code shipped yet)
- **Target repo (later):** `@utexo/rgb-sdk-core` — shared by
  `@utexo/rgb-sdk-web` and `@utexo/rgb-sdk-rn`
- **Author:** rgb-sdk-web / 2026-07-06

## 1. Motivation

The current public contract (`IWalletManager` + `IUTEXOProtocol`) predates the
RLN-native stack. `IUTEXOProtocol` in particular was shaped around a **remote
bridge service**: the bridge returned PSBTs for Lightning payments
(`payLightningInvoiceBegin/End`), transfers were polled by an opaque id
(`getOnchainSendStatus(send_id)`), and "onchain" vs "lightning" were two bridge
products. With the local RLN node none of that holds, and the cost is visible
in both SDKs today:

1. **Dead surface.** `payLightningInvoiceBegin`, `payLightningInvoiceEnd`,
   `getLightningSendFeeEstimate`, `getOnchainSendStatus` throw
   `not implemented` on **both** platforms. They exist only to satisfy the
   interface.
2. **Lossy aliases.** `onchainSend*` delegates to `send*` but through
   `OnchainSendRequestModel` (`invoice`/`assetId`/`amount` only) — no
   `feeRate`, `donation`, `minConfirmations`, `witnessData`. Web's
   `onchainSend` therefore cannot pay witness invoices at all; RN papered over
   this with its own widened `RlnOnchainSendRequestModel`, so the two
   platforms accept different params for the "same" method.
3. **No contract for the interesting half.** Node ops, channels, HODL, APay
   and LSP flows live *outside* the shared interfaces, and have silently
   drifted:
   - `connectPeer(peerAddr, peerPubkey)` (web) vs
     `connectPeer('pubkey@host:port')` (RN)
   - `createHodlLnInvoice` (web) vs `createHodlInvoice` (RN)
   - `closeChannel(...): void` (web, fire-and-forget) vs
     `closeChannel(...): Promise<void>` (RN)
   - `openChannel` returns `string` (web) vs a response object (RN)
4. **Reader duplication.** `getLightningSendRequest` /
   `getLightningReceiveRequest` map rich node records down to a 3-value
   `TransferStatus`, losing preimage/asset fields — which forced
   `getPayment`, `invoiceStatus`, and `listPaymentsRaw` to exist alongside
   them (three ways to list payments).
5. **Param-shape traps.** `createLightningInvoice` nests the asset
   (`{ asset: { assetId, amount }, amountSats }`) while `payLightningInvoice`
   is flat (`{ assetId, assetAmount, amount }`) and `amount` means *sats*.
   This already produced a real bug in the web demo.

## 2. Design principles

- **RLN-native.** The contract describes the local RLN node and its embedded
  RGB wallet (`rln-wasm-sdk` on web, the RLN native module on RN) — not a
  bridge, and not the removed rgb-lib stack. Lightning ops are atomic;
  on-chain PSBT flows keep begin → `signPsbt` → end (real external-signer
  use case).
- **One contract, two platforms.** Everything public on `UTEXOWallet` — node
  ops included — is declared in core. Signature drift becomes a compile error,
  and a shared contract-test suite (§7) makes it a CI failure.
- **Flat surface, RN-compatible names.** No `wallet.lightning.*` namespaces;
  porting app code across web ↔ RN stays copy-paste.
- **Rich reads, one mapper.** Status readers return full records; a single
  `toTransferStatus()` helper serves legacy code that wants the 3-value enum.
- **Aliases are shims, not implementations.** Legacy names live in one
  `LegacyUtexoProtocolMixin` in core, implemented on top of v2, deleted after
  one deprecation cycle.
- **The signer owns keys.** No `mnemonic?` override parameters.

## 3. Shared v2 types (`@utexo/rgb-sdk-core`)

```ts
// ── Amounts ──────────────────────────────────────────────────────────────────

/** RGB asset amount attached to a Lightning operation. */
export interface LnAssetAmount {
  assetId: string;
  amount: number; // asset units (per asset precision)
}

// ── Receiving (RGB on-chain) ─────────────────────────────────────────────────

/** RLN `rgb_invoice` parity: one call, mode chosen by `witness`. */
export interface ReceiveRequest {
  assetId?: string;          // omit = any asset
  amount?: number;           // omit/0 = any amount
  durationSeconds?: number;  // omit = default expiry, 0 = no expiry
  minConfirmations?: number; // default 1
  witness?: boolean;         // default true (RN parity)
}

export interface ReceiveData {
  invoice: string;              // full `rgb:…` invoice — share THIS
  recipientId: string;          // chain-prefixed beneficiary (bcrt:/tb:/bc:…)
  expirationTimestamp: number | null;
  batchTransferIdx: number;
}

// ── Sending (RGB on-chain) ───────────────────────────────────────────────────

export interface WitnessData {
  amountSat: number;
  blinding?: number;
}

/** Full send model — the ONLY send param shape (fixes the lossy onchainSend). */
export interface SendRequest {
  invoice: string;             // full `rgb:…` invoice
  assetId?: string;            // override; default = from invoice
  amount?: number;             // override; default = from invoice
  feeRate?: number;            // sat/vB, default 1
  donation?: boolean;          // default false
  minConfirmations?: number;   // default 1
  /** REQUIRED for witness (`wvout`) recipients; forbidden for blind. */
  witnessData?: WitnessData;
  skipSync?: boolean;
}

export interface SendEndRequest {
  signedPsbt: string;
  skipSync?: boolean;
}

export interface SendResult {
  txid: string;
  batchTransferIdx: number;
}

// ── Lightning invoices & payments ────────────────────────────────────────────

/** One amount convention for create AND pay (fixes amount/assetAmount trap). */
export interface CreateInvoiceRequest {
  amountMsat?: number;         // BTC amount; omit for asset-only invoices
  asset?: LnAssetAmount;       // RGB asset leg
  expirySeconds?: number;      // default 3600
}

export interface CreateHodlInvoiceRequest extends CreateInvoiceRequest {
  paymentHash: string;         // payer-side preimage; claim/cancel explicitly
}

export interface LnInvoice {
  invoice: string;             // BOLT11
  paymentHash: string;
  expiresAt?: number;
}

export interface PayInvoiceRequest {
  invoice: string;             // BOLT11
  amountMsat?: number;         // only for amountless invoices
  asset?: LnAssetAmount;       // RGB asset leg
}

export interface KeysendRequest {
  destPubkey: string;
  amountMsat: number;
  asset?: LnAssetAmount;
}

export type PaymentStatus = 'pending' | 'succeeded' | 'failed';
export type InvoiceState = 'pending' | 'paid' | 'expired' | 'cancelled';

/** Rich payment record — replaces the lossy TransferStatus mapping. */
export interface Payment {
  paymentHash: string;
  status: PaymentStatus;
  inbound: boolean;
  amountMsat?: number;
  asset?: LnAssetAmount;
  preimage?: string;           // present once settled
  createdAt?: number;
  updatedAt?: number;
}

export interface PayResult {
  paymentHash: string;
  status: PaymentStatus;
  paymentSecret?: string;
}

/** Legacy adapter — the only place the 3-value enum survives. */
export function toTransferStatus(
  s: PaymentStatus | InvoiceState
): TransferStatus | null;

// ── Channels & peers ─────────────────────────────────────────────────────────

export interface OpenChannelRequest {
  peerPubkeyAndAddr: string;   // 'pubkey@host:port' — LN convention, RN parity
  capacitySat: number;
  pushMsat?: number;
  asset?: LnAssetAmount;       // RGB channel leg
  public?: boolean;
  withAnchors?: boolean;
  feeBaseMsat?: number;
  feeProportionalMillionths?: number;
}

export interface OpenChannelResult {
  temporaryChannelId: string;  // resolve final id via getChannelId()
}
```

## 4. `IRgbWallet` — on-chain RGB + BTC

Replaces `IWalletManager`. Differences from v1 are annotated.

```ts
export interface IRgbWallet {
  // ── Lifecycle ──────────────────────────────────────────────────────────────
  // v1 initialize() REMOVED — the async factory initializes.
  goOnline(indexerUrl?: string, skipConsistencyCheck?: boolean): Promise<void>;
  isOnline(): boolean;
  getXpub(): { xpubVan: string; xpubCol: string };
  getNetwork(): Network;
  dispose(): Promise<void>;
  isDisposed(): boolean;

  // ── Diagnostics (NEW in contract — RN already ships these) ────────────────
  checkIndexerUrl(url: string): Promise<void>;
  checkProxyEndpoint(endpoint: string): Promise<void>;

  // ── Balance & address ──────────────────────────────────────────────────────
  getBtcBalance(): Promise<BtcBalance>;
  getAddress(): Promise<string>;
  rotateVanillaAddress(): Promise<string>;
  rotateColoredAddress(): Promise<string>;

  // ── UTXOs ──────────────────────────────────────────────────────────────────
  listUnspents(): Promise<Unspent[]>;
  createUtxosBegin(params: CreateUtxosRequest): Promise<string>;
  createUtxosEnd(params: SendEndRequest): Promise<number>;
  createUtxos(params: CreateUtxosRequest): Promise<number>;

  // ── Assets ─────────────────────────────────────────────────────────────────
  listAssets(): Promise<ListAssets>;
  getAssetBalance(assetId: string): Promise<AssetBalance>;
  issueAssetNia(params: IssueAssetNiaRequest): Promise<AssetNIA>;
  issueAssetIfa(params: IssueAssetIfaRequest): Promise<AssetIFA>; // typed, no `any`
  inflateBegin(params: InflateRequest): Promise<string>;
  inflateEnd(params: SendEndRequest): Promise<OperationResult>;
  inflate(params: InflateRequest): Promise<OperationResult>; // mnemonic? REMOVED

  // ── Receive (single entry — replaces blindReceive/witnessReceive) ─────────
  receive(params: ReceiveRequest): Promise<ReceiveData>;
  decodeRgbInvoice(invoice: string): Promise<InvoiceData>; // flat arg

  // ── Send (full model — replaces send + onchainSend families) ──────────────
  sendBegin(params: SendRequest): Promise<string>;
  sendEnd(params: SendEndRequest): Promise<SendResult>;
  send(params: SendRequest): Promise<SendResult>; // mnemonic? REMOVED

  // ── BTC ────────────────────────────────────────────────────────────────────
  sendBtcBegin(params: SendBtcRequest): Promise<string>;
  sendBtcEnd(params: SendEndRequest): Promise<string>;
  sendBtc(params: SendBtcRequest): Promise<string>;

  // ── Transfers & state ──────────────────────────────────────────────────────
  listTransactions(): Promise<Transaction[]>;
  listTransfers(assetId?: string): Promise<Transfer[]>;
  failTransfers(params?: FailTransfersRequest): Promise<boolean>;
  refreshWallet(): Promise<void>;
  syncWallet(): Promise<void>;

  // ── Fees ───────────────────────────────────────────────────────────────────
  estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse>;
  estimateFee(psbtBase64: string): Promise<EstimateFeeResult>;

  // ── Backup (bytes-first; platform file/VSS helpers layer on top) ──────────
  backup(password: string): Promise<Uint8Array>;   // replaces createBackup+getLastBackupBytes
  restore(bytes: Uint8Array, password: string): Promise<void>;

  // ── Crypto ─────────────────────────────────────────────────────────────────
  signPsbt(psbt: string): Promise<string>;          // mnemonic? REMOVED
  signMessage(message: string): Promise<string>;
  verifyMessage(message: string, signature: string, accountXpub?: string): Promise<boolean>;
}
```

Optional capability interface (not all platforms/backends):

```ts
export interface IVssBackup {
  configureVssBackup(config: VssBackupConfig): Promise<void>;
  disableVssAutoBackup(): Promise<void>;
  vssBackup(config: VssBackupConfig): Promise<number>;
  vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo>;
  vssClearFence(password: string): Promise<void>; // RN has it; web to add
}
```

## 5. `ILightningNode` — the previously-uncontracted half

This is the highest-value piece: it forces web/RN parity on everything that
drifted.

```ts
export interface ILightningNode {
  // ── Node ───────────────────────────────────────────────────────────────────
  getNodePubkey(): string | null;
  getNodeInfo(): Promise<LightningNodeInfo>;
  getNetworkInfo(): Promise<LightningNetworkInfo>;

  // ── Peers (RN convention wins: single 'pubkey@host:port' string) ──────────
  connectPeer(peerPubkeyAndAddr: string): Promise<void>;
  disconnectPeer(peerPubkey: string): Promise<void>;
  listPeers(): Promise<LightningPeer[]>;

  // ── Channels ───────────────────────────────────────────────────────────────
  openChannel(params: OpenChannelRequest): Promise<OpenChannelResult>;
  closeChannel(channelId: string, peerPubkey: string, force?: boolean): Promise<void>;
  getChannelId(temporaryChannelId: string): Promise<string>; // RN has it; web to add
  listChannels(): Promise<LightningChannel[]>;

  // ── Invoices ───────────────────────────────────────────────────────────────
  createInvoice(params: CreateInvoiceRequest): Promise<LnInvoice>;
  decodeInvoice(invoice: string): Promise<DecodedLnInvoice>;
  invoiceStatus(invoice: string): Promise<InvoiceState>;

  // ── HODL (RN name wins: no 'Ln' infix) ─────────────────────────────────────
  createHodlInvoice(params: CreateHodlInvoiceRequest): Promise<LnInvoice>;
  claimHodlInvoice(paymentHash: string, preimage: string): Promise<HodlInvoiceResult>;
  cancelHodlInvoice(paymentHash: string): Promise<HodlInvoiceResult>;

  // ── Payments (rich records; replaces the TransferStatus readers) ──────────
  payInvoice(params: PayInvoiceRequest): Promise<PayResult>;
  keysend(params: KeysendRequest): Promise<PayResult>;
  getPayment(paymentHash: string): Promise<Payment | null>;
  listPayments(): Promise<Payment[]>;

  // ── APay ───────────────────────────────────────────────────────────────────
  apayNew(hostNodeId: string, address?: { username: string; domain: string }): Promise<ApayNewResponse>;
}
```

Dropped from the public node surface (become `@internal` or move to
`UtexoLsp`): `listPaymentsRaw`, `failPendingPayments`, `updatePaymentStatus`,
`ldkRuntimeStatus`, `listRuntimeEvents`.

## 6. Composition + legacy shim

```ts
export interface IUtexoWalletV2 extends IRgbWallet, ILightningNode {}

// web + RN:
export class UTEXOWallet
  extends LegacyUtexoProtocolMixin(UTEXOWalletV2Base)
  implements IUtexoWalletV2, IUTEXOProtocol /* legacy, one release */ {}
```

`LegacyUtexoProtocolMixin` lives **once, in core**, implemented purely on v2
methods, all members `@deprecated`:

| Legacy (v1) | v2 shim body |
|---|---|
| `blindReceive(p)` | `receive({ ...p, witness: false })` |
| `witnessReceive(p)` | `receive({ ...p, witness: true })` |
| `onchainReceive(p)` | `receive(p)` |
| `onchainSend(p)` / `Begin` / `End` | `send(p)` / `sendBegin(p)` / `sendEnd(p)` — now full-fidelity, since v2 `SendRequest` carries feeRate/witnessData |
| `listOnchainTransfers(id?)` | `listTransfers(id?)` |
| `createLightningInvoice({ asset, amountSats, expirySeconds })` | `createInvoice({ asset, amountMsat: amountSats * 1000, expirySeconds })` → `{ lnInvoice: r.invoice }` |
| `payLightningInvoice({ lnInvoice, amount, assetId, assetAmount })` | `payInvoice({ invoice: lnInvoice, amountMsat: amount * 1000, asset: assetId ? { assetId, amount: assetAmount } : undefined })` |
| `getLightningSendRequest(hash)` | `getPayment(hash).then(p => toTransferStatus(p?.status))` |
| `getLightningReceiveRequest(inv)` | `invoiceStatus(inv).then(toTransferStatus)` |
| `listLightningPayments()` | `listPayments()` reshaped to `{ payments: [{ txid, status }] }` |
| `createHodlLnInvoice(p)` | `createHodlInvoice(p)` |
| `decodeRGBInvoice({ invoice })` | `decodeRgbInvoice(invoice)` |
| `createBackup({ password })` + `getLastBackupBytes()` | `backup(password)` |
| `initialize()` | no-op (warn once) |
| `payLightningInvoiceBegin/End`, `getLightningSendFeeEstimate`, `getOnchainSendStatus` | **deleted** — throw with a pointer to the v2 method (`payInvoice`, `getPayment`) |

## 7. Migration plan

1. **Core:** add `src/interfaces/v2/` (`IRgbWallet`, `ILightningNode`,
   `IVssBackup`, `IUtexoWalletV2`), v2 types, `toTransferStatus`,
   `LegacyUtexoProtocolMixin`. Publish minor release; v1 untouched.
2. **Drift hotfixes (independently shippable):**
   - web: `connectPeer` accepts `'pubkey@host:port'` (keep 2-arg overload,
     deprecated); rename `createHodlLnInvoice` → `createHodlInvoice` (alias);
     `closeChannel` returns `Promise<void>`; add `getChannelId`,
     `checkIndexerUrl`, `checkProxyEndpoint`, `vssClearFence`.
   - web: widen `onchainSend*` params to full `SendRequest` (kills the lossy
     alias immediately, before v2 lands).
3. **web + RN:** implement `IUtexoWalletV2`, replace hand-written aliases with
   the mixin, move demos/tests to v2 names.
4. **Contract tests in core:** one Jest suite parameterized over a wallet
   factory, run in web CI (against `dist/`) and RN CI (against the mock
   binding). Asserts method presence + signatures + status-mapping semantics —
   this is the guard that was missing when `connectPeer`/HODL drifted.
5. **Deprecation window:** one minor release with the mixin + `@deprecated`
   JSDoc; then remove `IUTEXOProtocol`, `IWalletManager`, and the mixin.

## 8. Open questions

1. **`amountMsat` vs `amountSats`** for LN amounts. Proposal uses msat
   (node-native, no silent ×1000 in two places). If app ergonomics matter
   more, `amountSats` everywhere is fine — but it must be ONE of them.
2. **`receive()` naming.** `receive` (this RFC) vs keeping `onchainReceive` as
   the canonical name (matches deployed RN apps). If RN app churn is a
   concern, promote `onchainReceive` to v2 and make `receive` the alias.
3. **`issueAssetCfa` / `sendRgbFromGroups`** — web-only today (node-side
   issuance). Include in `ILightningNode`, or a separate `IRlnExtras`
   capability interface?
4. **Events.** v2 is still pull-based. A minimal
   `on('payment' | 'transfer' | 'channel', cb)` emitter on `ILightningNode`
   would remove most polling loops in app code (drive-beat pattern). Worth a
   follow-up RFC — deliberately out of scope here.
5. **`UtexoLsp`** — already effectively shared; formalize `ILspFlows` in core
   now or after v2 lands?
