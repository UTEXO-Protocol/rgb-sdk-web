/**
 * UTEXOWallet — the single end-user wallet for rgb-sdk-web.
 *
 * Backed entirely by the RLN WASM SDK (RGB on-chain + native Lightning). The
 * public surface mirrors `@utexo/rgb-sdk-rn`'s UTEXOWallet so app code ports
 * across web ↔ React Native with minimal change: it implements the same
 * `IWalletManager` + `IUTEXOProtocol` contracts and uses the same method names
 * (`onchainSend`, `payLightningInvoice`, `createLightningInvoice`, …).
 *
 * Web-specific approaches are preserved:
 *  - async factory `UTEXOWallet.create({ mnemonic, password, ... })` + `goOnline()`
 *  - PSBT signing via the BDK/mnemonic path (RlnSigner), so `send` / `onchainSend`
 *    stay atomic without an injected signer.
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
  SendResult,
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
  OnchainSendRequestModel,
  OnchainSendResponse,
  OnchainSendStatus,
  TransferStatus,
} from '@utexo/rgb-sdk-core';
import { RlnWalletManager } from '../wallet/rln-wallet-manager';
import type { RlnWalletInitParams } from '../wallet/rln-wallet-manager';
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

export class UTEXOWallet implements IWalletManager, IUTEXOProtocol {
  private readonly manager: RlnWalletManager;

  private constructor(manager: RlnWalletManager) {
    this.manager = manager;
  }

  static async create(params: RlnWalletInitParams): Promise<UTEXOWallet> {
    const manager = await RlnWalletManager.create(params);
    return new UTEXOWallet(manager);
  }

  // ── IWalletManager — Lifecycle ─────────────────────────────────────────────

  initialize(): Promise<void> {
    return this.manager.initialize();
  }

  goOnline(indexerUrl: string, skipConsistencyCheck?: boolean): Promise<void> {
    return this.manager.goOnline(indexerUrl, skipConsistencyCheck);
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

  // ── IWalletManager — Sending Assets ────────────────────────────────────────

  sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    return this.manager.sendBegin(params);
  }

  sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    return this.manager.sendEnd(params);
  }

  /** Atomic RGB send (begin → BDK sign with stored/provided mnemonic → end). */
  send(
    invoiceTransfer: SendAssetBeginRequestModel,
    mnemonic?: string
  ): Promise<SendResult> {
    return this.manager.send(invoiceTransfer, mnemonic);
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

  async onchainReceive(
    params: OnchainReceiveRequestModel & { witness?: boolean }
  ): Promise<OnchainReceiveResponse> {
    const req: InvoiceRequest = {
      assetId: params.assetId,
      amount: params.amount,
      durationSeconds: params.durationSeconds,
      minConfirmations: params.minConfirmations,
    };
    const data =
      params.witness === false
        ? await this.manager.blindReceive(req)
        : await this.manager.witnessReceive(req);
    return { invoice: data.invoice };
  }

  onchainSendBegin(params: OnchainSendRequestModel): Promise<string> {
    return this.manager.sendBegin(this.toSendAssetParams(params));
  }

  onchainSendEnd(
    params: SendAssetEndRequestModel
  ): Promise<OnchainSendResponse> {
    return this.manager.sendEnd(params);
  }

  onchainSend(
    params: OnchainSendRequestModel,
    mnemonic?: string
  ): Promise<OnchainSendResponse> {
    return this.manager.send(this.toSendAssetParams(params), mnemonic);
  }

  getOnchainSendStatus(_send_id: string): Promise<OnchainSendStatus | null> {
    throw new Error('UTEXOWallet.getOnchainSendStatus: not implemented');
  }

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

  private toSendAssetParams(
    params: OnchainSendRequestModel
  ): SendAssetBeginRequestModel {
    return {
      invoice: params.invoice,
      assetId: params.assetId,
      amount: params.amount,
    };
  }
}
