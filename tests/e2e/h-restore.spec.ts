/**
 * Scenario H — backup survives device loss, with a channel open (§7a.3).
 * Requires VSS=1.
 *
 * G restores a quiet wallet. This one kills the device mid-life: funded,
 * holding an asset, with an open channel that value has already moved through.
 * The "device" is a **browser context** — closing it abruptly leaves empty
 * IndexedDB and a VSS fence still held, which is what a lost device looks like.
 * The restore runs in a second context: a different browser profile, same
 * mnemonic.
 *
 * It then closes what it restored, twice, because a channel that cannot be
 * closed back into on-chain funds is not really restored:
 *
 *   H1  the BTC channel above — its local balance must reappear on-chain
 *   H2  a second, COLOURED channel — its RGB must reappear on-chain
 *
 * Both exercise the post-close sweep added in rgb-lightning-node #119. Before
 * it the wasm side had no `Event::SpendableOutputs` handler: the closing tx was
 * coloured correctly and the native side recovered its half, while the wasm
 * side's balance stayed 0 forever.
 *
 * What the same thing looks like for a real user on the UTEXO network — the
 * flow this scenario stands in for, without the regtest scaffolding:
 *
 * ```ts
 * // ── BEFORE: ordinary life on the first device ─────────────────────────
 * const wallet = new UTEXOWallet({
 *   network: 'utexo',
 *   mnemonic,                       // the 12 words the user wrote down
 *   password,
 *   vssUrl: DEFAULT_VSS_SERVER_URL, // where the backup lives
 * });
 * await wallet.init();
 * await wallet.unlock();
 *
 * const address = await wallet.getAddress();   // receive BTC here first
 * await wallet.createUtxos({ upTo: false, num: 5, feeRate: 7 });
 * //   RGB allocations need their own UTXOs; without these, issuing or
 * //   receiving an asset fails for lack of a colourable output.
 *
 * const asset = await wallet.issueAssetNia({
 *   ticker: 'TICK', name: 'My asset', precision: 0, amounts: [400],
 * });
 *
 * // A channel appears: either the counterparty opens one to this node (an LSP
 * // typically does), or the wallet funds its own with openChannel(). Value
 * // then moves through it — invoices, keysends, APay payments.
 * await wallet.payLightningInvoice({ lnInvoice });
 *
 * // …and then the phone is lost. Nothing above is on this device any more.
 *
 * // ── AFTER: same seed, new device ──────────────────────────────────────
 * const wallet = new UTEXOWallet({
 *   network: 'utexo',
 *   mnemonic,                       // the same 12 words
 *   password,
 *   vssUrl: DEFAULT_VSS_SERVER_URL,
 * });
 * await wallet.init();              // LOCKED — local setup only
 * await wallet.restoreFromVss();    // only allowed in the init → unlock gap
 * await wallet.unlock();            // online
 *
 * // The wallet is back: assets, balances, and the channels it had open.
 * await wallet.listAssets();
 * const channels = await wallet.listChannels();
 *
 * // But a restored channel is not a CONNECTED channel. The channel state came
 * // back from the backup; the counterparty's ADDRESS did not — it lived in the
 * // lost device's peer store. And a browser node cannot be dialled (the relay
 * // is outbound-only), so nobody will reconnect on its behalf. Dial it, then
 * // wait for `isUsable`:
 * await wallet.connectPeer(`${peerPubkey}@${host}:${port}`);
 *
 * // take the money out of Lightning
 * await wallet.closeChannel(channelId, peerPubkey, false); // false = cooperative
 *
 * // 5. wait for the closing transaction, then for the sweep that follows it.
 * //    Nothing to trigger — blocks arrive on their own; the node claims its
 * //    output once the close has matured (~6 confirmations) and the sweep
 * //    transaction then needs a few of its own. Poll until the balance moves:
 * for (;;) {
 *   await wallet.listChannels();    // drive beat: the browser node has no
 *                                   // background processor of its own
 *   await wallet.syncWallet();
 *   await wallet.refreshWallet();
 *   const btc = await wallet.getBtcBalance();
 *   const rgb = await wallet.getAssetBalance(assetId);
 *   // `.future` includes the swept output before it confirms; `.settled`
 *   // only counts it afterwards. Both are views of one total — never add them.
 *   if (rgb.future >= expected) break;
 *   await sleep(5000);
 * }
 * ```
 *
 * The test replaces two things from that flow, and only two: it mines blocks
 * instead of waiting for them, and the Faucet stands in for whoever the user's
 * channel counterparty would be. Everything else — restore, reconnect, close,
 * poll until the sweep lands — is what an application actually does.
 *
 * One caveat worth carrying into real code: the channel must be a REGULAR one.
 * A virtual channel (what an LSP typically hands out) has no funding
 * transaction, so closing it is an `abandon` with nothing to settle on-chain —
 * its value has to be spent over Lightning first.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  report,
  expectFields,
  expectNoWireKeys,
  HEX_32,
  HEX_PUBKEY,
} from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures, mineBlocks, type WebFixtures } from './fixtures';
import {
  bootWallet,
  wcall,
  fundAndCreateUtxos,
  retry,
  wirePageLogging,
  type BtcBalanceShape,
} from './harness-client';

const f = loadFixtures();

const CAPACITY_SAT = 100_000;
const PUSH_MSAT = 50_000_000;
const INVOICE_SATS = 3_000;
const ISSUED_SUPPLY = 400;
/** Coloured channel (H2): the Faucet funds it and pushes half to the wasm side. */
const RGB_CHANNEL_AMOUNT = 200;
const RGB_CHANNEL_PUSH = 100;

interface ChannelShape {
  channelId: string;
  peerPubkey: string;
  capacitySat: number;
  ready: boolean;
  isUsable?: boolean;
  localBalanceMsat?: number;
  assetId?: string;
  assetLocalAmount?: number;
}

/**
 * On-chain RGB the wallet holds, counting not-yet-confirmed inflows.
 *
 * `future`, NOT `settled + future`: the three Balance fields are views of the
 * same total, not components of it — on a quiet wallet all three are equal, so
 * adding two of them double-counts. `future` is the one that includes pending
 * inflows, which is what a freshly swept close output is until it confirms;
 * `settled` alone would fail a sweep that merely landed a moment ago.
 *
 * `getAssetBalance` throws while the wallet has never seen the asset, which is
 * the same as zero here.
 */
async function assetBalanceFuture(
  page: Page,
  assetId: string
): Promise<number> {
  const bal = await wcall<{ settled?: number; future?: number } | null>(
    page,
    'getAssetBalance',
    assetId
  ).catch(() => null);
  return Number(bal?.future ?? bal?.settled ?? 0);
}
interface Snapshot {
  pubkey: string;
  btcSpendable: number;
  assetSettled: number;
  transfers: number;
  transactions: number;
  channelId: string;
  capacitySat: number;
  localBalanceMsat: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST to the Faucet's REST API from Node — no CORS involvement. */
async function faucetPost<T>(
  fx: WebFixtures,
  route: string,
  body: unknown
): Promise<T> {
  const r = await fetch(`${fx.FAUCET_URL}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`Faucet ${route} → HTTP ${r.status}: ${await r.text()}`);
  }
  return (await r.json()) as T;
}

/** An invoice from the Faucet — requested from Node, so no CORS involvement. */
async function faucetInvoice(fx: WebFixtures, sats: number): Promise<string> {
  const res = await faucetPost<{ invoice: string }>(fx, '/lninvoice', {
    amt_msat: sats * 1000,
    expiry_sec: 900,
  });
  return res.invoice;
}

/**
 * Poll until a channel matches, mining between attempts.
 *
 * `mineBlocks`, not `gatewayFund`: this used to mine by sending the wallet
 * 0.0001 BTC, which moved the very balance the snapshot below is compared
 * against. A top-up issued just before the snapshot but indexed just after it
 * reappeared as a 10_000 sat discrepancy at the `toBe(before.btcSpendable)`
 * check — a race the test created itself. Mining to bitcoind's own address
 * leaves the wallet untouched and makes that equality deterministic.
 */
async function waitForChannel(
  page: Page,
  predicate: (c: ChannelShape) => boolean,
  label: string,
  timeoutMs = 180_000,
  beforeEach?: () => Promise<void>
): Promise<ChannelShape> {
  const t0 = Date.now();
  for (;;) {
    if (beforeEach) await beforeEach();
    await wcall(page, 'syncWallet').catch(() => undefined);
    const channels = await wcall<ChannelShape[]>(page, 'listChannels');
    const match = channels.find(predicate);
    if (match) return match;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        `${label} after ${timeoutMs}ms (channels: ${JSON.stringify(channels)})`
      );
    }
    await mineBlocks(1).catch(() => undefined);
    await sleep(3000);
  }
}

/**
 * Dial the Faucet only when the session is actually down.
 *
 * `connectPeer` on an already-connected peer does not no-op — it hangs until
 * the handshake times out. By the time H2 opens its channel the restored wallet
 * has been talking to the Faucet for a while, so an unconditional dial fails
 * with "peer handshake did not complete within timeout".
 */
async function ensureFaucetConnected(
  page: Page,
  peerUri: string
): Promise<void> {
  const peers = await wcall<{ pubkey: string; isConnected?: boolean }[]>(
    page,
    'listPeers'
  ).catch(() => []);
  if (
    peers.some((p) => p.pubkey === f.FAUCET_PUBKEY && p.isConnected !== false)
  ) {
    return;
  }
  await retry(() => wcall(page, 'connectPeer', peerUri));
}

async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  wirePageLogging(page);
  return page;
}

test('H: device loss with an open channel, restored into a new browser', async ({
  browser,
}) => {
  test.skip(!f.VSS_URL, 'stack started without VSS=1 — no VSS_URL in fixture');
  // Two full channel lifecycles (open → close → on-chain settle) on top of the
  // restore, and post-close settlement waits on ANTI_REORG_DELAY plus sweep
  // confirmations. 10 min was enough for H1 alone; H2 doubles it.
  test.setTimeout(1_200_000);

  // ── the device that is about to be lost ───────────────────────────────────
  const page1 = await openPage(browser);
  const boot = await bootWallet(page1, f, { vss: true });
  const mnemonic = boot.mnemonic;

  const address = await wcall<string>(page1, 'getAddress');
  await fundAndCreateUtxos(page1, f, address, 5);

  const issued = await wcall<Record<string, unknown>>(page1, 'issueAssetNia', {
    ticker: 'HRST',
    name: 'H Restore Asset',
    precision: 0,
    amounts: [ISSUED_SUPPLY],
  });
  const assetId = issued.assetId as string;
  report('issueAssetNia', { assetId });

  // Who opens the channel is decided by the stack, not by the SDK. Both RLN
  // daemons here run with `--enable-virtual-channels-v0`, and such a node
  // rejects a wasm-initiated open with `unsupported_scid_alias` (seen in the
  // Faucet's log). The gateway relay is also outbound-only, so the browser
  // dials first and the Faucet opens over that session — the same topology
  // `rgb-sdk-web-demo`'s regular-channel flow uses.
  //
  // The wallet-initiated path is wired and available
  // (`openChannel` → `listPendingFundingRequests` → `buildLightningFundingTx`
  // → `submitFundingTransaction`, §6.0r); proving it live needs a peer without
  // virtual channels, which this stack does not run.
  const wasmPubkey = (
    await retry(() => wcall<{ pubkey: string }>(page1, 'getNodeInfo'))
  ).pubkey;
  const peerUri = `${f.FAUCET_PUBKEY}@127.0.0.1:${f.FAUCET_PEER_PORT}`;
  await retry(() => wcall(page1, 'connectPeer', peerUri));

  await faucetPost(f, '/openchannel', {
    peer_pubkey_and_opt_addr: wasmPubkey,
    capacity_sat: CAPACITY_SAT,
    push_msat: PUSH_MSAT,
    public: false,
    with_anchors: true,
  });

  const channel = await waitForChannel(
    page1,
    (c) => c.peerPubkey === f.FAUCET_PUBKEY && c.ready,
    'channel never became ready'
  );
  expect(channel.isPublic, 'the Faucet opened a private channel').toBe(false);
  report('listChannels (open)', channel);
  expectFields(channel, {
    channelId: { type: 'string', nonEmpty: true },
    peerPubkey: { type: 'string', pattern: HEX_PUBKEY },
    capacitySat: { type: 'number', min: CAPACITY_SAT, max: CAPACITY_SAT },
    ready: { type: 'boolean' },
  });
  expectNoWireKeys(channel, ['public', 'isActive']);

  // Move value off-chain, so the restored balance is not just the opening one.
  const lnInvoice = await faucetInvoice(f, INVOICE_SATS);
  const sent = await wcall<{ txid?: string; paymentHash?: string }>(
    page1,
    'payLightningInvoice',
    { lnInvoice }
  );
  report('payLightningInvoice', sent);
  const paymentId = String(sent.paymentHash ?? sent.txid ?? '');
  await expect
    .poll(
      async () =>
        wcall<string | null>(page1, 'getLightningSendStatus', paymentId),
      { timeout: 120_000, message: 'the outbound payment must settle' }
    )
    .toBe('Succeeded');

  // ── snapshot everything a user would notice ───────────────────────────────
  await wcall(page1, 'syncWallet');
  const nodeInfo = await wcall<{ pubkey: string }>(page1, 'getNodeInfo');
  const btc = await wcall<BtcBalanceShape>(page1, 'getBtcBalance');
  const assetBalance = await wcall<{ settled?: number }>(
    page1,
    'getAssetBalance',
    assetId
  );
  const transfers = await wcall<unknown[]>(
    page1,
    'listOnchainTransfers',
    assetId
  );
  const transactions = await wcall<unknown[]>(page1, 'listTransactions');
  const channelsBefore = await wcall<ChannelShape[]>(page1, 'listChannels');
  const open = channelsBefore.find((c) => c.channelId === channel.channelId)!;

  const before: Snapshot = {
    pubkey: nodeInfo.pubkey,
    btcSpendable: btc.vanilla.spendable,
    assetSettled: assetBalance.settled ?? 0,
    transfers: transfers.length,
    transactions: transactions.length,
    channelId: open.channelId,
    capacitySat: open.capacitySat,
    localBalanceMsat: open.localBalanceMsat ?? 0,
  };
  report('snapshot before device loss', before);
  expect(before.assetSettled).toBe(ISSUED_SUPPLY);

  const version = await wcall<number>(page1, 'backupNow');
  report('backupNow (version)', version);
  expect(version).toBeGreaterThan(0);

  // ── device loss: close the whole browser context, no dispose ──────────────
  await page1.context().close();

  // ── restore into a different browser profile ──────────────────────────────
  const page2 = await openPage(browser);
  // Same mnemonic AND the same storage identity: this is the same app coming
  // back on a new device, not a second wallet. The browser profile is empty
  // either way — it is a fresh context.
  const restored = await bootWallet(page2, f, {
    vss: true,
    mnemonic,
    restore: true,
    runId: boot.runId,
  });
  report('restoreFromVss', restored.restored);
  expect(restored.restored!.walletRestored).toBe(true);
  await wcall(page2, 'syncWallet');

  const restoredNode = await retry(() =>
    wcall<{ pubkey: string }>(page2, 'getNodeInfo')
  );
  expect(
    restoredNode.pubkey,
    'the restored node must BE the old node, not a new one'
  ).toBe(before.pubkey);

  const restoredAssets = await wcall<{ nia?: { assetId: string }[] }>(
    page2,
    'listAssets'
  );
  expect(
    (restoredAssets.nia ?? []).some((a) => a.assetId === assetId),
    'the issued asset must survive the restore'
  ).toBe(true);

  const restoredBalance = await wcall<{ settled?: number }>(
    page2,
    'getAssetBalance',
    assetId
  );
  expect(restoredBalance.settled).toBe(before.assetSettled);

  const restoredTransfers = await wcall<unknown[]>(
    page2,
    'listOnchainTransfers',
    assetId
  );
  const restoredTransactions = await wcall<unknown[]>(
    page2,
    'listTransactions'
  );
  expect(restoredTransfers.length).toBeGreaterThanOrEqual(before.transfers);
  expect(restoredTransactions.length).toBeGreaterThanOrEqual(
    before.transactions
  );

  const restoredBtc = await wcall<BtcBalanceShape>(page2, 'getBtcBalance');
  report('restored balances', {
    btc: restoredBtc.vanilla,
    asset: restoredBalance,
  });
  expect(restoredBtc.vanilla.spendable).toBe(before.btcSpendable);

  // The half that costs money to lose.
  const restoredChannels = await wcall<ChannelShape[]>(page2, 'listChannels');
  report('listChannels (restored)', restoredChannels);
  const restoredChannel = restoredChannels.find(
    (c) => c.channelId === before.channelId
  );
  expect(
    restoredChannel,
    `channel ${before.channelId} missing after restore`
  ).toBeTruthy();
  expect(restoredChannel!.capacitySat).toBe(before.capacitySat);

  // ── a restored channel that cannot be closed is not restored ──────────────
  // The peer's address lives in the old device's peer store, and the relay is
  // outbound-only, so the restored wallet has to dial the Faucet itself.
  const usable = await waitForChannel(
    page2,
    (c) => c.channelId === before.channelId && Boolean(c.isUsable),
    'restored channel never reconnected',
    180_000,
    async () => {
      await wcall(page2, 'connectPeer', peerUri).catch(() => undefined);
    }
  );
  report('restored channel (usable)', usable);

  const btcBeforeClose = await wcall<BtcBalanceShape>(page2, 'getBtcBalance');
  report('btc before close', btcBeforeClose.vanilla);
  await wcall(page2, 'closeChannel', before.channelId, f.FAUCET_PUBKEY, false);

  // Mine, do not fund.
  //
  // This poll used to call `gatewayFund(…, 0.0001, 6)` and then assert that
  // `vanilla.spendable` had merely gone *up* — which it always had, because the
  // funding itself put 0.0001 BTC in the wallet on every iteration. The
  // assertion could not fail, so it never showed whether the channel balance
  // came back at all. `mineBlocks` generates to bitcoind's own address and
  // leaves the wallet alone, and the target below is the channel's own local
  // balance rather than "more than before".
  const expectedBackSat = Math.floor(before.localBalanceMsat / 1000);
  const btcAfterClose = await expect
    .poll(
      async () => {
        await mineBlocks(2).catch(() => undefined);
        await wcall(page2, 'listChannels').catch(() => undefined); // drive beat
        await wcall(page2, 'syncWallet').catch(() => undefined);
        const bal = await wcall<BtcBalanceShape>(page2, 'getBtcBalance');
        const gained = bal.vanilla.future - btcBeforeClose.vanilla.future;
        report('btc after close (polling)', { ...bal.vanilla, gained });
        // Closing costs a fee, so the wallet gets back a little less than the
        // channel held; 90% keeps the check meaningful without pinning a fee.
        return gained >= expectedBackSat * 0.9 ? gained : null;
      },
      {
        timeout: 300_000,
        message:
          'closing the restored channel must return its BTC balance on-chain',
      }
    )
    .not.toBeNull()
    .then(() => wcall<BtcBalanceShape>(page2, 'getBtcBalance'));

  report('btc settled on-chain after close', {
    before: btcBeforeClose.vanilla,
    after: btcAfterClose.vanilla,
    channelLocalSat: expectedBackSat,
  });

  const finalTxs = await wcall<{ txid?: string }[]>(page2, 'listTransactions');
  expect(finalTxs.some((t) => HEX_32.test(String(t.txid ?? '')))).toBe(true);

  // ── H2. an RGB channel closes and settles its asset on-chain ──────────────
  //
  // The channel above carries BTC only, so it exercises just half of the
  // post-close sweep. This opens a second, *coloured* channel — the stack's
  // provisioned asset, which the Faucet owns — moves nothing through it, and
  // closes it. The wasm side must end up holding its channel-local RGB in its
  // own wallet.
  //
  // Before rgb-lightning-node #119 the wasm side had no `Event::SpendableOutputs`
  // handler and no sweep: the closing tx was coloured correctly and the native
  // side recovered its half, while `getAssetBalance` on the wasm side stayed 0
  // forever. This is the assertion that tells the two apart.
  //
  // It must be a REGULAR channel. A virtual one (trusted_no_broadcast, what the
  // LSP hands out) has no funding transaction, so closing it is an `abandon`
  // with nothing to settle — the node refuses it outright while value remains.
  // The Faucet's /openchannel without `virtual_open_mode` opens a regular one.
  await ensureFaucetConnected(page2, peerUri);

  // The Faucet's change from the stack's own seed sends can sit pending until a
  // refresh, and a colour-funded /openchannel then fails with InsufficientAssets.
  let faucetSpendable = 0;
  const faucetDeadline = Date.now() + 60_000;
  while (Date.now() < faucetDeadline) {
    await faucetPost(f, '/refreshtransfers', {
      filter: [],
      skip_sync: false,
    }).catch(() => undefined);
    const fb = await faucetPost<{ spendable?: number }>(f, '/assetbalance', {
      asset_id: f.ASSET_ID,
    }).catch(() => null);
    faucetSpendable = fb?.spendable ?? 0;
    if (faucetSpendable >= RGB_CHANNEL_AMOUNT) break;
    await mineBlocks(1).catch(() => undefined);
    await sleep(2000);
  }
  report('faucet assetbalance (before coloured open)', {
    spendable: faucetSpendable,
    required: RGB_CHANNEL_AMOUNT,
  });

  await faucetPost(f, '/openchannel', {
    peer_pubkey_and_opt_addr: before.pubkey,
    capacity_sat: CAPACITY_SAT,
    push_msat: PUSH_MSAT,
    public: false,
    with_anchors: true,
    asset_id: f.ASSET_ID,
    asset_amount: RGB_CHANNEL_AMOUNT,
    push_asset_amount: RGB_CHANNEL_PUSH,
  });

  const rgbChannel = await waitForChannel(
    page2,
    (c) => c.assetId === f.ASSET_ID && Boolean(c.isUsable),
    'the coloured channel never became usable',
    300_000
  );
  report('rgb channel (open)', rgbChannel);
  const rgbInChannel = Number(rgbChannel.assetLocalAmount ?? 0);
  expect(
    rgbInChannel,
    'the Faucet must push RGB to the wasm side, or there is nothing to settle'
  ).toBeGreaterThan(0);

  const rgbOnchainBefore = await assetBalanceFuture(page2, f.ASSET_ID);
  report('rgb on-chain before close', {
    total: rgbOnchainBefore,
    channelLocal: rgbInChannel,
  });

  await wcall(
    page2,
    'closeChannel',
    rgbChannel.channelId,
    f.FAUCET_PUBKEY,
    false
  );

  // `settled + future`: the swept output counts as `future` until it has
  // confirmations of its own, so `settled` alone fails a sweep that has merely
  // just landed. Blocks matter too — the closing tx must mature past
  // ANTI_REORG_DELAY (6) before SpendableOutputs fires at all.
  const rgbOnchainAfter = await expect
    .poll(
      async () => {
        await mineBlocks(2).catch(() => undefined);
        await wcall(page2, 'listChannels').catch(() => undefined); // drive beat
        await wcall(page2, 'syncWallet').catch(() => undefined);
        await wcall(page2, 'refreshWallet').catch(() => undefined);
        const total = await assetBalanceFuture(page2, f.ASSET_ID);
        report('rgb on-chain after close (polling)', {
          total,
          expected: rgbOnchainBefore + rgbInChannel,
        });
        return total >= rgbOnchainBefore + rgbInChannel ? total : null;
      },
      {
        timeout: 300_000,
        message:
          'after closing the coloured channel the wasm side must hold its RGB ' +
          'share on-chain — 0 means the post-close sweep never ran',
      }
    )
    .not.toBeNull()
    .then(() => assetBalanceFuture(page2, f.ASSET_ID));

  report('rgb settled on-chain after close', {
    before: rgbOnchainBefore,
    after: rgbOnchainAfter,
    channelLocalWas: rgbInChannel,
    balance: await wcall(page2, 'getAssetBalance', f.ASSET_ID).catch(
      () => null
    ),
    transfers: await wcall(page2, 'listOnchainTransfers', f.ASSET_ID).catch(
      () => null
    ),
  });
  expect(rgbOnchainAfter).toBeGreaterThanOrEqual(
    rgbOnchainBefore + rgbInChannel
  );
});
