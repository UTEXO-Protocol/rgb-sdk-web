/**
 * Manual mock for @utexo/rgb-lib-wasm — used by Jest to avoid loading the
 * actual WASM binary (which requires a browser fetch environment).
 */
import { jest } from '@jest/globals';

export const mockWasmWalletInstance = {
  free: jest.fn(),
  get_address: jest.fn().mockReturnValue('tb1qmock'),
  rotate_address: jest.fn().mockImplementation((keychain: number) =>
    keychain === 0 ? 'tb1qvanilla' : 'tb1qcolored'
  ),
  get_btc_balance: jest.fn().mockReturnValue({
    vanilla: { settled: 0, future: 0, spendable: 0 },
    colored: { settled: 0, future: 0, spendable: 0 },
  }),
  go_online: jest.fn().mockResolvedValue({ id: 1, indexer_url: '' }),
  backup: jest.fn().mockReturnValue(new Uint8Array()),
  sign_psbt: jest.fn().mockReturnValue('signed'),
  finalize_psbt: jest.fn().mockReturnValue('finalized'),
};

export let lastCreatedWalletData: Record<string, unknown> | null = null;

export const WasmWallet = {
  create: jest.fn().mockImplementation(async (json: string) => {
    lastCreatedWalletData = JSON.parse(json);
    return mockWasmWalletInstance;
  }),
};

export const WasmInvoice = jest.fn().mockImplementation(() => ({
  invoiceData: jest.fn().mockReturnValue({}),
  free: jest.fn(),
}));

export const generate_keys = jest.fn().mockReturnValue({
  mnemonic: 'test mnemonic',
  xpub: 'tpub...',
  account_xpub_vanilla: 'tpub...',
  account_xpub_colored: 'tpub...',
  master_fingerprint: '00000000',
});

export const restore_keys = jest.fn().mockReturnValue({
  mnemonic: 'test mnemonic',
  xpub: 'tpub...',
  account_xpub_vanilla: 'tpub...',
  account_xpub_colored: 'tpub...',
  master_fingerprint: '00000000',
});

// Default export is the WASM init function — called by src/wasm/init.ts
const initWasmModule = jest.fn().mockResolvedValue(undefined);
export default initWasmModule;
