// Main wallet exports
export {
  createWallet,
  WalletManager,
  createWalletManager,
} from './wallet/wallet-manager';
export type { WalletInitParams } from './wallet/wallet-manager';

// UTEXO wallet exports
export { UTEXOWallet } from './utexo/utexo-wallet';
export {
  restoreUtxoWalletFromVss,
  restoreUtxoWalletFromBackup,
  getBackupStoreId,
  buildVssConfigFromMnemonic,
} from './utexo/restore';
export {
  UTEXOProtocol,
  LightningProtocol,
  OnchainProtocol,
  DEFAULT_VSS_SERVER_URL,
} from '@utexo/rgb-sdk-core';
export type {
  ConfigOptions,
  IUTEXOProtocol,
  ILightningProtocol,
  IOnchainProtocol,
} from '@utexo/rgb-sdk-core';

// WASM initializer — call once before using any wallet APIs
export { initWasm } from './wasm/init';

/** rgb-lib WASM serde JSON shapes (snake_case). Use `WasmJson.Recipient`, etc. */
export type * as WasmJson from './binding/WasmTypes';

// Type exports
export * from './types/rgb-model';
export type {
  TransferStatus,
  BridgeTransferStatus,
  OnchainSendStatus,
} from '@utexo/rgb-sdk-core';
export type {
  Network,
  PsbtType,
  SignPsbtOptions,
  NetworkVersions,
  Descriptors,
} from './crypto/signer';
export type { GeneratedKeys, AccountXpubs } from '@utexo/rgb-sdk-core';

// Function exports
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

// Error exports
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

// Utility exports
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

// Constants
export {
  DEFAULT_NETWORK,
  DEFAULT_API_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_LOG_LEVEL,
  DEFAULT_TRANSPORT_ENDPOINTS,
  DEFAULT_INDEXER_URLS,
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
