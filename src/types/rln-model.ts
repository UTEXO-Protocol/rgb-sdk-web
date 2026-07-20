// RLN (RGB Lightning Node) model types — web-only remainder.
//
// The shared Lightning domain types (LightningChannel, LightningNodeInfo,
// LightningPayment, DecodedLnInvoice, SendPaymentResult, OpenChannelParams,
// CreateHodlInvoiceParams, HodlInvoiceResult, ApayNewResponse, LdkVssBackupInfo,
// …) now live in @utexo/rgb-sdk-core and are re-exported by `src/rln`.
//
// What remains here is genuinely web-specific: wasm SDK lifecycle, the JS
// runtime/swap surfaces, and node-side issuance request shapes the RN binding
// does not expose.

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

// ─── Invoice params (wasm node) ───────────────────────────────────────────────

/**
 * Web's node-level create-invoice params.
 *
 * Distinct from core's `CreateLnInvoiceParams`: the wasm node takes `bigint`
 * for msat/asset amounts and requires `expirySec`.
 */
export interface CreateLnInvoiceParams {
  amtMsat?: bigint;
  expirySec: number;
  assetId?: string;
  assetAmount?: bigint;
}

/** Node-level HODL invoice params (wasm `bigint` amounts). */
export interface CreateHodlLnInvoiceParams extends CreateLnInvoiceParams {
  paymentHash: string;
}

export interface PaymentStatusUpdate {
  paymentHash?: string;
  invoice?: string;
  status: string;
}

// ─── LDK runtime (wasm-only) ──────────────────────────────────────────────────

export interface LdkRuntimeStatus {
  isRunning: boolean;
}

export interface ListRuntimeEventsResult {
  events: unknown[];
}

// ─── RLN wallet extras ────────────────────────────────────────────────────────

export interface SendRgbFromGroupsRequest {
  /** SDK-specific shape — platform binding normalizes */
  groups: unknown;
}

export interface SendRgbFromGroupsResult {
  txid?: string;
}

// ─── SDK lifecycle (wasm-only) ────────────────────────────────────────────────

export interface RlnSdkInitParams {
  password: string;
  mnemonic?: string;
}

// ─── Swaps (wasm-only) ────────────────────────────────────────────────────────

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
