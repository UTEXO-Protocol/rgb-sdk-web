// RLN contract barrel.
//
// Shared Lightning domain types come from @utexo/rgb-sdk-core — one definition
// for web and RN, so the two SDKs cannot drift. Web-only extras (wasm SDK
// lifecycle, LDK runtime, swaps, node-side issuance shapes) stay local.

// ── Shared contract (core) ───────────────────────────────────────────────────

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
