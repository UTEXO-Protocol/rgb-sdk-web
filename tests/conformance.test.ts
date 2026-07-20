import { describe, it, expect } from '@jest/globals';
import { runConformanceChecks } from '@utexo/rgb-sdk-core/conformance';
import { UTEXOWallet } from '../dist/index.mjs';

// Surface + vocabulary checks only — constructing a live wallet needs wasm and
// a node, which belongs in the e2e suite. `createWallet` is wired there.
runConformanceChecks({
  name: 'rgb-sdk-web',
  walletClass: UTEXOWallet,
  describe,
  it,
  expect: expect as never,
});
