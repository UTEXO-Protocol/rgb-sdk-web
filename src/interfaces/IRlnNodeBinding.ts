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
  ApayNewResponse,
  LdkVssBackupInfo,
} from '../types/rln-model';
import type { AssetNIA, AssetCFA } from '@utexo/rgb-sdk-core';

/**
 * Platform-agnostic interface for Lightning node operations.
 *
 * Implemented by RlnNodeBinding (web/WASM) and future Kotlin UniFFI binding.
 * Asset issuance lives here because it requires the node to have a wallet
 * attached (node-side issuance pattern in rln-wasm-sdk).
 */
export interface IRlnNodeBinding {
  // ── Asset Issuance (requires wallet attached to node) ─────────────────────
  issueAssetNia(params: IssueAssetNiaRequest): Promise<AssetNIA>;
  issueAssetCfa(params: IssueAssetCfaRequest): Promise<AssetCFA>;

  // ── Channels ───────────────────────────────────────────────────────────────
  openChannel(params: OpenChannelParams): Promise<string>;
  closeChannel(channelId: string, peerPubkey?: string, force?: boolean): void;
  listChannels(): Promise<LightningChannel[]>;

  // ── Payments ───────────────────────────────────────────────────────────────
  createLnInvoice(params: CreateLnInvoiceParams): Promise<LightningInvoice>;
  sendPayment(params: SendPaymentParams): Promise<SendPaymentResult>;
  keysend(params: KeysendParams): Promise<SendPaymentResult>;
  listPayments(): Promise<LightningPayment[]>;
  getPayment(paymentHash: string): Promise<LightningPayment | null>;
  invoiceStatus(invoice: string): Promise<InvoiceStatus>;
  failPendingPayments(): Promise<void>;
  updatePaymentStatus(params: PaymentStatusUpdate): Promise<void>;

  // ── HODL invoices ──────────────────────────────────────────────────────────
  createHodlLnInvoice(
    params: CreateHodlLnInvoiceParams
  ): Promise<LightningInvoice>;
  cancelHodlInvoice(paymentHash: string): Promise<HodlInvoiceResult>;
  claimHodlInvoice(
    paymentHash: string,
    preimage: string
  ): Promise<HodlInvoiceResult>;

  // ── Peers ──────────────────────────────────────────────────────────────────
  connectPeer(peerAddr: string, peerPubkey: string): Promise<void>;
  disconnectPeer(peerPubkey: string): Promise<void>;
  listPeers(): Promise<LightningPeer[]>;

  // ── Info & Status ──────────────────────────────────────────────────────────
  nodePubkey(): string;
  nodeInfo(): Promise<LightningNodeInfo>;
  networkInfo(): Promise<LightningNetworkInfo>;
  ldkRuntimeStatus(): Promise<LdkRuntimeStatus>;
  listRuntimeEvents(): Promise<ListRuntimeEventsResult>;

  // ── VSS (LDK/channel-state replication) ────────────────────────────────────
  /** Enable background VSS replication of channel state; must be called
   *  before the node runtime starts. Returns the number of keys restored
   *  from VSS (fresh device) — 0 when the local store was already populated. */
  configureLdkVssReplication(
    serverUrl: string,
    storeId: string,
    signingKeyHex: string
  ): Promise<number>;
  /** Stop replication and release the single-writer guards. */
  disableLdkVssReplication(): void;
  /** Replication health: `{ configured, pendingWrites, lastError, disabled }`. */
  ldkVssBackupInfo(): LdkVssBackupInfo;
  /** Clear the VSS single-writer fence for this node's LDK store — recovery
   *  for when configureLdkVssReplication fails with "owned by another
   *  instance" and that owner can never release the fence itself (wiped
   *  browser profile / dead device). Refused while replication is active on
   *  this node. Only clear when the previous owner is truly gone: two live
   *  writers on one VSS store corrupt each other's channel state. */
  clearLdkVssFence(
    serverUrl: string,
    storeId: string,
    signingKeyHex: string
  ): Promise<void>;

  // ── Decoding ───────────────────────────────────────────────────────────────
  decodeLnInvoice(invoice: string): Promise<DecodedLnInvoice>;
  decodeRgbInvoice(invoice: string): Promise<unknown>;

  // ── Messaging ─────────────────────────────────────────────────────────────
  signMessage(message: string): Promise<string>;

  // ── Async payments (APay) ─────────────────────────────────────────────────
  /** Register a fresh batch of payment hashes with the invoice-host / LSP peer. */
  apayNew(hostNodeId: string): Promise<ApayNewResponse>;
  /** Like apayNew, but also attests a username@domain Lightning Address. */
  apayNewWithAddress(
    hostNodeId: string,
    username: string,
    domain: string
  ): Promise<ApayNewResponse>;
}
