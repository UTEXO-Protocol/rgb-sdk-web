import { WasmRgbLibBinding } from '../binding/WasmRgbLibBinding';
import { WasmSigner } from '../signer/WasmSigner';
import * as IWalletModel from '@utexo/rgb-sdk-core';
import { ValidationError } from '@utexo/rgb-sdk-core';
import { BaseWalletManager } from '@utexo/rgb-sdk-core';
import type { WalletInitParams } from '@utexo/rgb-sdk-core';
import { generateKeys } from '@utexo/rgb-sdk-core';

export type { WalletInitParams };

/**
 * Generate a new wallet with keys (pure-JS, no WASM required).
 */
export const createWallet = async (network: string = 'regtest') => {
  return await generateKeys(network);
};

/**
 * WalletManager — browser WASM implementation of BaseWalletManager.
 *
 * Construction is async — use the static `WalletManager.create(params)` factory.
 * The wallet is ready immediately after create() resolves; call goOnline() to
 * establish the indexer connection before network operations.
 */
export class WalletManager extends BaseWalletManager {
  private readonly client: WasmRgbLibBinding;

  private constructor(params: WalletInitParams, client: WasmRgbLibBinding) {
    super(params, client, new WasmSigner(client));
    this.client = client;
  }

  static async create(params: WalletInitParams): Promise<WalletManager> {
    if (!params.mnemonic) {
      throw new ValidationError(
        'mnemonic is required to create a WASM WalletManager',
        'mnemonic'
      );
    }

    const client = await WasmRgbLibBinding.create({
      xpubVan: params.xpubVan,
      xpubCol: params.xpubCol,
      masterFingerprint: params.masterFingerprint,
      mnemonic: params.mnemonic,
      network: String(params.network ?? 'regtest'),
      transportEndpoint: params.transportEndpoint,
      indexerUrl: params.indexerUrl,
    });

    return new WalletManager(params, client);
  }

  async initialize(): Promise<void> {
    // No-op — wallet is ready after WasmRgbLibBinding.create()
  }

  async goOnline(
    _indexerUrl: string,
    _skipConsistencyCheck?: boolean
  ): Promise<void> {
    await this.client.connect();
  }

  /**
   * Register wallet with the network — convenience method for the first
   * address + balance snapshot. Not part of IWalletManager.
   */
  registerWallet(): { address: string; btcBalance: IWalletModel.BtcBalance } {
    return this.client.registerWallet();
  }

  /**
   * Return the raw backup bytes produced by the most recent createBackup call.
   * Returns null if createBackup has not been called yet.
   */
  getLastBackupBytes(): Uint8Array | null {
    return this.client.getLastBackupBytes();
  }

  /**
   * Restore wallet state from raw backup bytes (WASM-specific alternative to
   * the filesystem-based restoreFromBackup).
   */
  restoreFromBackupBytes(bytes: Uint8Array, password: string): void {
    this.client.restoreFromBackupBytes(bytes, password);
  }
}

/**
 * Async factory — preferred way to create a WalletManager.
 */
export async function createWalletManager(
  params: WalletInitParams
): Promise<WalletManager> {
  return WalletManager.create(params);
}
