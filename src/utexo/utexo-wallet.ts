/**
 * UTEXOWallet — the single end-user wallet for rgb-sdk-web.
 *
 * Backed entirely by the RLN WASM SDK (RGB on-chain + native Lightning). The
 * public surface mirrors `@utexo/rgb-sdk-rn`'s UTEXOWallet so app code ports
 * across web ↔ React Native with minimal change: it implements `IUTEXOProtocol`
 * plus `IWalletManager` minus the plain RGB send trio — RGB sends are exposed
 * only under the RN-parity names (`onchainSend`, `onchainSendBegin`,
 * `onchainSendEnd`), avoiding duplicate send entry points.
 *
 * Web-specific approaches are preserved:
 *  - RN-parity lifecycle: `new UTEXOWallet({ mnemonic, password, ... })` stores
 *    params synchronously; `await wallet.init()` performs the WASM/network setup
 *    and auto-connects to the indexer (`indexerUrl` or the network default).
 *    `UTEXOWallet.create(params)` remains as a one-call convenience wrapper.
 *    `goOnline()` is idempotent, so legacy create-then-goOnline code still works.
 *  - PSBT signing via the BDK/mnemonic path (RlnSigner), so `onchainSend` /
 *    `payLightningInvoice` stay atomic without an injected signer.
 *
 * Lower-level building blocks (`RlnWalletManager`, `RlnWasmBinding`,
 * `RlnNodeBinding`) remain available for advanced use.
 */

import type {
  IWalletManager,
  IUTEXOProtocol,
  Network,
  BtcBalance,
  Unspent,
  ListAssets,
  AssetBalance,
  AssetNIA,
  Transaction,
  Transfer,
  InvoiceRequest,
  InvoiceReceiveData,
  InvoiceData,
  IssueAssetNiaRequestModel,
  IssueAssetIfaRequestModel,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  OperationResult,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  WalletBackupResponse,
  VssBackupConfig,
  VssBackupInfo,
  GetFeeEstimationResponse,
  EstimateFeeResult,
  CreateLightningInvoiceRequestModel,
  LightningReceiveRequest,
  LightningSendRequest,
  PayLightningInvoiceRequestModel,
  GetLightningSendFeeEstimateRequestModel,
  ListLightningPaymentsResponse,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
  OnchainSendResponse,
  OnchainSendStatus,
  TransferStatus,
} from '@utexo/rgb-sdk-core';
import { RlnWalletManager } from '../wallet/rln-wallet-manager';
import type { RlnWalletInitParams } from '../wallet/rln-wallet-manager';
import { UtexoLsp } from '../lsp/UtexoLsp';
import { UtexoLSPClient } from '../lsp/UtexoLSPClient';
import type { LspPeer } from '../lsp/lsp-types';
import { resolveLspBaseUrl } from '../binding/RlnDefaults';
import type {
  IRlnNodeBinding,
  IssueAssetCfaRequest,
  LightningChannel,
  OpenChannelParams,
  CreateHodlLnInvoiceParams,
  HodlInvoiceResult,
  LightningInvoice,
  LightningPayment,
  LightningPaymentStatus,
  LightningPeer,
  LightningNodeInfo,
  LightningNetworkInfo,
  DecodedLnInvoice,
  InvoiceStatus,
  LightningAssetParam,
  SendPaymentResult,
  SendRgbFromGroupsRequest,
  SendRgbFromGroupsResult,
  ApayNewResponse,
} from '../rln';

export type { RlnWalletInitParams as UTEXOWalletCreateParams };

// ── Status mappers (RLN → core TransferStatus) ───────────────────────────────

function mapInvoiceStatus(status: InvoiceStatus): TransferStatus | null {
  switch (status) {
    case 'Pending':
      return 'WaitingCounterparty';
    case 'Paid':
      return 'Settled';
    case 'Expired':
      return 'Failed';
    default:
      return null;
  }
}

function mapPaymentStatus(
  status: LightningPaymentStatus
): TransferStatus | null {
  switch (status) {
    case 'Pending':
      return 'WaitingCounterparty';
    case 'Succeeded':
      return 'Settled';
    case 'Failed':
      return 'Failed';
    default:
      return null;
  }
}

// ── UTEXOWallet ──────────────────────────────────────────────────────────────

/**
 * IWalletManager minus the plain RGB send trio — UTEXOWallet exposes only the
 * RN-parity `onchainSend`/`onchainSendBegin`/`onchainSendEnd` names for RGB
 * sends (same manager implementation underneath, full param model).
 */
type IWalletManagerBase = Omit<
  IWalletManager,
  'send' | 'sendBegin' | 'sendEnd'
>;

export class UTEXOWallet implements IWalletManagerBase, IUTEXOProtocol {
  private readonly params: RlnWalletInitParams;
  private readonly lspBaseUrl: string | null;
  private readonly lspBearerToken: string | null;
  private _manager: RlnWalletManager | null = null;
  private initPromise: Promise<void> | null = null;

  /** Construction is sync and cheap — params are only stored. All WASM/network
   *  work happens in init(); every other method throws until it resolves. */
  constructor(params: RlnWalletInitParams) {
    this.params = params;
    this.lspBaseUrl = params.lspBaseUrl ?? null;
    this.lspBearerToken = params.lspBearerToken ?? null;
  }

  private get manager(): RlnWalletManager {
    if (!this._manager) {
      throw new Error(
        'UTEXOWallet: not initialized — await wallet.init() first'
      );
    }
    return this._manager;
  }

  /** One-time init (RN parity): creates the RLN wallet/node from the stored
   *  params and auto-connects to the indexer (non-fatally — see isOnline()).
   *  Idempotent; concurrent calls share the same in-flight promise. A failed
   *  init clears the latch so init() can be retried. */
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = RlnWalletManager.create(this.params).then(
        (manager) => {
          this._manager = manager;
        },
        (e) => {
          this.initPromise = null;
          throw e;
        }
      );
    }
    return this.initPromise;
  }

  /** Back-compat convenience: `new UTEXOWallet(params)` + `await init()`. */
  static async create(params: RlnWalletInitParams): Promise<UTEXOWallet> {
    const wallet = new UTEXOWallet(params);
    await wallet.init();
    return wallet;
  }

  // ── IWalletManager — Lifecycle ─────────────────────────────────────────────

  /** Backward-compat alias for init(). */
  initialize(): Promise<void> {
    return this.init();
  }

  /** Bring the wallet online. create() already auto-connects (using
   *  `indexerUrl` or the network default), so this is a no-op when online —
   *  only needed to retry after a failed auto-connect (see isOnline()). */
  goOnline(indexerUrl?: string, skipConsistencyCheck?: boolean): Promise<void> {
    return this.manager.goOnline(indexerUrl, skipConsistencyCheck);
  }

  /** Whether the wallet is connected to an indexer. */
  isOnline(): boolean {
    return this.manager.isOnline();
  }

  /** Wallet extended public keys: `{ xpubVan, xpubCol }`. */
  getXpub(): { xpubVan: string; xpubCol: string } {
    return this.manager.getXpub();
  }

  /** The configured Bitcoin network. */
  getNetwork(): Network {
    return this.manager.getNetwork();
  }

  /** Release the WASM wallet/node handles. Check with {@link isDisposed}. */
  dispose(): Promise<void> {
    return this.manager.dispose();
  }

  /** Whether {@link dispose} has been called. */
  isDisposed(): boolean {
    return this.manager.isDisposed();
  }

  // ── IWalletManager — Balance & Address ─────────────────────────────────────

  /** BTC balance (vanilla + colored). */
  getBtcBalance(): Promise<BtcBalance> {
    return this.manager.getBtcBalance();
  }

  /** Current on-chain deposit address. */
  getAddress(): Promise<string> {
    return this.manager.getAddress();
  }

  /** Not implemented — the RLN wasm wallet does not expose address rotation yet. @throws always */
  rotateVanillaAddress(): Promise<string> {
    return this.manager.rotateVanillaAddress();
  }

  /** Not implemented — the RLN wasm wallet does not expose address rotation yet. @throws always */
  rotateColoredAddress(): Promise<string> {
    return this.manager.rotateColoredAddress();
  }

  // ── IWalletManager — UTXO Management ───────────────────────────────────────

  /** List unspent UTXOs with their RGB allocations. */
  listUnspents(): Promise<Unspent[]> {
    return this.manager.listUnspents();
  }

  /** Begin creating UTXOs — returns an unsigned PSBT for external signing. */
  createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string> {
    return this.manager.createUtxosBegin(params);
  }

  /** Finish creating UTXOs from a signed PSBT — returns the number created. */
  createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    return this.manager.createUtxosEnd(params);
  }

  /** Create UTXOs atomically (begin → sign → end) — returns the number created. */
  createUtxos(params: {
    upTo?: boolean;
    num?: number;
    size?: number;
    feeRate?: number;
  }): Promise<number> {
    return this.manager.createUtxos(params);
  }

  // ── IWalletManager — Asset Operations ──────────────────────────────────────

  /** List all RGB assets held by the wallet. */
  listAssets(): Promise<ListAssets> {
    return this.manager.listAssets();
  }

  /** Balance for a single asset. */
  getAssetBalance(asset_id: string): Promise<AssetBalance> {
    return this.manager.getAssetBalance(asset_id);
  }

  /** Issue a Non-Inflatable Asset (NIA). */
  issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    return this.manager.issueAssetNia(params);
  }

  /** Issue an Inflatable Fungible Asset (IFA). Requires the Lightning node. */
  issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<any> {
    return this.manager.issueAssetIfa(params);
  }

  /** Begin inflating an IFA asset — returns an unsigned PSBT for external signing. */
  inflateBegin(params: InflateAssetIfaRequestModel): Promise<string> {
    return this.manager.inflateBegin(params);
  }

  /** Finish inflating an IFA asset from a signed PSBT. */
  inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
    return this.manager.inflateEnd(params);
  }

  /** Inflate an IFA asset atomically (begin → sign with the stored mnemonic → end). */
  inflate(
    params: InflateAssetIfaRequestModel,
    mnemonic?: string
  ): Promise<OperationResult> {
    return this.manager.inflate(params, mnemonic);
  }

  // ── IWalletManager — Sending BTC ───────────────────────────────────────────

  /** Begin an on-chain BTC send — returns an unsigned PSBT for external signing. */
  sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    return this.manager.sendBtcBegin(params);
  }

  /** Finish an on-chain BTC send from a signed PSBT — returns the txid. */
  sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    return this.manager.sendBtcEnd(params);
  }

  /** Atomic on-chain BTC send (begin → sign with the stored mnemonic → end) — returns the txid. */
  sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    return this.manager.sendBtc(params);
  }

  // ── IWalletManager — Receiving Assets ──────────────────────────────────────

  /** Create a blinded-UTXO RGB invoice. Underlying receive primitive of {@link onchainReceive}. */
  blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.manager.blindReceive(params);
  }

  /** Create a witness RGB invoice. Underlying receive primitive of {@link onchainReceive}. */
  witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.manager.witnessReceive(params);
  }

  /** Decode an RGB invoice into its structured fields. */
  decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
    return this.manager.decodeRGBInvoice(params);
  }

  // ── IWalletManager — Transactions & Transfers ──────────────────────────────

  /** On-chain transaction history. */
  listTransactions(): Promise<Transaction[]> {
    return this.manager.listTransactions();
  }

  /** RGB transfer history, optionally filtered by asset. */
  listTransfers(asset_id?: string): Promise<Transfer[]> {
    return this.manager.listTransfers(asset_id);
  }

  /** Mark pending transfers as failed. */
  failTransfers(params: FailTransfersRequest): Promise<boolean> {
    return this.manager.failTransfers(params);
  }

  /** Refresh pending RGB transfer state. */
  refreshWallet(): Promise<void> {
    return this.manager.refreshWallet();
  }

  /** Sync BTC/UTXO blockchain state. */
  syncWallet(): Promise<void> {
    return this.manager.syncWallet();
  }

  // ── IWalletManager — VSS Backup ────────────────────────────────────────────

  /** Enable VSS (cloud) auto-backup with the given config. */
  configureVssBackup(config: VssBackupConfig): Promise<void> {
    return this.manager.configureVssBackup(config);
  }

  /** Disable VSS auto-backup. */
  disableVssAutoBackup(): Promise<void> {
    return this.manager.disableVssAutoBackup();
  }

  /** Trigger a VSS backup — returns the new backup version. */
  vssBackup(config: VssBackupConfig): Promise<number> {
    return this.manager.vssBackup(config);
  }

  /** Query VSS backup metadata (latest version, etc.). */
  vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo> {
    return this.manager.vssBackupInfo(config);
  }

  // ── IWalletManager — Fee Estimation ────────────────────────────────────────

  /** Fee-rate estimate (sat/vB) for a target confirmation in `blocks`. */
  estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    return this.manager.estimateFeeRate(blocks);
  }

  /** Fee estimate for a given PSBT (base64). */
  estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
    return this.manager.estimateFee(psbtBase64);
  }

  // ── IWalletManager — Backup ────────────────────────────────────────────────

  /** Create an encrypted backup — read the bytes with {@link getLastBackupBytes}. */
  createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse> {
    return this.manager.createBackup(params);
  }

  /** Raw backup bytes from the most recent createBackup() (web-specific). */
  getLastBackupBytes(): Uint8Array | null {
    return this.manager.getLastBackupBytes();
  }

  /** Restore wallet state from raw backup bytes (web-specific). */
  restoreFromBackupBytes(bytes: Uint8Array, password: string): void {
    this.manager.restoreFromBackupBytes(bytes, password);
  }

  // ── IWalletManager — Cryptographic Operations ──────────────────────────────

  /** Sign a PSBT with the wallet mnemonic (BDK path). */
  signPsbt(psbt: string, mnemonic?: string): Promise<string> {
    return this.manager.signPsbt(psbt, mnemonic);
  }

  /** Schnorr-sign a message with the wallet keys. */
  signMessage(message: string): Promise<string> {
    return this.manager.signMessage(message);
  }

  /** Verify a Schnorr message signature (defaults to this wallet's key). */
  verifyMessage(
    message: string,
    signature: string,
    accountXpub?: string
  ): Promise<boolean> {
    return this.manager.verifyMessage(message, signature, accountXpub);
  }

  // ── IUTEXOProtocol — Lightning ─────────────────────────────────────────────

  /**
   * Create a Lightning invoice (BTC via `amountSats`, or an RGB asset via
   * `asset`). Wider than the core model: `asset` is optional (BTC-only
   * invoices), and `asset.assetAmount` is accepted as an alias for
   * `asset.amount` — an asset with neither amount key throws instead of
   * silently issuing an amount-less invoice.
   */
  async createLightningInvoice(
    params: Omit<CreateLightningInvoiceRequestModel, 'asset'> & {
      asset?: LightningAssetParam;
      paymentHash?: string | null;
    }
  ): Promise<LightningReceiveRequest> {
    const amtMsat =
      params.amountSats != null ? BigInt(params.amountSats * 1000) : undefined;
    const assetId = params.asset?.assetId || undefined;
    const assetUnits = params.asset?.amount ?? params.asset?.assetAmount;
    if (assetId && assetUnits == null) {
      throw new Error(
        'UTEXOWallet.createLightningInvoice: asset.amount (or its alias asset.assetAmount) is required when asset.assetId is set'
      );
    }
    const resp = await this.requireNode().createLnInvoice({
      amtMsat,
      expirySec: params.expirySeconds ?? 3600,
      assetId,
      assetAmount: assetId != null ? BigInt(assetUnits!) : undefined,
    });
    return { lnInvoice: resp.invoice };
  }

  /** Poll receive status for a Lightning invoice. */
  getLightningReceiveRequest(id: string): Promise<TransferStatus | null> {
    return this.requireNode().invoiceStatus(id).then(mapInvoiceStatus);
  }

  /** Poll send status by payment hash (`'WaitingCounterparty'` → `'Settled'` | `'Failed'`). */
  async getLightningSendRequest(id: string): Promise<TransferStatus | null> {
    const payment = await this.requireNode().getPayment(id);
    if (!payment) return null;
    return mapPaymentStatus(payment.status);
  }

  /** Not implemented — the local RLN node pays atomically via {@link payLightningInvoice}. @throws always */
  getLightningSendFeeEstimate(
    _params: GetLightningSendFeeEstimateRequestModel
  ): Promise<number> {
    throw new Error('UTEXOWallet.getLightningSendFeeEstimate: not implemented');
  }

  /** Not implemented — Lightning pay is atomic; use {@link payLightningInvoice}. @throws always */
  payLightningInvoiceBegin(
    _params: PayLightningInvoiceRequestModel
  ): Promise<string> {
    throw new Error('UTEXOWallet.payLightningInvoiceBegin: not implemented');
  }

  /** Not implemented — Lightning pay is atomic; use {@link payLightningInvoice}. @throws always */
  payLightningInvoiceEnd(
    _params: SendAssetEndRequestModel
  ): Promise<LightningSendRequest> {
    throw new Error('UTEXOWallet.payLightningInvoiceEnd: not implemented');
  }

  /**
   * Atomic Lightning payment (native LN pay via the RLN node). `amount` is in
   * sats; `assetAmount` is in asset units. The core model's `maxFee` is not
   * supported by the wasm node (LDK route limits apply) — passing it throws
   * rather than silently ignoring a fee cap.
   */
  async payLightningInvoice(
    params: PayLightningInvoiceRequestModel & { assetAmount?: number }
  ): Promise<LightningSendRequest> {
    if (params.maxFee != null) {
      throw new Error(
        'UTEXOWallet.payLightningInvoice: maxFee is not supported by the local RLN node — remove it (LDK route limits apply)'
      );
    }
    const amtMsat =
      params.amount != null ? BigInt(params.amount * 1000) : undefined;
    const assetAmount =
      params.assetAmount != null ? BigInt(params.assetAmount) : undefined;
    const resp = await this.requireNode().sendPayment({
      invoice: params.lnInvoice,
      amtMsat,
      assetId: params.assetId,
      assetAmount,
    });
    return { txid: resp.paymentHash, status: resp.status };
  }

  /** List all Lightning payments (txid = payment hash, plus status). */
  async listLightningPayments(): Promise<ListLightningPaymentsResponse> {
    const payments = await this.requireNode().listPayments();
    return {
      payments: payments.map((p) => ({
        txid: p.paymentHash,
        status: p.status,
      })),
    };
  }

  // ── IUTEXOProtocol — Onchain ───────────────────────────────────────────────

  /**
   * Single receive entry point — RLN `rgb_invoice` parity: one call, receive
   * mode selected via `witness` (default true, like RN). Returns the full
   * receive data (invoice + recipientId + expiration), not just the invoice.
   */
  async onchainReceive(
    params: OnchainReceiveRequestModel & { witness?: boolean }
  ): Promise<OnchainReceiveResponse & InvoiceReceiveData> {
    const req: InvoiceRequest = {
      assetId: params.assetId || undefined,
      amount: params.amount || undefined,
      durationSeconds: params.durationSeconds,
      minConfirmations: params.minConfirmations,
    };
    return params.witness === false
      ? this.manager.blindReceive(req)
      : this.manager.witnessReceive(req);
  }

  /**
   * The canonical RGB send family (RN-parity names). Takes the full send
   * model — feeRate, donation, minConfirmations and witnessData all pass
   * through (witnessData is required when paying a witness/`wvout` invoice).
   */
  onchainSendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    return this.manager.sendBegin(params);
  }

  /** Finish an RGB send from a signed PSBT (3-step variant of {@link onchainSend}). */
  onchainSendEnd(
    params: SendAssetEndRequestModel
  ): Promise<OnchainSendResponse> {
    return this.manager.sendEnd(params);
  }

  /** Atomic RGB send (begin → BDK sign with the stored mnemonic → end). */
  onchainSend(
    params: SendAssetBeginRequestModel,
    mnemonic?: string
  ): Promise<OnchainSendResponse> {
    return this.manager.send(params, mnemonic);
  }

  /** Not implemented — track send state via {@link listTransfers} / {@link refreshWallet}. @throws always */
  getOnchainSendStatus(_send_id: string): Promise<OnchainSendStatus | null> {
    throw new Error('UTEXOWallet.getOnchainSendStatus: not implemented');
  }

  /** Alias of listTransfers() — same data, same filtering (RN-parity name). */
  listOnchainTransfers(asset_id?: string): Promise<Transfer[]> {
    return this.manager.listTransfers(asset_id);
  }

  // ── RGB extras (web/RLN-specific) ──────────────────────────────────────────

  /** Issue a CFA asset. Requires a Lightning node (transportEndpoint set). */
  issueAssetCfa(params: IssueAssetCfaRequest) {
    return this.requireNode().issueAssetCfa(params);
  }

  /** Group-based RGB asset send. */
  sendRgbFromGroups(
    params: SendRgbFromGroupsRequest
  ): Promise<SendRgbFromGroupsResult> {
    return this.manager.sendRgbFromGroups(params);
  }

  // ── Lightning node extras (RN-like) ────────────────────────────────────────

  /** The underlying Lightning node binding, or null if no node was configured. */
  getLightningNode(): IRlnNodeBinding | null {
    return this.manager.getLightningNode();
  }

  /** Attach the wallet to the LN node. Call after on-chain setup (funding /
   *  createUtxos) and before Lightning operations; otherwise it attaches lazily
   *  on first node use. Avoids a "RefCell already borrowed" wasm panic. */
  attachLightningNode(): void {
    this.manager.attachLightningNode();
  }

  /** The node's public key, or null if no Lightning node is configured. */
  getNodePubkey(): string | null {
    return this.manager.getNodePubkey();
  }

  /** Node pubkey, channel counts, and sync status. Requires the Lightning node. */
  getNodeInfo(): Promise<LightningNodeInfo> {
    return this.requireNode().nodeInfo();
  }

  /** Network-level info (fees, node/channel counts). Requires the Lightning node. */
  getNetworkInfo(): Promise<LightningNetworkInfo> {
    return this.requireNode().networkInfo();
  }

  /** Connect to a peer (`peerAddr` = `'host:port'`, plus its pubkey). */
  connectPeer(peerAddr: string, peerPubkey: string): Promise<void> {
    return this.requireNode().connectPeer(peerAddr, peerPubkey);
  }

  /** Disconnect a peer by pubkey. */
  disconnectPeer(peerPubkey: string): Promise<void> {
    return this.requireNode().disconnectPeer(peerPubkey);
  }

  /** List connected peers. */
  listPeers(): Promise<LightningPeer[]> {
    return this.requireNode().listPeers();
  }

  /** List channels. */
  listChannels(): Promise<LightningChannel[]> {
    return this.requireNode().listChannels();
  }

  /** Open a channel (`capacitySat`/`assetLocalAmount` are `bigint`) — returns the temporary channel ID. */
  openChannel(params: OpenChannelParams): Promise<string> {
    return this.requireNode().openChannel(params);
  }

  /** Close a channel (cooperative unless `force`). */
  closeChannel(channelId: string, peerPubkey?: string, force = false): void {
    this.requireNode().closeChannel(channelId, peerPubkey, force);
  }

  /** Spontaneous keysend payment (BTC, or an RGB asset via `assetId`/`assetAmount`). */
  keysend(
    destPubkey: string,
    amtMsat: number,
    assetId?: string,
    assetAmount?: number
  ): Promise<SendPaymentResult> {
    return this.requireNode().keysend({
      destPubkey,
      amtMsat: BigInt(amtMsat),
      assetId,
      assetAmount: assetAmount != null ? BigInt(assetAmount) : undefined,
    });
  }

  /** Lightning payment history. */
  listPayments(): Promise<LightningPayment[]> {
    return this.requireNode().listPayments();
  }

  /** A single Lightning payment by hash, or null if unknown. */
  getPayment(paymentHash: string): Promise<LightningPayment | null> {
    return this.requireNode().getPayment(paymentHash);
  }

  /** Decode a Lightning (BOLT11) invoice into its structured fields. */
  decodeLnInvoice(invoice: string): Promise<DecodedLnInvoice> {
    return this.requireNode().decodeLnInvoice(invoice);
  }

  /** Raw invoice status (`'Pending'` | `'Paid'` | `'Expired'`). */
  invoiceStatus(invoice: string): Promise<InvoiceStatus> {
    return this.requireNode().invoiceStatus(invoice);
  }

  // ── HODL invoices ──────────────────────────────────────────────────────────

  /** Create a HODL invoice tied to a specific payment hash. */
  createHodlLnInvoice(
    params: CreateHodlLnInvoiceParams
  ): Promise<LightningInvoice> {
    return this.requireNode().createHodlLnInvoice(params);
  }

  /** Reveal the preimage to claim an inbound HODL payment. */
  claimHodlInvoice(
    paymentHash: string,
    preimage: string
  ): Promise<HodlInvoiceResult> {
    return this.requireNode().claimHodlInvoice(paymentHash, preimage);
  }

  /** Cancel a HODL invoice — the held HTLC is failed back to the sender. */
  cancelHodlInvoice(paymentHash: string): Promise<HodlInvoiceResult> {
    return this.requireNode().cancelHodlInvoice(paymentHash);
  }

  // ── Async payments (APay) ──────────────────────────────────────────────────

  /** Register a fresh batch of payment hashes with the invoice-host / LSP peer. */
  apayNew(hostNodeId: string): Promise<ApayNewResponse> {
    return this.requireNode().apayNew(hostNodeId);
  }

  /** Like apayNew, but also attests a username@domain Lightning Address. */
  apayNewWithAddress(
    hostNodeId: string,
    username: string,
    domain: string
  ): Promise<ApayNewResponse> {
    return this.requireNode().apayNewWithAddress(hostNodeId, username, domain);
  }

  // ── LSP (utexo-lsp composed flows) ─────────────────────────────────────────

  /** The lspBaseUrl / bearer token this wallet was created with. */
  getLspConfig(): { baseUrl: string | null; bearerToken: string | null } {
    return { baseUrl: this.lspBaseUrl, bearerToken: this.lspBearerToken };
  }

  /**
   * Build a {@link UtexoLsp} for composed LSP flows (receive/send asset, pay
   * address, APay Lightning Address). With an explicit `peer`, uses it directly;
   * otherwise auto-discovers the peer from the configured `lspBaseUrl` via
   * `GET /get_info`.
   */
  async createLsp(peer?: LspPeer, peerPort = 9735): Promise<UtexoLsp> {
    if (peer) return new UtexoLsp(this, peer);

    const baseUrl = resolveLspBaseUrl(this.getNetwork(), this.lspBaseUrl);
    const http = new UtexoLSPClient({
      baseUrl,
      bearerToken: this.lspBearerToken ?? undefined,
    });
    const info = await http.getInfo();
    return new UtexoLsp(this, {
      baseUrl,
      peerPubkey: info.pubkey,
      peerHost: new URL(baseUrl).hostname,
      peerPort,
      bearerToken: this.lspBearerToken ?? undefined,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private requireNode(): IRlnNodeBinding {
    const node = this.manager.getLightningNode();
    if (!node) {
      throw new Error(
        'Lightning node is not configured. Pass transportEndpoint (or proxyUrl) ' +
          'when creating the UTEXOWallet.'
      );
    }
    return node;
  }
}
