/**
 * Restore flow tests with mocked WasmRgbLibBinding.
 * Verifies that restoreUtxoWalletFromBackup creates WASM bindings for both
 * layer1 and utexo wallets and calls restoreFromBackupBytes on each.
 * Uses jest.unstable_mockModule for ESM compatibility.
 */
import { jest } from '@jest/globals';

const mockBinding = {
  configureVssBackup: jest.fn(),
  vssRestoreBackup: jest.fn().mockResolvedValue(undefined),
  restoreFromBackupBytes: jest.fn(),
  dropWallet: jest.fn(),
};

await jest.unstable_mockModule('../src/binding/WasmRgbLibBinding', () => ({
  WasmRgbLibBinding: {
    create: jest.fn().mockResolvedValue(mockBinding),
  },
}));

const { restoreUtxoWalletFromBackup } = await import('../src/utexo/restore');

describe('restoreUtxoWalletFromBackup with mocked WasmRgbLibBinding', () => {
  const mnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const password = 'test-password';
  const layer1Bytes = new Uint8Array([1, 2, 3]);
  const utexoBytes = new Uint8Array([4, 5, 6]);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call restoreFromBackupBytes for both layer1 and utexo wallets', async () => {
    await restoreUtxoWalletFromBackup({ layer1Bytes, utexoBytes, password, mnemonic });

    expect(mockBinding.restoreFromBackupBytes).toHaveBeenCalledTimes(2);
  });

  it('should pass correct bytes and password to each restore call', async () => {
    await restoreUtxoWalletFromBackup({ layer1Bytes, utexoBytes, password, mnemonic });

    const calls = (mockBinding.restoreFromBackupBytes as jest.Mock).mock.calls;
    const bytesArgs = calls.map((c: any[]) => c[0]);
    expect(bytesArgs).toContainEqual(layer1Bytes);
    expect(bytesArgs).toContainEqual(utexoBytes);

    const passwordArgs = calls.map((c: any[]) => c[1]);
    expect(passwordArgs.every((p: string) => p === password)).toBe(true);
  });

  it('should call dropWallet for both bindings after restore', async () => {
    await restoreUtxoWalletFromBackup({ layer1Bytes, utexoBytes, password, mnemonic });

    expect(mockBinding.dropWallet).toHaveBeenCalledTimes(2);
  });

  it('should use testnet networkPreset by default', async () => {
    const { WasmRgbLibBinding } = await import('../src/binding/WasmRgbLibBinding');
    const createSpy = WasmRgbLibBinding.create as jest.Mock;

    await restoreUtxoWalletFromBackup({ layer1Bytes, utexoBytes, password, mnemonic });

    expect(createSpy).toHaveBeenCalledTimes(2);
    const networks = createSpy.mock.calls.map((c: any[]) => c[0].network);
    // testnet preset: layer1=testnet, utexo=signet
    expect(networks).toContain('testnet');
    expect(networks).toContain('signet');
  });
});
