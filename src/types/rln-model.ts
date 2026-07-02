// RLN (RGB Lightning Node) model types.
//
// Vendored locally in rgb-sdk-web so the RLN integration is self-contained and
// does not depend on these being published in @utexo/rgb-sdk-core. If/when the
// core package ships the equivalent `rln-model.ts`, these can be re-exported
// from there instead (the shapes are kept identical on purpose).

// ─── Asset Issuance (node-side) ───────────────────────────────────────────────

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

// ─── Channels ─────────────────────────────────────────────────────────────────

export interface LightningChannel {
  channelId: string;
  peerPubkey: string;
  capacitySat: number;
  localBalanceMsat: number;
  remoteBalanceMsat: number;
  isPublic: boolean;
  isActive: boolean;
  /** Channel is usable for routing (ready + peer connected). */
  isUsable?: boolean;
  /** Spendable outbound liquidity (our side). Falls back to localBalanceMsat. */
  outboundBalanceMsat?: number;
  /** Inbound liquidity (peer side). Falls back to remoteBalanceMsat. */
  inboundBalanceMsat?: number;
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

// ─── Invoices & Payments ──────────────────────────────────────────────────────

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
  inbound?: boolean;
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

// ─── Peers ────────────────────────────────────────────────────────────────────

export interface LightningPeer {
  pubkey: string;
  address?: string;
  isConnected?: boolean;
}

// ─── Node Info ────────────────────────────────────────────────────────────────

export interface LightningNodeInfo {
  pubkey: string;
  numChannels?: number;
  numUsableChannels?: number;
  localBalanceMsat?: number;
}

export interface LightningNetworkInfo {
  network: string;
  blockHeight?: number;
}

export interface LdkRuntimeStatus {
  isRunning: boolean;
}

export interface ListRuntimeEventsResult {
  events: unknown[];
}

// ─── Decoded invoices ─────────────────────────────────────────────────────────

export interface DecodedLnInvoice {
  paymentHash: string;
  amtMsat?: bigint;
  description?: string;
  expirySeconds?: number;
  payee?: string;
}

// ─── RLN wallet extras ────────────────────────────────────────────────────────

export interface SendRgbFromGroupsRequest {
  /** SDK-specific shape — platform binding normalizes */
  groups: unknown;
}

export interface SendRgbFromGroupsResult {
  txid?: string;
}

// ─── SDK lifecycle ────────────────────────────────────────────────────────────

export interface RlnSdkInitParams {
  password: string;
  mnemonic?: string;
}

// ─── Async payments (APay) — node-side ────────────────────────────────────────

export interface ApayHashEntry {
  hashIndex: number;
  paymentHash: string;
}

/** Response of node.apayNew / apayNewWithAddress (async_order.new acknowledgement). */
export interface ApayNewResponse {
  requestId: string;
  hostNodeId: string;
  protocolVersion: number;
  orderId: string;
  status: string;
  acceptedThroughIndex: number;
  nextIndexExpected: number;
  unusedHashes: number;
  refillBatchSize: number;
  firstHashIndex: number;
  lastHashIndex: number;
  hashes: ApayHashEntry[];
}

// ─── Swaps ────────────────────────────────────────────────────────────────────

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
