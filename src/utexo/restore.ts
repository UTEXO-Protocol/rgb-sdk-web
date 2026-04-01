/**
 * UTEXO wallet restore — browser WASM implementation.
 *
 * No filesystem access. Backup data is represented as Uint8Array.
 * VSS restore writes wallet state to IndexedDB; a subsequent
 * UTEXOWallet.initialize() will load it automatically via WasmWallet.create().
 *
 * Pure crypto helpers are re-exported from @utexo/rgb-sdk-core.
 */

import {
  getUtxoNetworkConfig,
  type UtxoNetworkPreset,
  DEFAULT_VSS_SERVER_URL,
  ValidationError,
  deriveKeysFromMnemonicOrSeed,
  getBackupStoreId,
  buildVssConfigFromMnemonic,
} from '@utexo/rgb-sdk-core';
import type { VssBackupConfig } from '@utexo/rgb-sdk-core';
import { WasmRgbLibBinding } from '../binding/WasmRgbLibBinding';

export { getBackupStoreId, buildVssConfigFromMnemonic };

// ─── VSS restore ──────────────────────────────────────────────────────────────

/**
 * Restore a UTEXOWallet from VSS by restoring both layer1 and utexo wallet
 * states into IndexedDB. After this call, UTEXOWallet.initialize() will pick
 * up the restored state automatically via WasmWallet.create().
 */
export async function restoreUtxoWalletFromVss(params: {
  mnemonic: string;
  config?: VssBackupConfig;
  networkPreset?: UtxoNetworkPreset;
  vssServerUrl?: string;
}): Promise<void> {
  const {
    mnemonic,
    config: providedConfig,
    networkPreset = 'testnet',
    vssServerUrl,
  } = params;

  if (!mnemonic?.trim()) {
    throw new ValidationError('mnemonic is required', 'mnemonic');
  }

  const serverUrl = vssServerUrl ?? DEFAULT_VSS_SERVER_URL;
  const config =
    providedConfig ??
    (await buildVssConfigFromMnemonic(
      mnemonic.trim(),
      serverUrl,
      networkPreset
    ));

  const presetConfig = getUtxoNetworkConfig(networkPreset);

  const layer1Config: VssBackupConfig = {
    ...config,
    storeId: `${config.storeId}_layer1`,
  };
  const utexoConfig: VssBackupConfig = {
    ...config,
    storeId: `${config.storeId}_utexo`,
  };

  await Promise.all([
    _vssRestoreWallet({
      mnemonic,
      network: String(presetConfig.networkMap.mainnet),
      vssConfig: layer1Config,
    }),
    _vssRestoreWallet({
      mnemonic,
      network: String(presetConfig.networkMap.utexo),
      vssConfig: utexoConfig,
    }),
  ]);
}

// ─── File backup restore ──────────────────────────────────────────────────────

/**
 * Restore a UTEXOWallet from encrypted backup bytes (layer1 + utexo).
 * Backup bytes are produced by UTEXOWallet.createBackup().
 * After this call, UTEXOWallet.initialize() will load the restored state.
 */
export async function restoreUtxoWalletFromBackup(params: {
  layer1Bytes: Uint8Array;
  utexoBytes: Uint8Array;
  password: string;
  mnemonic: string;
  networkPreset?: UtxoNetworkPreset;
}): Promise<void> {
  const {
    layer1Bytes,
    utexoBytes,
    password,
    mnemonic,
    networkPreset = 'testnet',
  } = params;

  if (!layer1Bytes || !utexoBytes) {
    throw new ValidationError(
      'layer1Bytes and utexoBytes are required',
      'restoreUtxoWalletFromBackup'
    );
  }
  if (!password) {
    throw new ValidationError('password is required', 'password');
  }
  if (!mnemonic?.trim()) {
    throw new ValidationError('mnemonic is required', 'mnemonic');
  }

  const presetConfig = getUtxoNetworkConfig(networkPreset);

  await Promise.all([
    _bytesRestoreWallet({
      mnemonic,
      network: String(presetConfig.networkMap.mainnet),
      backupBytes: layer1Bytes,
      password,
    }),
    _bytesRestoreWallet({
      mnemonic,
      network: String(presetConfig.networkMap.utexo),
      backupBytes: utexoBytes,
      password,
    }),
  ]);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _resolveKeys(mnemonic: string, network: string) {
  const keys = await deriveKeysFromMnemonicOrSeed(network, mnemonic);
  return {
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
  };
}

async function _vssRestoreWallet(params: {
  mnemonic: string;
  network: string;
  vssConfig: VssBackupConfig;
}): Promise<void> {
  const { mnemonic, network, vssConfig } = params;
  const keys = await _resolveKeys(mnemonic, network);

  const binding = await WasmRgbLibBinding.create({
    ...keys,
    mnemonic,
    network,
  });

  binding.configureVssBackup(vssConfig);
  await binding.vssRestoreBackup();
  binding.dropWallet();
}

async function _bytesRestoreWallet(params: {
  mnemonic: string;
  network: string;
  backupBytes: Uint8Array;
  password: string;
}): Promise<void> {
  const { mnemonic, network, backupBytes, password } = params;
  const keys = await _resolveKeys(mnemonic, network);

  const binding = await WasmRgbLibBinding.create({
    ...keys,
    mnemonic,
    network,
  });

  binding.restoreFromBackupBytes(backupBytes, password);
  binding.dropWallet();
}
