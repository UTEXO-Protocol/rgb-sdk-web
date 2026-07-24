// RLN contract barrel.
//
// Shared Lightning domain types come from @utexo/rgb-sdk-core — one definition
// for web and RN, so the two SDKs cannot drift. Web-only extras (wasm SDK
// lifecycle, LDK runtime, swaps, node-side issuance shapes) stay local.

// ── Shared contract (core) ───────────────────────────────────────────────────

import type { OpenChannelResult } from '@utexo/rgb-sdk-core';

export type {
  LightningChannel,
  OpenChannelParams,
  OpenChannelResult,
  LightningInvoice,
  CreateHodlInvoiceParams,
  HodlInvoiceResult,
  DecodedLnInvoice,
  LightningPayment,
  SendPaymentParams,
  SendPaymentResult,
  KeysendParams,
  LightningAssetParam,
  LightningPeer,
  LightningNodeInfo,
  LightningNetworkInfo,
  ApayHashEntry,
  ApayNewResponse,
  LdkVssBackupInfo,
  RlnInvoiceStatus,
  RlnPaymentStatus,
  RlnChannelStatus,
  WireMapper,
} from '@utexo/rgb-sdk-core';

export {
  normalizeInvoiceStatus,
  normalizePaymentStatus,
  normalizeChannelStatus,
  isTerminalPaymentStatus,
  isClaimablePaymentStatus,
} from '@utexo/rgb-sdk-core';

// ── Web-only ─────────────────────────────────────────────────────────────────

export type * from '../types/rln-model';
export type { IRlnWalletBinding } from '../interfaces/IRlnWalletBinding';
export type { IRlnNodeBinding } from '../interfaces/IRlnNodeBinding';
export type { IRlnSdkBinding } from '../interfaces/IRlnSdkBinding';

// ── Channel funding — web-only (§6.0r) ───────────────────────────────────────
//
// The wasm node asks the app to fund a channel it has agreed to open: LDK
// emits FundingGenerationReady, the app builds and signs the funding tx with
// the BDK wallet, then hands the raw hex back. rn's node does all of this
// internally, so these types are deliberately not in core.

/**
 * What `UTEXOWallet.openChannel` returns on web.
 *
 * A superset of the shared `OpenChannelResult`: web funds the channel itself,
 * so it knows the funding txid and rn does not. Widening a **response** is safe
 * under §2.5 — the rule constrains parameters, since a platform that does not
 * populate an optional response field is not a defect (see
 * `scripts/check-param-usage.mjs` in core).
 */
export interface WebOpenChannelResult extends OpenChannelResult {
  /** Txid of the funding transaction this SDK built, signed and submitted. */
  fundingTxid?: string;
  /**
   * Raw signed funding transaction, as submitted.
   *
   * Returned so callers can inspect or re-publish it without needing the
   * funding handshake methods, which are internal to `openChannel`. The demo's
   * §6.0s repro uses it to re-POST the identical hex to esplora when the
   * indexer never saw it — the probe that separates "our broadcast is broken"
   * from "the transaction itself is invalid".
   */
  fundingTxHex?: string;
}

/** One channel awaiting funding — LDK's FundingGenerationReady, as data. */
export interface PendingFundingRequest {
  temporaryChannelId: string;
  counterpartyNodeId: string;
  /** The 2-of-2 funding output script LDK wants paid. */
  outputScriptHex: string;
  channelValueSat: number;
}

export interface BuildFundingTxParams {
  outputScriptHex: string;
  amountSat: number;
  /** sat/vB. Default 1. */
  feeRate?: number;
}

/** A built and signed funding tx — **not** broadcast; LDK does that. */
export interface FundingTx {
  fundingTxHex: string;
  txid: string;
  address?: string;
  signedPsbt?: string;
}

export interface SubmitFundingParams {
  temporaryChannelId: string;
  counterpartyNodeId: string;
  fundingTxHex: string;
  /** Pass it to have the funding tx queued for broadcast (strongly advised). */
  txid?: string;
}
