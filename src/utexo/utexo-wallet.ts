/**
 * UTEXOWallet — browser WASM implementation of UTEXOWalletCore.
 *
 * Extends UTEXOWalletCore from @utexo/rgb-sdk-core, overriding:
 *   - initialize(): creates WASM WalletManager instances
 *   - createBackup(): dual backup returning layer1 + utexo Uint8Arrays
 */

import { UTEXOWalletCore } from '@utexo/rgb-sdk-core';
import { WalletManager } from '../wallet/wallet-manager';
import type { WalletBackupResponse } from '@utexo/rgb-sdk-core';
import { ValidationError } from '@utexo/rgb-sdk-core';

export { UTEXOProtocol } from '@utexo/rgb-sdk-core';
export type { IUTEXOProtocol } from '@utexo/rgb-sdk-core';

export class UTEXOWallet extends UTEXOWalletCore {
  async initialize(): Promise<void> {
    const layer1Keys = await this.derivePublicKeys(this.networkMap.mainnet);
    const utexoKeys = await this.derivePublicKeys(this.networkMap.utexo);

    this.utexoWallet = await WalletManager.create({
      xpubVan: utexoKeys.accountXpubVanilla,
      xpubCol: utexoKeys.accountXpubColored,
      masterFingerprint: utexoKeys.masterFingerprint,
      network: this.networkMap.utexo,
      mnemonic: this.mnemonicOrSeed as string,
    });

    this.layer1Wallet = await WalletManager.create({
      xpubVan: layer1Keys.accountXpubVanilla,
      xpubCol: layer1Keys.accountXpubColored,
      masterFingerprint: layer1Keys.masterFingerprint,
      network: this.networkMap.mainnet,
      mnemonic: this.mnemonicOrSeed as string,
    });
  }

  /**
   * Create backup for both layer1 and utexo wallets.
   * Returns Uint8Array bytes for each — no filesystem access in browser.
   */
  override async createBackup(params: {
    password: string;
  }): Promise<
    WalletBackupResponse & { layer1Bytes: Uint8Array; utexoBytes: Uint8Array }
  > {
    this.ensureInitialized();
    const { password } = params;
    if (!password) {
      throw new ValidationError('password is required', 'createBackup');
    }

    await this.layer1Wallet!.createBackup({ backupPath: '', password });
    const layer1Bytes = (
      this.layer1Wallet as WalletManager
    ).getLastBackupBytes();
    if (!layer1Bytes) {
      throw new ValidationError(
        'layer1 backup failed to produce bytes',
        'createBackup'
      );
    }

    await this.utexoWallet!.createBackup({ backupPath: '', password });
    const utexoBytes = (this.utexoWallet as WalletManager).getLastBackupBytes();
    if (!utexoBytes) {
      throw new ValidationError(
        'utexo backup failed to produce bytes',
        'createBackup'
      );
    }

    return {
      message: 'Backup created successfully (layer1 + utexo)',
      backupPath: ':memory:',
      layer1Bytes,
      utexoBytes,
    };
  }
}
