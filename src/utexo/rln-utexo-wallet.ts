/**
 * RlnUTEXOWallet — unified RGB + Lightning wallet.
 *
 * Single-instance design: one RlnWalletManager wraps the full RLN SDK surface.
 * No dual-wallet pattern, no UTEXO bridge — Lightning is native via RlnWasmNode.
 *
 * Typical flow:
 *   const alice = await RlnUTEXOWallet.create({ mnemonic, password, transportEndpoint, ... });
 *   await alice.goOnline(indexerUrl);
 *   const asset = await alice.issueAssetNia({ ticker: 'TST', name: 'Test', precision: 0, amounts: [1000n] });
 *   await alice.connectPeer(bobAddr, bobPubkey);
 *   await alice.openChannel({ peerPubkey: bobPubkey, capacitySat: 100_000n, isPublic: true });
 *   const invoice = await bob.createLnInvoice({ amtMsat: 1000n, expirySec: 3600 });
 *   await alice.sendPayment({ invoice: invoice.invoice });
 */

import { RlnWalletManager } from '../wallet/rln-wallet-manager';
import type { RlnWalletInitParams } from '../wallet/rln-wallet-manager';
import type { IRlnNodeBinding } from '@utexo/rgb-sdk-core';
import type {
  BtcBalance,
  Unspent,
  ListAssets,
  AssetBalance,
  AssetNIA,
  AssetCFA,
  Transaction,
  Transfer,
  InvoiceReceiveData,
  InvoiceData,
  SendResult,
  WalletBackupResponse,
  VssBackupConfig,
  GetFeeEstimationResponse,
  RecipientMap,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  InvoiceRequest,
  IssueAssetNiaRequestModel,
  FailTransfersRequest,
} from '@utexo/rgb-sdk-core';
import type {
  IssueAssetCfaRequest,
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
  HodlInvoiceResult,
  SendRgbFromGroupsRequest,
  SendRgbFromGroupsResult,
} from '@utexo/rgb-sdk-core';

export class RlnUTEXOWallet {
  private readonly manager: RlnWalletManager;

  private constructor(manager: RlnWalletManager) {
    this.manager = manager;
  }

  static async create(params: RlnWalletInitParams): Promise<RlnUTEXOWallet> {
    const manager = await RlnWalletManager.create(params);
    return new RlnUTEXOWallet(manager);
  }

  // ── Online ─────────────────────────────────────────────────────────────────

  async goOnline(indexerUrl?: string, skipConsistencyCheck = false): Promise<void> {
    await this.manager.goOnline(indexerUrl, skipConsistencyCheck);
  }

  // ── Balance & Address ──────────────────────────────────────────────────────

  async getBtcBalance(): Promise<BtcBalance> {
    return this.manager.getBtcBalance();
  }

  async getAddress(): Promise<string> {
    return this.manager.getAddress();
  }

  async rotateVanillaAddress(): Promise<string> {
    return this.manager.rotateVanillaAddress();
  }

  async rotateColoredAddress(): Promise<string> {
    return this.manager.rotateColoredAddress();
  }

  // ── UTXOs ──────────────────────────────────────────────────────────────────

  async listUnspents(): Promise<Unspent[]> {
    return this.manager.listUnspents();
  }

  async createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string> {
    return this.manager.createUtxosBegin(params);
  }

  async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    return this.manager.createUtxosEnd(params);
  }

  async createUtxos(params: {
    upTo?: boolean;
    num?: number;
    size?: number;
    feeRate?: number;
  }): Promise<number> {
    return this.manager.createUtxos(params);
  }

  // ── Assets ────────────────────────────────────────────────────────────────

  async listAssets(): Promise<ListAssets> {
    return this.manager.listAssets();
  }

  async getAssetBalance(assetId: string): Promise<AssetBalance> {
    return this.manager.getAssetBalance(assetId);
  }

  /** Issue NIA asset. Requires Lightning node (transportEndpoint must be set). */
  async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    return this.manager.issueAssetNia(params);
  }

  /** Issue CFA asset. Requires Lightning node (transportEndpoint must be set). */
  async issueAssetCfa(params: IssueAssetCfaRequest): Promise<AssetCFA> {
    const node = this.requireNode();
    return node.issueAssetCfa(params);
  }

  // ── Receiving ─────────────────────────────────────────────────────────────

  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.manager.blindReceive(params);
  }

  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    return this.manager.witnessReceive(params);
  }

  async decodeRGBInvoice(invoice: string): Promise<InvoiceData> {
    return this.manager.decodeRGBInvoice({ invoice });
  }

  // ── Sending RGB on-chain ───────────────────────────────────────────────────

  async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    return this.manager.sendBegin(params);
  }

  async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    return this.manager.sendEnd(params);
  }

  async send(
    params: SendAssetBeginRequestModel,
    signPsbt: (unsignedPsbt: string) => Promise<string>
  ): Promise<SendResult> {
    return this.manager.sendWithSigner(params, signPsbt);
  }

  async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    return this.manager.sendBtcBegin(params);
  }

  async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    return this.manager.sendBtcEnd(params);
  }

  async sendBtc(
    params: SendBtcBeginRequestModel,
    signPsbt: (unsignedPsbt: string) => Promise<string>
  ): Promise<string> {
    return this.manager.sendBtcWithSigner(params, signPsbt);
  }

  async sendRgbFromGroups(
    params: SendRgbFromGroupsRequest
  ): Promise<SendRgbFromGroupsResult> {
    return this.manager.sendRgbFromGroups(params);
  }

  // ── Transactions & Transfers ───────────────────────────────────────────────

  async listTransactions(): Promise<Transaction[]> {
    return this.manager.listTransactions();
  }

  async listTransfers(assetId?: string): Promise<Transfer[]> {
    return this.manager.listTransfers(assetId);
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    return this.manager.failTransfers(params);
  }

  async refreshWallet(): Promise<void> {
    return this.manager.refreshWallet();
  }

  async syncWallet(): Promise<void> {
    return this.manager.syncWallet();
  }

  // ── Fee Estimation ─────────────────────────────────────────────────────────

  async estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    return this.manager.estimateFeeRate(blocks);
  }

  // ── Backup ────────────────────────────────────────────────────────────────

  async createBackup(password: string): Promise<Uint8Array> {
    await this.manager.createBackup({ backupPath: '', password });
    const bytes = this.manager.getLastBackupBytes();
    if (!bytes) throw new Error('createBackup produced no bytes');
    return bytes;
  }

  getLastBackupBytes(): Uint8Array | null {
    return this.manager.getLastBackupBytes();
  }

  async configureVssBackup(config: VssBackupConfig): Promise<void> {
    return this.manager.configureVssBackup(config);
  }

  // ── Lightning node access ──────────────────────────────────────────────────

  getLightningNode(): IRlnNodeBinding | null {
    return this.manager.getLightningNode();
  }

  private requireNode(): IRlnNodeBinding {
    const node = this.manager.getLightningNode();
    if (!node) {
      throw new Error(
        'Lightning node is not configured. Pass transportEndpoint when creating RlnUTEXOWallet.'
      );
    }
    return node;
  }

  // ── Lightning convenience pass-throughs ───────────────────────────────────

  async connectPeer(peerAddr: string, peerPubkey: string): Promise<void> {

    return this.requireNode().connectPeer(peerAddr, peerPubkey);
  }

  async disconnectPeer(peerPubkey: string): Promise<void> {
    return this.requireNode().disconnectPeer(peerPubkey);
  }

  async listPeers(): Promise<LightningPeer[]> {
    return this.requireNode().listPeers();
  }

  async openChannel(params: OpenChannelParams): Promise<string> {
    return this.requireNode().openChannel(params);
  }

  closeChannel(channelId: string, force = false): void {
    this.requireNode().closeChannel(channelId, undefined, force);
  }

  async listChannels(): Promise<LightningChannel[]> {
    return this.requireNode().listChannels();
  }

  async createLnInvoice(params: CreateLnInvoiceParams): Promise<LightningInvoice> {
    return this.requireNode().createLnInvoice(params);
  }

  async createHodlLnInvoice(params: CreateHodlLnInvoiceParams): Promise<LightningInvoice> {
    return this.requireNode().createHodlLnInvoice(params);
  }

  async claimHodlInvoice(paymentHash: string, preimage: string): Promise<HodlInvoiceResult> {
    return this.requireNode().claimHodlInvoice(paymentHash, preimage);
  }

  async cancelHodlInvoice(paymentHash: string): Promise<HodlInvoiceResult> {
    return this.requireNode().cancelHodlInvoice(paymentHash);
  }

  async sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
    return this.requireNode().sendPayment(params);
  }

  async keysend(params: KeysendParams): Promise<SendPaymentResult> {
    return this.requireNode().keysend(params);
  }

  async listPayments(): Promise<LightningPayment[]> {
    return this.requireNode().listPayments();
  }

  async getPayment(paymentHash: string): Promise<LightningPayment | null> {
    return this.requireNode().getPayment(paymentHash);
  }

  async nodeInfo(): Promise<LightningNodeInfo> {
    return this.requireNode().nodeInfo();
  }

  async signMessage(message: string): Promise<string> {
    return this.requireNode().signMessage(message);
  }
}
