/**
 * Scenario I — the wallet opens and funds its own channel (§6.0r).
 *
 * The wasm node has no wallet of its own, so LDK emits FundingGenerationReady
 * and waits for the app's BDK wallet to pay the 2-of-2 output. `openChannel`
 * now owns that whole handshake:
 *
 *   openChannel → listPendingFundingRequests → buildLightningFundingTx
 *               → submitFundingTransaction
 *
 * It used to be phase one only, and this spec drove phase two by hand. That
 * left `openChannel` meaning something different on web than on rn, where the
 * node funds internally — so the wrapper moved into the SDK and this spec now
 * asserts what an app actually calls. The three methods stay public and are
 * still exercised directly by the demo's step-by-step repro.
 *
 * The peer must be a daemon started **without** `--enable-virtual-channels-v0`:
 * one with it rejects a wasm-initiated open with `unsupported_scid_alias`.
 * `start-lsp-web.sh` starts exactly such a node (REGULAR_*).
 *
 * For a real user this is "open a channel with my own coins" — the wallet pays
 * for its own inbound liquidity instead of asking an LSP for it:
 *
 * ```ts
 * // The peer must be reachable and connected first: a browser node cannot be
 * // dialled, so it always dials out.
 * await wallet.connectPeer(`${peerPubkey}@${host}:${port}`);
 *
 * // One call. It opens, waits for LDK to ask for funding, builds and signs the
 * // funding transaction with the wallet's own UTXOs, and submits it.
 * const opened = await wallet.openChannel({
 *   peerPubkey,
 *   capacitySat: 100_000,
 *   isPublic: false,
 *   // assetId / assetLocalAmount to open a coloured channel instead
 * });
 * opened.fundingTxid;   // the on-chain transaction now paying for the channel
 *
 * // It returns once the funding tx is submitted — NOT once the channel is
 * // usable. That needs confirmations, and the browser node has no background
 * // processor, so the app polls (which also drives the node):
 * for (;;) {
 *   const chan = (await wallet.listChannels())
 *     .find((c) => c.fundingTxid === opened.fundingTxid);
 *   if (chan?.ready) break;
 *   await sleep(5000);
 * }
 * ```
 *
 * The fee rate for that funding transaction is wallet-level (`feeRateSatVb`,
 * default 7), mirroring the native daemon's `[rgb] fee_rate_sat_vb` — it is not
 * an argument to `openChannel`, on either platform.
 */
import { test, expect } from '@playwright/test';
import { report, expectFields, HEX_32 } from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures, gatewayFund } from './fixtures';
import {
  bootWallet,
  wcall,
  fundAndCreateUtxos,
  retry,
  wirePageLogging,
} from './harness-client';

const f = loadFixtures();

const CAPACITY_SAT = 100_000;

interface ChannelShape {
  channelId: string;
  peerPubkey: string;
  capacitySat: number;
  ready: boolean;
  isUsable?: boolean;
}

test('I: wallet opens and funds its own channel', async ({ page }) => {
  test.skip(
    !f.REGULAR_PUBKEY,
    'fixture has no REGULAR_PUBKEY — re-run scripts/start-lsp-web.sh'
  );
  test.setTimeout(420_000);
  wirePageLogging(page);

  await bootWallet(page, f);
  const address = await wcall<string>(page, 'getAddress');
  await fundAndCreateUtxos(page, f, address, 3);

  const peerUri = `${f.REGULAR_PUBKEY}@127.0.0.1:${f.REGULAR_PEER_PORT}`;
  await retry(() => wcall(page, 'connectPeer', peerUri));

  // ── open + fund, in one call ──────────────────────────────────────────────
  // Returns once the funding tx is submitted, not once the channel is ready —
  // readiness needs confirmations and is asserted below, the same way an app
  // would poll for it.
  const funding = await wcall<{
    temporaryChannelId: string;
    fundingTxid?: string;
  }>(page, 'openChannel', {
    peerPubkey: f.REGULAR_PUBKEY,
    capacitySat: CAPACITY_SAT,
    isPublic: false,
  });
  report('openChannel (funded)', funding);
  expectFields(funding, {
    temporaryChannelId: { type: 'string', nonEmpty: true },
    fundingTxid: { type: 'string', pattern: HEX_32 },
  });

  // The funding tx must actually reach the network — a channel cannot lock in
  // on a transaction nobody has seen.
  //
  // Presence must be read from `GET /tx/<txid>`, which 404s when esplora has
  // never seen the txid. `/tx/<txid>/status` cannot answer this: it returns
  // **HTTP 200 `{"confirmed":false}`** for a txid that has never existed, so
  // an `r.ok` check there passes instantly for every transaction — including
  // one that was never broadcast. This assertion was previously a no-op.
  await expect
    .poll(
      async () => {
        await wcall(page, 'listChannels').catch(() => undefined); // drive beat
        const r = await fetch(`${f.INDEXER_URL}/tx/${funding.fundingTxid}`);
        return r.ok
          ? ((await r.json()) as { status?: { confirmed?: boolean } })
          : null;
      },
      { timeout: 120_000, message: 'the funding tx must be broadcast' }
    )
    .not.toBeNull();

  // ── the claim: the channel the wallet funded becomes usable ───────────────
  const ready = await expect
    .poll(
      async () => {
        await gatewayFund(f, address, 0.0001, 1).catch(() => undefined);
        const channels = await wcall<ChannelShape[]>(page, 'listChannels');
        return (
          channels.find((c) => c.peerPubkey === f.REGULAR_PUBKEY && c.ready) ??
          null
        );
      },
      { timeout: 300_000, message: 'the funded channel must become ready' }
    )
    .not.toBeNull()
    .then(async () => {
      const channels = await wcall<ChannelShape[]>(page, 'listChannels');
      return channels.find(
        (c) => c.peerPubkey === f.REGULAR_PUBKEY && c.ready
      )!;
    });

  report('listChannels (wallet-funded)', ready);
  expect(ready.capacitySat).toBe(CAPACITY_SAT);
  expect(
    await wcall<{ numChannels?: number }>(page, 'getNodeInfo')
  ).toMatchObject({ numChannels: expect.any(Number) });
});
