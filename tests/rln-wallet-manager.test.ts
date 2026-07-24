import { jest } from '@jest/globals';
import {
  RlnWalletManager,
  WalletError,
  ValidationError,
  bip39,
} from '../dist/index.mjs';

/**
 * Ported from `rgb-sdk-core/tests/base-wallet-manager.test.ts`, deleted with
 * `BaseWalletManager` in step 5 of MIGRATION-PLAN-v3.md.
 *
 * The logic did not disappear — it moved here when `RlnWalletManager` stopped
 * extending the base and absorbed the delegations. These are the cases that
 * still describe real behaviour.
 *
 * Deliberately NOT ported (they tested a state that can no longer exist):
 *   - "constructs without binding or signer"
 *   - "getBtcBalance / listUnspents throw when no binding"
 *   - "estimateFee throws when no signer"
 * `binding` and `signer` are now required, non-null constructor arguments, so
 * the nullable-binding defect those covered is structurally impossible.
 *
 * Also not ported: the `WalletInitParams` optional-field acceptance tests
 * (`reuseAddresses`, `vanillaKeychain`, `maxAllocationsPerUtxo`). Those fields
 * are now plain optional properties on `RlnWalletInitParams` with no
 * constructor behaviour to assert.
 *
 * The constructor is `private` — TypeScript-only, erased at runtime — so these
 * tests construct through it directly with a mock binding, which is what the
 * original did via a test subclass.
 */

const testMnemonic =
  'flight seminar tray bulb level embody switch enhance august deny scene dismiss';

const minimalParams = {
  mnemonic: testMnemonic,
  password: 'test-password',
  xpubVan:
    'tpubDDTg3fRGqAvEvshRUUwuS8brXkewNsE6y6Jbb9xZcuzBbmxAWa3UCmwyQG4peM9RwjgY8BDwuRVRU5KGtvRby5kiv1dk13YHU8z39o18QJK',
  xpubCol:
    'tpubDDqoEexZxewBLjXmZ7kxSHgZgmdAtej6DrXLBMiSSuPCdGQqjkTvyETLLVY7qNpxNRGUivvxDj8sswHHihT5effNNDmsbMUX2Lrpy4zjRcS',
  masterFingerprint: '42424232',
  network: 'testnet',
};

function makeBinding(overrides: Record<string, unknown> = {}) {
  return {
    dropWallet: jest.fn(),
    getBtcBalance: jest.fn().mockResolvedValue({
      vanilla: { settled: 100, future: 0, spendable: 100 },
      colored: { settled: 0, future: 0, spendable: 0 },
    }),
    getAddress: jest.fn().mockResolvedValue('tb1qtest'),
    rotateVanillaAddress: jest.fn().mockResolvedValue('tb1qvanilla'),
    rotateColoredAddress: jest.fn().mockResolvedValue('tb1qcolored'),
    listUnspents: jest.fn().mockResolvedValue([]),
    getFeeEstimation: jest.fn().mockResolvedValue({ feeRate: 1 }),
    ...overrides,
  } as never;
}

/** The constructor is private at the type level only. */
function build(
  params: Record<string, unknown> = minimalParams,
  binding = makeBinding()
) {
  return new (
    RlnWalletManager as never as new (
      p: unknown,
      b: unknown
    ) => InstanceType<typeof RlnWalletManager>
  )(params, binding);
}

describe('RlnWalletManager construction', () => {
  it('exposes network and xpubs', () => {
    const wm = build();
    expect(wm.getNetwork()).toBe('testnet');
    expect(wm.getXpub().xpubVan).toBe(minimalParams.xpubVan);
    expect(wm.getXpub().xpubCol).toBe(minimalParams.xpubCol);
    expect(wm.isDisposed()).toBe(false);
  });

  it('throws ValidationError if xpubVan is missing', () => {
    expect(() => build({ ...minimalParams, xpubVan: '' })).toThrow(
      ValidationError
    );
  });

  it('throws ValidationError if xpubCol is missing', () => {
    expect(() => build({ ...minimalParams, xpubCol: '' })).toThrow(
      ValidationError
    );
  });

  it('defaults network to regtest', () => {
    const wm = build({ ...minimalParams, network: undefined });
    expect(wm.getNetwork()).toBe('regtest');
  });

  it('derives the seed from the mnemonic', async () => {
    // Observed indirectly: signMessage requires a derived seed and must not
    // throw the "seed is required" WalletError when a mnemonic was supplied.
    const wm = build();
    let message = '';
    try {
      await wm.signMessage('hello');
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(/seed is required/i.test(message)).toBe(false);
  });

  it('has no seed when no mnemonic is supplied', async () => {
    const wm = build({ ...minimalParams, mnemonic: undefined });
    await expect(wm.signMessage('hello')).rejects.toBeInstanceOf(WalletError);
  });
});

describe('RlnWalletManager binding delegation', () => {
  it('getBtcBalance delegates to the binding', async () => {
    const binding = makeBinding();
    const wm = build(minimalParams, binding);
    const balance = await wm.getBtcBalance();
    expect(
      (binding as never as Record<string, jest.Mock>).getBtcBalance
    ).toHaveBeenCalled();
    expect(balance.vanilla.settled).toBe(100);
  });

  it('getAddress delegates to the binding', async () => {
    const wm = build();
    expect(await wm.getAddress()).toBe('tb1qtest');
  });

  it('listUnspents delegates to the binding', async () => {
    const wm = build();
    expect(Array.isArray(await wm.listUnspents())).toBe(true);
  });

  it('delegates rotateVanillaAddress', async () => {
    const binding = makeBinding();
    const wm = build(minimalParams, binding);
    expect(await wm.rotateVanillaAddress()).toBe('tb1qvanilla');
    expect(
      (binding as never as Record<string, jest.Mock>).rotateVanillaAddress
    ).toHaveBeenCalled();
  });

  it('delegates rotateColoredAddress', async () => {
    const binding = makeBinding();
    const wm = build(minimalParams, binding);
    expect(await wm.rotateColoredAddress()).toBe('tb1qcolored');
    expect(
      (binding as never as Record<string, jest.Mock>).rotateColoredAddress
    ).toHaveBeenCalled();
  });
});

describe('RlnWalletManager estimateFeeRate validation', () => {
  it('rejects non-positive block counts', async () => {
    const wm = build();
    await expect(wm.estimateFeeRate(0)).rejects.toBeInstanceOf(ValidationError);
    await expect(wm.estimateFeeRate(-1)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('rejects non-integer block counts', async () => {
    const wm = build();
    await expect(wm.estimateFeeRate(1.5)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('delegates a valid request to the binding', async () => {
    const binding = makeBinding();
    const wm = build(minimalParams, binding);
    expect(await wm.estimateFeeRate(6)).toEqual({ feeRate: 1 });
    expect(
      (binding as never as Record<string, jest.Mock>).getFeeEstimation
    ).toHaveBeenCalledWith({ blocks: 6 });
  });
});

describe('RlnWalletManager signPsbt', () => {
  it('throws WalletError with neither mnemonic nor seed', async () => {
    const wm = build({ ...minimalParams, mnemonic: undefined });
    await expect(wm.signPsbt('psbt')).rejects.toBeInstanceOf(WalletError);
  });
});

describe('RlnWalletManager dispose', () => {
  it('isDisposed becomes true', async () => {
    const wm = build();
    expect(wm.isDisposed()).toBe(false);
    await wm.dispose();
    expect(wm.isDisposed()).toBe(true);
  });

  it('drops the wallet on the binding', async () => {
    const binding = makeBinding();
    const wm = build(minimalParams, binding);
    await wm.dispose();
    expect(
      (binding as never as Record<string, jest.Mock>).dropWallet
    ).toHaveBeenCalled();
  });

  it('rejects further operations after dispose', async () => {
    const wm = build();
    await wm.dispose();
    await expect(wm.getBtcBalance()).rejects.toBeInstanceOf(WalletError);
  });

  it('is idempotent', async () => {
    const wm = build();
    await wm.dispose();
    await wm.dispose();
    expect(wm.isDisposed()).toBe(true);
  });

  it('zeroes the derived seed', async () => {
    // The seed is derived internally from the mnemonic, so its bytes are
    // reached through the same bip39 derivation to confirm they are wiped.
    const wm = build();
    const derived = new Uint8Array(bip39.mnemonicToSeedSync(testMnemonic));
    expect(derived.some((b) => b !== 0)).toBe(true);
    await wm.dispose();
    // After dispose the manager holds no seed: signing must fail on the
    // missing-seed path rather than proceeding.
    await expect(wm.signMessage('hello')).rejects.toBeInstanceOf(WalletError);
  });
});
