/**
 * Tests for new optional WalletInitParams fields:
 * reuseAddresses, vanillaKeychain, maxAllocationsPerUtxo
 *
 * @utexo/rgb-lib-wasm is redirected to a manual mock via moduleNameMapper
 * so the WASM binary is never loaded.
 */
// @ts-nocheck
import { jest } from '@jest/globals';

// Mock initWasm so WasmRgbLibBinding.create() doesn't try to fetch the WASM binary
jest.mock('../src/wasm/init.ts', () => ({
  initWasm: jest.fn().mockResolvedValue(undefined),
}));

import { WasmRgbLibBinding } from '../src/binding/WasmRgbLibBinding';
import { lastCreatedWalletData, mockWasmWalletInstance } from './__mocks__/rgb-lib-wasm';

const baseParams = {
  xpubVan:
    'tpubDDTg3fRGqAvEvshRUUwuS8brXkewNsE6y6Jbb9xZcuzBbmxAWa3UCmwyQG4peM9RwjgY8BDwuRVRU5KGtvRby5kiv1dk13YHU8z39o18QJK',
  xpubCol:
    'tpubDDqoEexZxewBLjXmZ7kxSHgZgmdAtej6DrXLBMiSSuPCdGQqjkTvyETLLVY7qNpxNRGUivvxDj8sswHHihT5effNNDmsbMUX2Lrpy4zjRcS',
  masterFingerprint: '42424232',
  mnemonic:
    'flight seminar tray bulb level embody switch enhance august deny scene dismiss',
  network: 'regtest',
};

function getWalletData() {
  return lastCreatedWalletData as Record<string, unknown>;
}

describe('WasmRgbLibBinding — reuseAddresses', () => {
  it('defaults reuse_addresses to false when not provided', async () => {
    await WasmRgbLibBinding.create(baseParams);
    expect(getWalletData().reuse_addresses).toBe(false);
  });

  it('passes reuse_addresses: true when reuseAddresses: true', async () => {
    await WasmRgbLibBinding.create({ ...baseParams, reuseAddresses: true });
    expect(getWalletData().reuse_addresses).toBe(true);
  });

  it('passes reuse_addresses: false when reuseAddresses: false', async () => {
    await WasmRgbLibBinding.create({ ...baseParams, reuseAddresses: false });
    expect(getWalletData().reuse_addresses).toBe(false);
  });
});

describe('WasmRgbLibBinding — vanillaKeychain', () => {
  it('defaults vanilla_keychain to 0 when not provided', async () => {
    await WasmRgbLibBinding.create(baseParams);
    expect(getWalletData().vanilla_keychain).toBe(0);
  });

  it('passes vanilla_keychain: 0 when vanillaKeychain: 0', async () => {
    await WasmRgbLibBinding.create({ ...baseParams, vanillaKeychain: 0 });
    expect(getWalletData().vanilla_keychain).toBe(0);
  });

  it('passes vanilla_keychain: null when vanillaKeychain: null', async () => {
    await WasmRgbLibBinding.create({ ...baseParams, vanillaKeychain: null });
    expect(getWalletData().vanilla_keychain).toBeNull();
  });

  it('passes custom vanilla_keychain value', async () => {
    await WasmRgbLibBinding.create({ ...baseParams, vanillaKeychain: 2 });
    expect(getWalletData().vanilla_keychain).toBe(2);
  });
});

describe('WasmRgbLibBinding — maxAllocationsPerUtxo', () => {
  it('defaults max_allocations_per_utxo to 5 when not provided', async () => {
    await WasmRgbLibBinding.create(baseParams);
    expect(getWalletData().max_allocations_per_utxo).toBe(5);
  });

  it('passes custom max_allocations_per_utxo value', async () => {
    await WasmRgbLibBinding.create({ ...baseParams, maxAllocationsPerUtxo: 1 });
    expect(getWalletData().max_allocations_per_utxo).toBe(1);
  });

  it('passes max_allocations_per_utxo: 10', async () => {
    await WasmRgbLibBinding.create({ ...baseParams, maxAllocationsPerUtxo: 10 });
    expect(getWalletData().max_allocations_per_utxo).toBe(10);
  });
});

describe('WasmRgbLibBinding — rotateVanillaAddress / rotateColoredAddress', () => {
  it('rotateVanillaAddress calls wallet.rotate_address(0)', async () => {
    const binding = await WasmRgbLibBinding.create(baseParams);
    const addr = await binding.rotateVanillaAddress();
    expect(mockWasmWalletInstance.rotate_address).toHaveBeenCalledWith(0);
    expect(addr).toBe('tb1qvanilla');
  });

  it('rotateColoredAddress calls wallet.rotate_address(1)', async () => {
    const binding = await WasmRgbLibBinding.create(baseParams);
    const addr = await binding.rotateColoredAddress();
    expect(mockWasmWalletInstance.rotate_address).toHaveBeenCalledWith(1);
    expect(addr).toBe('tb1qcolored');
  });
});
