import { DEFAULT_INDEXER_URLS } from './binding/RlnDefaults';

// ── End-user wallet ──────────────────────────────────────────────────────────
// Single RLN-backed wallet (RGB on-chain + native Lightning), implementing the
// shared `IUTEXOWallet` contract. Platform-specific surface (PSBT signing,
// begin/end flows, imperative VSS) is reached through optional carriers —
// `wallet.psbt`, `wallet.beginEnd`, `wallet.vss` — rather than being flat
// methods that throw where unsupported. See MIGRATION-PLAN-v3.md.
export { UTEXOWallet } from './utexo/utexo-wallet';
export type {
  UTEXOWalletCreateParams,
  RlnVssRestoreResult,
} from './utexo/utexo-wallet';

// VSS defaults
//
// The `UTEXOProtocol`/`LightningProtocol`/`OnchainProtocol` base classes and
// the `IUTEXOProtocol` interface family were deleted from core in step 6c:
// nothing implemented or extended them once both wallets moved to
// `IUTEXOWallet`, and the domain-group interfaces below supersede them.
export { DEFAULT_VSS_SERVER_URL } from '@utexo/rgb-sdk-core';

// The wallet contract — shared surface plus the optional carrier types.
export type {
  IUTEXOWallet,
  IUTEXOWalletCore,
  IWalletLifecycle,
  WalletCapabilities,
  IPsbtSigning,
  IBeginEndFlows,
  IVssBackup,
  CreateLnInvoiceRequest,
  ILightningNode,
  ILightningPayments,
  ILightningAddress,
  IOnchainTransfers,
  IRgbAssets,
  IBitcoinWallet,
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
// Re-exported from @utexo/rgb-sdk-core (the module lived here until it was
// consolidated; the public API of this package is unchanged).
export {
  UtexoLsp,
  UtexoLSPClient,
  LspError,
  LspChannelTimeoutError,
  LspLiquidityTimeoutError,
  LspSettlementError,
  peerUri,
  normalizeReceiveStatus,
} from '@utexo/rgb-sdk-core';
export type {
  WaitOptions,
  ReceiveAssetOptions,
  ReceiveAssetResult,
  SendAssetOptions,
  SendAssetResult,
  PayAddressOptions,
  LightningAddressInfo,
  ClaimResult,
  IUtexoLSPClient,
  ILspWallet,
  LspClientConfig,
  LspGetInfoResponse,
  LspGetInfoWire,
  LspLnParams,
  LspOnchainSendRequest,
  LspOnchainSendResponse,
  LspOnchainSendWire,
  LspRgbParams,
  LspLightningReceiveRequest,
  LspLightningReceiveResponse,
  LspLightningReceiveWire,
  LspLnurlpCallbackResponse,
  LspLnurlpCallbackWire,
  LspLightningAddressByPubkeyResponse,
  LspLightningAddressByPubkeyWire,
  LspApayInvoiceProofWire,
  ApayInvoiceProof,
  ApayMerkleProofElement,
  LspPeer,
  ReceiveStatus,
  ReceiveSettlementOutcome,
  ChannelReadyInfo,
} from '@utexo/rgb-sdk-core';

// ── Types ────────────────────────────────────────────────────────────────────
export * from './types/rgb-model';
// Unspent / Utxo / RgbAllocation now come from core — the local copies shadowed
// them with a different shape than listUnspents() actually returns.
export type {
  Unspent,
  Utxo,
  RgbAllocation,
  Assignment,
  AssignmentType,
  TransferStatus,
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
} from '@utexo/rgb-sdk-core';
// The UTEXO network-config table (`utexoNetworkMap`, `getUtxoNetworkConfig`,
// presets, …) was deleted in step 6c — re-exported by both SDKs, used by
// neither. Endpoint resolution lives in `binding/RlnDefaults.ts`.
export type { UtxoNetworkPreset } from '@utexo/rgb-sdk-core';

export { DEFAULT_INDEXER_URLS };
