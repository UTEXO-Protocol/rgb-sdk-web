/**
 * Restore utility tests — browser WASM API.
 * restoreUtxoWalletFromBackup takes Uint8Array bytes, not file paths.
 * Validation errors are thrown before any WASM call, so no mock needed here.
 */
import {
  getBackupStoreId,
  restoreUtxoWalletFromBackup,
} from '../src/utexo/restore';
import { ValidationError } from '@utexo/rgb-sdk-core';

describe('restore utilities', () => {
  describe('getBackupStoreId', () => {
    it('should return wallet_<fp> format', () => {
      expect(getBackupStoreId('a66bffef')).toBe('wallet_a66bffef');
      expect(getBackupStoreId('dd80d908')).toBe('wallet_dd80d908');
    });
  });

  describe('restoreUtxoWalletFromBackup validation', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const password = 'test-password';
    const layer1Bytes = new Uint8Array([1, 2, 3]);
    const utexoBytes = new Uint8Array([4, 5, 6]);

    it('should throw ValidationError when layer1Bytes is missing', async () => {
      await expect(
        restoreUtxoWalletFromBackup({
          layer1Bytes: null as any,
          utexoBytes,
          password,
          mnemonic,
        })
      ).rejects.toThrow(ValidationError);
      await expect(
        restoreUtxoWalletFromBackup({
          layer1Bytes: null as any,
          utexoBytes,
          password,
          mnemonic,
        })
      ).rejects.toThrow('layer1Bytes and utexoBytes are required');
    });

    it('should throw ValidationError when utexoBytes is missing', async () => {
      await expect(
        restoreUtxoWalletFromBackup({
          layer1Bytes,
          utexoBytes: null as any,
          password,
          mnemonic,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when password is missing', async () => {
      await expect(
        restoreUtxoWalletFromBackup({
          layer1Bytes,
          utexoBytes,
          password: '',
          mnemonic,
        })
      ).rejects.toThrow(ValidationError);
      await expect(
        restoreUtxoWalletFromBackup({
          layer1Bytes,
          utexoBytes,
          password: '',
          mnemonic,
        })
      ).rejects.toThrow('password is required');
    });

    it('should throw ValidationError when mnemonic is missing', async () => {
      await expect(
        restoreUtxoWalletFromBackup({
          layer1Bytes,
          utexoBytes,
          password,
          mnemonic: '',
        })
      ).rejects.toThrow(ValidationError);
      await expect(
        restoreUtxoWalletFromBackup({
          layer1Bytes,
          utexoBytes,
          password,
          mnemonic: '   ',
        })
      ).rejects.toThrow('mnemonic is required');
    });
  });
});
