import { DEFAULT_INDEXER_URLS } from './binding/RlnDefaults';

// ── End-user wallet ──────────────────────────────────────────────────────────
// Single RLN-backed wallet (RGB on-chain + native Lightning). Mirrors
// @utexo/rgb-sdk-rn's UTEXOWallet surface (IWalletManager + IUTEXOProtocol).
export { UTEXOWallet } from './utexo/utexo-wallet';
export type {
  UTEXOWalletCreateParams,
  RlnVssRestoreResult,
} from './utexo/utexo-wallet';

// Core protocol interfaces / base classes
export {
  UTEXOProtocol,
  LightningProtocol,
  OnchainProtocol,
  DEFAULT_VSS_SERVER_URL,
} from '@utexo/rgb-sdk-core';
export type {
  ConfigOptions,
  IWalletManager,
  IUTEXOProtocol,
  ILightningProtocol,
  IOnchainProtocol,
} from '@utexo/rgb-sdk-core';

// ── RLN WASM ─────────────────────────────────────────────────────────────────
// Initializer — call once before using any wallet APIs.
export { initRlnWasm } from './wasm/initRln';

// RLN binding (low-level)
export { RlnWasmBinding } from './binding/RlnWasmBinding';
export type { RlnBindingCreateParams } from './binding/RlnWasmBinding';

// RLN network defaults
export { DEFAULT_RLN_URLS, getRlnUrls } from './binding/RlnDefaults';
export type { RlnNetworkUrls } from './binding/RlnDefaults';
export { getDefaultLspBaseUrl, resolveLspBaseUrl } from './binding/RlnDefaults';

// RLN wallet manager
export {
  RlnWalletManager,
  createRlnWalletManager,
} from './wallet/rln-wallet-manager';
export type { RlnWalletInitParams } from './wallet/rln-wallet-manager';

// RLN Lightning node binding
export { RlnNodeBinding } from './lightning/RlnNodeBinding';

// RLN interface types + model (vendored locally; see src/rln)
export type { IRlnWalletBinding, IRlnNodeBinding, IRlnSdkBinding } from './rln';
export type * from './types/rln-model';

// ── LSP (utexo-lsp) — APay, Lightning Address, RGB↔LN bridge flows ────────────
export { UtexoLsp } from './lsp/UtexoLsp';
export type {
  WaitOptions,
  ReceiveAssetOptions,
  ReceiveAssetResult,
  SendAssetOptions,
  SendAssetResult,
  PayAddressOptions,
  LightningAddressInfo,
  ClaimResult,
} from './lsp/UtexoLsp';
export { UtexoLSPClient, LspError } from './lsp/UtexoLSPClient';
export {
  LspChannelTimeoutError,
  LspLiquidityTimeoutError,
  LspSettlementError,
} from './lsp/LspErrors';
export type { IUtexoLSPClient } from './lsp/IUtexoLSPClient';
export { peerUri, normalizeReceiveStatus } from './lsp/lsp-types';
export type * from './lsp/lsp-types';

// ── Types ────────────────────────────────────────────────────────────────────
export * from './types/rgb-model';
export type {
  TransferStatus,
  BridgeTransferStatus,
  OnchainSendStatus,
  VssBackupConfig,
  VssBackupInfo,
} from '@utexo/rgb-sdk-core';
export type {
  Network,
  PsbtType,
  SignPsbtOptions,
  NetworkVersions,
  Descriptors,
} from './crypto/signer';
export type { GeneratedKeys, AccountXpubs } from '@utexo/rgb-sdk-core';

// ── Functions ────────────────────────────────────────────────────────────────
export { signPsbt, signPsbtFromSeed, estimatePsbt } from './crypto/signer';
export {
  signMessage,
  verifyMessage,
  generateKeys,
  deriveKeysFromMnemonic,
  deriveKeysFromSeed,
  deriveKeysFromMnemonicOrSeed,
  restoreKeys,
  accountXpubsFromMnemonic,
  getXprivFromMnemonic,
  getXpubFromXpriv,
  deriveKeysFromXpriv,
  deriveVssSigningKeyFromMnemonic,
  bip39,
} from '@utexo/rgb-sdk-core';

// ── Errors ───────────────────────────────────────────────────────────────────
export {
  SDKError,
  NetworkError,
  ValidationError,
  WalletError,
  CryptoError,
  ConfigurationError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  RgbNodeError,
} from '@utexo/rgb-sdk-core';

// ── Utilities ────────────────────────────────────────────────────────────────
export { logger, configureLogging, LogLevel } from '@utexo/rgb-sdk-core';
export {
  validateNetwork,
  normalizeNetwork,
  validateMnemonic,
  validatePsbt,
  validateBase64,
  validateHex,
  validateRequired,
  validateString,
  isNetwork,
} from '@utexo/rgb-sdk-core';

// ── Constants ────────────────────────────────────────────────────────────────
export {
  DEFAULT_NETWORK,
  DEFAULT_API_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_LOG_LEVEL,
  DEFAULT_TRANSPORT_ENDPOINTS,
  DERIVATION_PURPOSE,
  DERIVATION_ACCOUNT,
  KEYCHAIN_RGB,
  KEYCHAIN_BTC,
  COIN_RGB_MAINNET,
  COIN_RGB_TESTNET,
  COIN_BITCOIN_MAINNET,
  COIN_BITCOIN_TESTNET,
  NETWORK_MAP,
  BIP32_VERSIONS,
  utexoNetworkMap,
  utexoNetworkIdMap,
  getDestinationAsset,
  getUtxoNetworkConfig,
} from '@utexo/rgb-sdk-core';
export type {
  NetworkAsset,
  UtxoNetworkId,
  UtxoNetworkPreset,
  UtxoNetworkMap,
  UtxoNetworkIdMap,
  UtxoNetworkPresetConfig,
} from '@utexo/rgb-sdk-core';

export { DEFAULT_INDEXER_URLS };
