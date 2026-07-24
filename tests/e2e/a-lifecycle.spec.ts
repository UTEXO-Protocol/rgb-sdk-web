/**
 * Scenario A — lifecycle & node (§7a.3).
 *
 * init → unlock → getNodeInfo → getNetworkInfo → isDisposed → dispose, with
 * every field named (§7a.2), capabilities asserted against the live object,
 * and runConformanceChecks fed the live wallet — the run §6.0f could not do.
 *
 * For a real user on the UTEXO network this is simply opening the app:
 *
 * ```ts
 * const wallet = new UTEXOWallet({
 *   network: 'utexo',
 *   mnemonic,          // generateKeys() on first run, then stored by the app
 *   password,
 * });
 * await wallet.init();      // LOCKED: local setup, no network
 * await wallet.unlock();    // online — everything below needs this
 *
 * // unlock() returns even when the indexer was unreachable — check, don't assume
 * if (!wallet.isOnline()) await wallet.goOnline();
 *
 * // No attach step: unlock() → goOnline() attaches the Lightning node itself
 * // once the wallet is online ("RN-style UX — no separate attach step"), and
 * // LN entry points attach lazily as a fallback for a wallet that came up
 * // offline. `attachLightningNode()` exists for callers that need to pin the
 * // timing — it is idempotent, and not part of an ordinary startup.
 * await wallet.getNodeInfo();            // our pubkey, channel counts
 * await wallet.getNetworkInfo();         // what the node sees of the graph
 *
 * // On the way out — closing the tab is not enough, the node holds sockets:
 * await wallet.dispose();
 * ```
 *
 * `init()` and `unlock()` are separate on purpose: the gap between them is the
 * only place a VSS restore may run (scenario G/H).
 */
import { test, expect } from '@playwright/test';
import {
  report,
  expectFields,
  expectNoWireKeys,
  HEX_PUBKEY,
} from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures } from './fixtures';
import {
  bootWallet,
  wcall,
  wget,
  runPageConformance,
  retry,
  wirePageLogging,
} from './harness-client';

const f = loadFixtures();

test('A: lifecycle, node info, capabilities, live conformance', async ({
  page,
}) => {
  wirePageLogging(page);

  const boot = await bootWallet(page, f);
  expect(boot.online, 'wallet must come up online (indexer reachable)').toBe(
    true
  );
  expect(boot.mnemonic.split(' ').length).toBeGreaterThanOrEqual(12);

  const network = await wcall<string>(page, 'getNetwork');
  expect(network).toBe('regtest');

  // Capabilities against the LIVE object: web implements both carriers.
  const caps = await wget<Record<string, boolean>>(page, 'capabilities');
  report('capabilities', caps);
  expect(caps).toEqual({
    psbtSigning: true,
    beginEndFlows: true,
  });

  // No explicit attach: unlock() went online, which attaches the node. The
  // runtime still spins up asynchronously, so retry.
  const nodeInfo = await retry(() =>
    wcall<Record<string, unknown>>(page, 'getNodeInfo')
  );
  report('getNodeInfo', nodeInfo);
  expectFields(nodeInfo, {
    pubkey: { type: 'string', nonEmpty: true, pattern: HEX_PUBKEY },
    numChannels: { type: 'number', optional: true },
    numUsableChannels: { type: 'number', optional: true },
    numPeers: { type: 'number', optional: true },
  });
  expectNoWireKeys(nodeInfo);

  const netInfo = await retry(() =>
    wcall<Record<string, unknown>>(page, 'getNetworkInfo')
  );
  report('getNetworkInfo', netInfo);
  expectFields(netInfo, {
    network: {
      type: 'string',
      oneOf: ['mainnet', 'testnet', 'testnet4', 'regtest', 'signet', 'utexo'],
    },
    blockHeight: { type: 'number', min: 1 },
  });
  expect(netInfo.network).toBe('regtest');
  expectNoWireKeys(netInfo);

  // Live conformance — invoiceStatus/listChannels/listPayments/estimateFeeRate
  // now run against real data instead of being skipped.
  const results = await runPageConformance(page);
  const failures = results.filter((r) => !r.ok);
  expect(
    failures,
    `conformance failures:\n${failures
      .map((r) => `  ${r.test}: ${r.error}`)
      .join('\n')}`
  ).toEqual([]);
  // Sanity: the suite actually ran (method surface + capabilities + runtime).
  expect(results.length).toBeGreaterThan(50);

  // Dispose is the end of the lifecycle, and must be observable.
  expect(await wcall<boolean>(page, 'isDisposed')).toBe(false);
  await wcall(page, 'dispose');
  expect(await wcall<boolean>(page, 'isDisposed')).toBe(true);
});
