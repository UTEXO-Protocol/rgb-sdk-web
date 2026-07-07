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
 *  - async factory `UTEXOWallet.create({ mnemonic, password, indexerUrl, ... })`
 *    — with `indexerUrl` the wallet comes up online in one call (RN-style
 *    unlock UX); without it, call `goOnline(indexerUrl)` before network ops.
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
  private readonly manager: RlnWalletManager;
  private readonly lspBaseUrl: string | null;
  private readonly lspBearerToken: string | null;

  private constructor(
    manager: RlnWalletManager,
    lspBaseUrl: string | null,
    lspBearerToken: string | null
  ) {
    this.manager = manager;
    this.lspBaseUrl = lspBaseUrl;
    this.lspBearerToken = lspBearerToken;
  }

  static async create(params: RlnWalletInitParams): Promise<UTEXOWallet> {
    const manager = await RlnWalletManager.create(params);
    return new UTEXOWallet(
      manager,
      params.lspBaseUrl ?? null,
      params.lspBearerToken ?? null
    );
  }

  // ── IWalletManager — Lifecycle ─────────────────────────────────────────────

  initialize(): Promise<void> {
    return this.manager.initialize();
  }

  /** Bring the wallet online. create() already auto-connects (using
   *  `indexerUrl` or the network default), so this is a no-op when online —
   *  only needed to retry after a failed auto-connect (see isOnline()). */
  goOnline(indexerUrl: string, skipConsistencyCheck?: boolean): Promise<void> {
    return this.manager.goOnline(indexerUrl, skipConsistencyCheck);
  }

  /** Whether the wallet is connected to an indexer. */
  isOnline(): boolean {
    return this.manager.isOnline();
  }

  getXpub(): { xpubVan: string; xpubCol: string } {
    return this.manager.getXpub();
  }

  getNetwork(): Network {
    return this.manager.getNetwork();
  }

  dispose(): Promise<void> {
    return this.manager.dispose();
  }

  isDisposed(): boolean {
    return this.manager.isDisposed();
  }

  // ── IWalletManager — Balance & Address ─────────────────────────────────────

  getBtcBalance(): Promise<BtcBalance> {
    return this.manager.getBtcBalance();
  }

  getAddress(): Promise<string> {
    return this.manager.getAddress();
  }

  rotateVanillaAddress(): Promise<string> {
    return this.manager.rotateVanillaAddress();
  }

  rotateColoredAddress(): Promise<string> {
    return this.manager.rotateColoredAddress();
  }

  // ── IWalletManager — UTXO Management ───────────────────────────────────────

  listUnspents(): Promise<Unspent[]> {
    return this.manager.listUnspents();
  }

  createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string> {
    return this.manager.createUtxosBegin(params);
  }

  createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    return this.manager.createUtxosEnd(params);
  }

  createUtxos(params: {
    upTo?: boolean;
    num?: number;
    size?: number;
    feeRate?: number;
  }): Promise<number> {
    return this.manager.createUtxos(params);
  }

  // ── IWalletManager — Asset Operations ──────────────────────────────────────

  listAssets(): Promise<ListAssets> {
    return this.manager.listAssets();
  }

  getAssetBalance(asset_id: string): Promise<AssetBalance> {
    return this.manager.getAssetBalance(asset_id);
  }

  issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    return this.manager.issueAssetNia(params);
  }

  issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<any> {
    return this.manager.issueAssetIfa(params);
  }

  inflateBegin(params: InflateAssetIfaRequestModel): Promise<string> {
    return this.manager.inflateBegin(params);
  }

  inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
    return this.manager.inflateEnd(params);
  }

  inflate(
    params: InflateAssetIfaRequestModel,
    mnemonic?: string
  ): Promise<OperationResult> {
    return this.manager.inflate(params, mnemonic);
  }

  // ── IWalletManager — Sending BTC ───────────────────────────────────────────

  sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    return this.manager.sendBtcBegin(params);
  }

  sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    return this.manager.sendBtcEnd(params);
  }

  sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    return this.manager.sendBtc(params);
  }

  // ── IWalletManager — Receiving Assets ──────────────────────────────────────

  blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.manager.blindReceive(params);
  }

  witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.manager.witnessReceive(params);
  }

  decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
    return this.manager.decodeRGBInvoice(params);
  }

  // ── IWalletManager — Transactions & Transfers ──────────────────────────────

  listTransactions(): Promise<Transaction[]> {
    return this.manager.listTransactions();
  }

  listTransfers(asset_id?: string): Promise<Transfer[]> {
    return this.manager.listTransfers(asset_id);
  }

  failTransfers(params: FailTransfersRequest): Promise<boolean> {
    return this.manager.failTransfers(params);
  }

  refreshWallet(): Promise<void> {
    return this.manager.refreshWallet();
  }

  syncWallet(): Promise<void> {
    return this.manager.syncWallet();
  }

  // ── IWalletManager — VSS Backup ────────────────────────────────────────────

  configureVssBackup(config: VssBackupConfig): Promise<void> {
    return this.manager.configureVssBackup(config);
  }

  disableVssAutoBackup(): Promise<void> {
    return this.manager.disableVssAutoBackup();
  }

  vssBackup(config: VssBackupConfig): Promise<number> {
    return this.manager.vssBackup(config);
  }

  vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo> {
    return this.manager.vssBackupInfo(config);
  }

  // ── IWalletManager — Fee Estimation ────────────────────────────────────────

  estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    return this.manager.estimateFeeRate(blocks);
  }

  estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
    return this.manager.estimateFee(psbtBase64);
  }

  // ── IWalletManager — Backup ────────────────────────────────────────────────

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

  signPsbt(psbt: string, mnemonic?: string): Promise<string> {
    return this.manager.signPsbt(psbt, mnemonic);
  }

  signMessage(message: string): Promise<string> {
    return this.manager.signMessage(message);
  }

  verifyMessage(
    message: string,
    signature: string,
    accountXpub?: string
  ): Promise<boolean> {
    return this.manager.verifyMessage(message, signature, accountXpub);
  }

  // ── IUTEXOProtocol — Lightning ─────────────────────────────────────────────

  async createLightningInvoice(
    params: CreateLightningInvoiceRequestModel & {
      paymentHash?: string | null;
    }
  ): Promise<LightningReceiveRequest> {
    const amtMsat =
      params.amountSats != null ? BigInt(params.amountSats * 1000) : undefined;
    const assetId = params.asset?.assetId || undefined;
    const assetAmount =
      assetId && params.asset?.amount != null
        ? BigInt(params.asset.amount)
        : undefined;
    const resp = await this.requireNode().createLnInvoice({
      amtMsat,
      expirySec: params.expirySeconds ?? 3600,
      assetId,
      assetAmount,
    });
    return { lnInvoice: resp.invoice };
  }

  getLightningReceiveRequest(id: string): Promise<TransferStatus | null> {
    return this.requireNode().invoiceStatus(id).then(mapInvoiceStatus);
  }

  async getLightningSendRequest(id: string): Promise<TransferStatus | null> {
    const payment = await this.requireNode().getPayment(id);
    if (!payment) return null;
    return mapPaymentStatus(payment.status);
  }

  getLightningSendFeeEstimate(
    _params: GetLightningSendFeeEstimateRequestModel
  ): Promise<number> {
    throw new Error('UTEXOWallet.getLightningSendFeeEstimate: not implemented');
  }

  payLightningInvoiceBegin(
    _params: PayLightningInvoiceRequestModel
  ): Promise<string> {
    throw new Error('UTEXOWallet.payLightningInvoiceBegin: not implemented');
  }

  payLightningInvoiceEnd(
    _params: SendAssetEndRequestModel
  ): Promise<LightningSendRequest> {
    throw new Error('UTEXOWallet.payLightningInvoiceEnd: not implemented');
  }

  /** Atomic Lightning payment (native LN pay via the RLN node). */
  async payLightningInvoice(
    params: PayLightningInvoiceRequestModel & { assetAmount?: number }
  ): Promise<LightningSendRequest> {
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

  getNodeInfo(): Promise<LightningNodeInfo> {
    return this.requireNode().nodeInfo();
  }

  getNetworkInfo(): Promise<LightningNetworkInfo> {
    return this.requireNode().networkInfo();
  }

  connectPeer(peerAddr: string, peerPubkey: string): Promise<void> {
    return this.requireNode().connectPeer(peerAddr, peerPubkey);
  }

  disconnectPeer(peerPubkey: string): Promise<void> {
    return this.requireNode().disconnectPeer(peerPubkey);
  }

  listPeers(): Promise<LightningPeer[]> {
    return this.requireNode().listPeers();
  }

  listChannels(): Promise<LightningChannel[]> {
    return this.requireNode().listChannels();
  }

  openChannel(params: OpenChannelParams): Promise<string> {
    return this.requireNode().openChannel(params);
  }

  closeChannel(channelId: string, peerPubkey?: string, force = false): void {
    this.requireNode().closeChannel(channelId, peerPubkey, force);
  }

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

  listPayments(): Promise<LightningPayment[]> {
    return this.requireNode().listPayments();
  }

  getPayment(paymentHash: string): Promise<LightningPayment | null> {
    return this.requireNode().getPayment(paymentHash);
  }

  decodeLnInvoice(invoice: string): Promise<DecodedLnInvoice> {
    return this.requireNode().decodeLnInvoice(invoice);
  }

  invoiceStatus(invoice: string): Promise<InvoiceStatus> {
    return this.requireNode().invoiceStatus(invoice);
  }

  // ── HODL invoices ──────────────────────────────────────────────────────────

  createHodlLnInvoice(
    params: CreateHodlLnInvoiceParams
  ): Promise<LightningInvoice> {
    return this.requireNode().createHodlLnInvoice(params);
  }

  claimHodlInvoice(
    paymentHash: string,
    preimage: string
  ): Promise<HodlInvoiceResult> {
    return this.requireNode().claimHodlInvoice(paymentHash, preimage);
  }

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

  /** Raw payment records (incl. preimage) — used by LSP HODL-claim flows. */
  listPaymentsRaw(): Promise<unknown[]> {
    return this.requireNode().listPaymentsRaw();
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

    const baseUrl = this.lspBaseUrl;
    if (!baseUrl) {
      throw new Error(
        'createLsp: no peer provided and no lspBaseUrl configured. Pass lspBaseUrl ' +
          'to UTEXOWallet.create(), or call createLsp(peer).'
      );
    }
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
