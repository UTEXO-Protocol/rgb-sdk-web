import { describe, it, expect } from '@jest/globals';
import { runConformanceChecks } from '@utexo/rgb-sdk-core/conformance';
import { UTEXOWallet } from '../dist/index.mjs';

/**
 * Surface, capability and vocabulary checks.
 *
 * `createWalletSync` builds an **un-initialised** wallet: construction only
 * stores params (no wasm, no node, no network), which is enough to inspect the
 * carriers and `capabilities`. Anything needing a live wallet — `createWallet`
 * — belongs in the e2e suite.
 *
 * web is expected to report all three capabilities as `true`: it runs two
 * engines, an rgb-lib wallet in wasm *plus* the RLN node, so it can hand out
 * PSBTs, drive begin/end flows, and must back up two state stores manually.
 */
runConformanceChecks({
  name: 'rgb-sdk-web',
  walletClass: UTEXOWallet,
  createWalletSync: () =>
    new UTEXOWallet({
      mnemonic:
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      password: 'conformance',
      network: 'regtest',
    }) as unknown as Record<string, unknown>,
  describe,
  it,
  expect: expect as never,
});
