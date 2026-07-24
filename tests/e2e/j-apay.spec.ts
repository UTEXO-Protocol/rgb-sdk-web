/**
 * Scenario J — APay cart checkout, two wallets (§7a.3). Web port of the demo's
 * ApayCartCheckout.
 *
 * A shopper pays a merchant's Lightning Address for an RGB-priced cart:
 *
 *   merchant  setup → enableLightningAddress → stays warm for the LSP outbox
 *   buyer     setup → receiveAsset (faucet funds it) → payAddress → Succeeded
 *
 * Two wallets, not one, because APay is asynchronous: the buyer pays a HODL
 * invoice minted against one of the merchant's pre-registered hashes, and the
 * LSP's outbox settles it by fetching an invoice from the merchant *later*. A
 * merchant that has stopped being driven is a merchant the outbox cannot reach,
 * so it lives in a second browser context and is polled throughout — including
 * inside the buyer's own wait loops.
 *
 * Unlike the demo, the two sides are not coordinated over BroadcastChannel: the
 * spec owns both pages, so the address is handed over directly and every wait
 * is explicit rather than racing on a message.
 *
 * The claim is the last assertion, not the payment status: a settled HTLC does
 * not prove delivery, so the merchant's channel-local RGB must rise by exactly
 * the cart amount. Every response is field-verified (§7a.2) and reported.
 *
 * Requires utexo-lsp with an RGB channel available (UTEXO_LSP_URL, LSP_PUBKEY).
 *
 * For a real user this is a shop checkout. Two sides, two apps — and the setup
 * up to the LSP channel is identical for both, so it is shown once:
 *
 * ```ts
 * // ── setup, done by BOTH merchant and buyer ────────────────────────────
 * const wallet = new UTEXOWallet({
 *   network: 'utexo',
 *   mnemonic,                       // generateKeys() on first run
 *   password,
 *   lspBaseUrl: 'https://lsp.example',  // lets createLsp() auto-discover
 *   vssUrl: DEFAULT_VSS_SERVER_URL,
 * });
 * await wallet.init();
 * await wallet.unlock();
 *
 * const address = await wallet.getAddress();  // fund this before continuing
 * await wallet.syncWallet();
 * await wallet.createUtxos({ upTo: false, num: 5, feeRate: 7 });
 * //   RGB needs its own UTXOs; skip this and the channel has nowhere to put
 * //   the asset.
 *
 * // No attach step needed — unlock() brought the wallet online and the
 * // Lightning node came with it (see scenario A).
 * const lsp = await wallet.createLsp();   // peer discovered from lspBaseUrl;
 *                                         // pass an LspPeer to skip discovery
 * await lsp.connect();              // the browser always dials out
 *
 * // Ask the LSP for a channel and wait until it can carry the asset. The
 * // browser node has no background processor, so this polls — and the poll is
 * // also what drives it.
 * const channel = await lsp.waitForChannel(assetId, {
 *   timeoutMs: 180_000,
 *   onProgress: (m) => console.log(m),
 * });
 *
 * // ── merchant: publish an address once, then stay reachable ────────────
 * const { address: lnAddress, unusedHashes } = await lsp.enableLightningAddress();
 * //   → alice@domain. Show it, print it on the invoice, put it in a QR code.
 * //   `unusedHashes` is the pool APay draws from; refill it before it empties:
 * if ((unusedHashes ?? 0) < 3) await lsp.refillHashPool();
 * //
 * // The merchant app must keep running. APay settles asynchronously: the LSP
 * // comes back LATER asking the merchant for an invoice, and a closed app is
 * // an unreachable merchant. Keep the session warm and keep polling:
 * setInterval(() => { void lsp.connect().catch(() => {}); }, 15_000);
 * setInterval(() => { void wallet.listChannels(); }, 3_000);   // drive beat
 *
 * // ── buyer: get the asset onto the channel, then pay ───────────────────
 * // The LSP's channel starts with 0 local RGB on the buyer's side, so the
 * // asset has to be deposited first. receiveAsset() returns both invoices:
 * // an LN one for the sats and an RGB one for the asset itself.
 * const { lnInvoice, rgbInvoice } = await lsp.receiveAsset({
 *   assetId, amountSats: 3_000, amountRgb: 1,
 * });
 * // → someone pays lnInvoice / sends the asset to rgbInvoice, then:
 * await lsp.awaitReceiveSettlement(lnInvoice, { timeoutMs: 180_000 });
 *
 * // Sats to route with, as well as the asset:
 * await lsp.waitForOutboundLiquidity(3_000_000, { timeoutMs: 180_000 });
 *
 * // Pay the merchant's Lightning Address.
 * const { invoice, sendResult } = await lsp.payAddress({
 *   address: lnAddress,
 *   amtMsat: 3_000_000,
 *   asset: { assetId, assetAmount: 1 },
 * });
 * //   `invoice` is the HODL invoice the LSP minted against one of the
 * //   merchant's pre-registered hashes — the payment is held, not yet settled.
 *
 * for (;;) {
 *   const st = await wallet.getLightningSendStatus(sendResult.txid);
 *   if (st === 'Succeeded' || st === 'Failed') break;
 *   await sleep(3000);
 * }
 * ```
 *
 * A `Succeeded` status means the HTLC resolved, not that the merchant holds
 * the asset — the delivery to check is the merchant's channel balance rising.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  report,
  expectFields,
  HEX_PUBKEY,
} from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures, gatewayFund } from './fixtures';
import {
  bootWallet,
  wcall,
  lspCreate,
  lspCall,
  fundAndCreateUtxos,
  retry,
  wirePageLogging,
} from './harness-client';

const f = loadFixtures();

/** Cart price. Small on purpose — the LSP's virtual open grants little RGB. */
const CART_ASSET_AMOUNT = 1;
const CART_MSAT = 3_000_000;

const CHANNEL_TIMEOUT_MS = 180_000;
const SETTLE_TIMEOUT_MS = 180_000;
const POLL_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ChannelShape {
  channelId: string;
  peerPubkey: string;
  assetId?: string;
  assetLocalAmount?: number;
  ready: boolean;
  isUsable?: boolean;
  capacitySat: number;
  outboundBalanceMsat?: number;
}

/** Channel-local RGB on the LSP channel — the number that must move. */
async function lspChannelRgb(page: Page): Promise<number> {
  const channels = await wcall<ChannelShape[]>(page, 'listChannels');
  const chan = channels.find(
    (c) => c.assetId === f.ASSET_ID && c.peerPubkey === f.LSP_PUBKEY
  );
  return Number(chan?.assetLocalAmount ?? 0);
}

/** POST to the faucet RLN's REST API (it plays the external on-chain sender). */
async function faucetPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${f.FAUCET_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(
      `faucet ${path} → HTTP ${r.status}: ${await r.text().catch(() => '')}`
    );
  }
  return (await r.json().catch(() => ({}))) as T;
}

/**
 * Reconnect only when the session is actually down.
 *
 * Dialling a peer that is already connected does not no-op — it hangs until the
 * handshake times out, which is how a second run in one session fails.
 */
async function ensureLspConnected(page: Page): Promise<void> {
  const peers = await wcall<{ pubkey: string; isConnected?: boolean }[]>(
    page,
    'listPeers'
  ).catch(() => []);
  if (peers.some((p) => p.pubkey === f.LSP_PUBKEY && p.isConnected !== false))
    return;
  await lspCall(page, 'connect');
}

/** Wallet → funded → utxos → LN node → LSP channel usable. Both roles share it. */
async function setupRole(
  page: Page,
  role: 'merchant' | 'buyer'
): Promise<string> {
  wirePageLogging(page);
  const boot = await bootWallet(page, f);
  report(`${role}: boot`, boot);
  expect(boot.online).toBe(true);

  const address = await wcall<string>(page, 'getAddress');
  await fundAndCreateUtxos(page, f, address, 10);
  report(`${role}: getAddress`, { address });
  report(`${role}: getBtcBalance`, await wcall(page, 'getBtcBalance'));
  report(`${role}: listUnspents`, await wcall(page, 'listUnspents'));

  report(`${role}: getNodeInfo`, await wcall(page, 'getNodeInfo'));
  report(`${role}: getNetworkInfo`, await wcall(page, 'getNetworkInfo'));

  report(
    `${role}: lspCreate`,
    await lspCreate(page, {
      // Through the harness vite proxy, not f.UTEXO_LSP_URL: utexo-lsp sends no
      // CORS headers and the gateway's allowlist does not cover it, so a direct
      // call dies on /get_info. The demo does the same via VITE_LSP_BASE_URL.
      baseUrl: '/lsp',
      peerPubkey: f.LSP_PUBKEY,
      peerHost: '127.0.0.1',
      peerPort: f.LSP_PEER_PORT,
    })
  );
  await retry(() => lspCall(page, 'connect'));
  report(`${role}: listPeers`, await wcall(page, 'listPeers'));

  // waitForChannel's onEachPoll would be a function, so it cannot cross into
  // the page — mine from here between attempts instead.
  const deadline = Date.now() + CHANNEL_TIMEOUT_MS;
  let chan: ChannelShape | undefined;
  while (Date.now() < deadline) {
    await gatewayFund(f, address, 0.001, 1).catch(() => undefined);
    const channels = await wcall<ChannelShape[]>(page, 'listChannels');
    chan = channels.find((c) => c.assetId === f.ASSET_ID && c.isUsable);
    if (chan) break;
    await sleep(POLL_MS);
  }
  if (!chan) throw new Error(`${role}: no usable RGB channel from the LSP`);
  // The whole row, not a summary: which of capacity / balances / asset amounts
  // moved is exactly what one wants when this scenario misbehaves.
  report(`${role}: listChannels (RGB channel usable)`, chan);
  expectFields(chan, {
    channelId: { type: 'string', nonEmpty: true },
    peerPubkey: { type: 'string', pattern: HEX_PUBKEY },
    capacitySat: { type: 'number', min: 1 },
    ready: { type: 'boolean' },
    isUsable: { type: 'boolean', optional: true },
    assetId: { type: 'string', nonEmpty: true, optional: true },
    assetLocalAmount: { type: 'number', optional: true },
    outboundBalanceMsat: { type: 'number', optional: true },
    inboundBalanceMsat: { type: 'number', optional: true },
    localBalanceMsat: { type: 'number', optional: true },
  });
  return address;
}

test('J: buyer pays a merchant Lightning Address and the RGB asset moves', async ({
  browser,
}) => {
  test.setTimeout(900_000);

  // Separate contexts, not tabs: each wallet gets its own IndexedDB, so the two
  // wasm nodes cannot share storage the way two tabs of one profile would.
  const merchantCtx = await browser.newContext();
  const buyerCtx = await browser.newContext();
  const merchant = await merchantCtx.newPage();
  const buyer = await buyerCtx.newPage();

  try {
    // ── 1. both wallets reach a usable RGB channel ──────────────────────────
    const merchantAddr = await setupRole(merchant, 'merchant');
    const buyerAddr = await setupRole(buyer, 'buyer');

    // ── 2. merchant publishes its Lightning Address ─────────────────────────
    await ensureLspConnected(merchant);
    const lnAddr = await lspCall<{ address: string; unusedHashes?: number }>(
      merchant,
      'enableLightningAddress'
    );
    report('merchant: lsp.enableLightningAddress', lnAddr);
    expectFields(lnAddr, {
      address: { type: 'string', nonEmpty: true },
      unusedHashes: { type: 'number', min: 0, optional: true },
    });
    expect(lnAddr.address).toContain('@');

    const merchantRgb0 = await lspChannelRgb(merchant);
    report('merchant: channel baseline', {
      assetLocalAmount: merchantRgb0,
      channels: await wcall(merchant, 'listChannels'),
    });

    // ── 3. buyer tops up: the LSP's virtual open leaves it 0 local RGB ──────
    const topup = await lspCall<{ lnInvoice: string; rgbInvoice: string }>(
      buyer,
      'receiveAsset',
      {
        assetId: f.ASSET_ID,
        amountSats: CART_MSAT / 1000,
        amountRgb: CART_ASSET_AMOUNT,
      }
    );
    report('buyer: lsp.receiveAsset', topup);
    expectFields(topup, {
      lnInvoice: { type: 'string', nonEmpty: true },
      rgbInvoice: { type: 'string', nonEmpty: true },
    });
    // The LN invoice must decode back to what was asked for — a top-up that
    // silently priced itself differently would otherwise pass unnoticed.
    report(
      'buyer: decodeLnInvoice (top-up)',
      await wcall(buyer, 'decodeLnInvoice', topup.lnInvoice)
    );
    // decodeRGBInvoice takes `{ invoice }`, decodeLnInvoice takes a bare
    // string — the two are not symmetric.
    report(
      'buyer: decodeRGBInvoice (top-up)',
      await wcall(buyer, 'decodeRGBInvoice', { invoice: topup.rgbInvoice })
    );

    // The faucet plays the external sender that funds the top-up on-chain.
    const decoded = await faucetPost<{
      recipient_id: string;
      transport_endpoints?: string[];
      assignment?: { type: string; value: number };
    }>('/decodergbinvoice', { invoice: topup.rgbInvoice });
    report('faucet: decodergbinvoice', decoded);
    expect(decoded.recipient_id).toBeTruthy();

    // A blinded receive can carry `Fungible { value: 0 }` — "any amount". The
    // send has to name a real one, so fall back to the cart amount.
    const assignment =
      decoded.assignment?.type === 'Fungible' &&
      (decoded.assignment?.value ?? 0) > 0
        ? decoded.assignment
        : { type: 'Fungible', value: CART_ASSET_AMOUNT };

    // The faucet's change from the stack's seed sends can sit pending until a
    // refresh, and /sendrgb then 403s with InsufficientAssets.
    const faucetDeadline = Date.now() + 60_000;
    let faucetSpendable = 0;
    while (Date.now() < faucetDeadline) {
      await faucetPost('/refreshtransfers', {
        filter: [],
        skip_sync: false,
      }).catch(() => undefined);
      const fb = await faucetPost<{ spendable?: number }>('/assetbalance', {
        asset_id: f.ASSET_ID,
      }).catch(() => null);
      faucetSpendable = fb?.spendable ?? 0;
      if (faucetSpendable >= assignment.value) break;
      await gatewayFund(f, buyerAddr, 0.001, 1).catch(() => undefined);
      await sleep(2000);
    }
    report('faucet: assetbalance', {
      spendable: faucetSpendable,
      required: assignment.value,
    });

    // recipient_map keyed by asset id — not flat recipient_id/amount fields.
    // Transport endpoints come from the decoded invoice (an `rpc://` proxy
    // URL), which is not the same thing as the gateway's TRANSPORT_URL.
    const sendBody = {
      donation: false,
      fee_rate: 7,
      min_confirmations: 1,
      skip_sync: false,
      recipient_map: {
        [f.ASSET_ID]: [
          {
            recipient_id: decoded.recipient_id,
            assignment,
            transport_endpoints: decoded.transport_endpoints ?? [
              'rpc://127.0.0.1:3000/json-rpc',
            ],
          },
        ],
      },
    };
    report('faucet: sendrgb (request)', sendBody);
    report('faucet: sendrgb', await faucetPost('/sendrgb', sendBody));

    // 3a. The faucet's Send must settle on-chain first. Matched by
    // recipient_id: the list also holds the stack's own seed sends, so "any
    // settled Send" is a false positive. Asserting this separately is what
    // makes a top-up failure say whether the chain leg or the LSP leg broke.
    const onchainDeadline = Date.now() + SETTLE_TIMEOUT_MS;
    let onchainStatus = 'none';
    while (Date.now() < onchainDeadline) {
      await gatewayFund(f, buyerAddr, 0.001, 1).catch(() => undefined);
      await wcall(merchant, 'listChannels').catch(() => undefined); // keep warm
      await sleep(POLL_MS);
      await faucetPost('/refreshtransfers', {
        filter: [],
        skip_sync: false,
      }).catch(() => undefined);
      const lt = await faucetPost<{
        transfers?: { status?: string; recipient_id?: string }[];
      }>('/listtransfers', { asset_id: f.ASSET_ID }).catch(() => ({}));
      const send = (lt.transfers ?? []).find(
        (t) => t.recipient_id === decoded.recipient_id
      );
      onchainStatus = send?.status ?? 'none';
      if (onchainStatus === 'Failed') break;
      if (onchainStatus === 'Settled') break;
    }
    report('faucet: on-chain transfer', {
      recipientId: decoded.recipient_id,
      status: onchainStatus,
    });
    expect(onchainStatus, 'the faucet RGB send must settle on-chain').toBe(
      'Settled'
    );

    // 3b. …then the LSP credits it to the buyer's channel.
    const topupDeadline = Date.now() + SETTLE_TIMEOUT_MS;
    let topupSettled = false;
    while (Date.now() < topupDeadline) {
      await gatewayFund(f, buyerAddr, 0.001, 1).catch(() => undefined);
      await wcall(merchant, 'listChannels').catch(() => undefined); // keep warm
      await sleep(POLL_MS);
      const rgb = await lspChannelRgb(buyer);
      const invoiceStatus = await wcall(
        buyer,
        'getLightningReceiveStatus',
        topup.lnInvoice
      ).catch(() => null);
      report('buyer: top-up progress', {
        assetLocalAmount: rgb,
        invoiceStatus,
      });
      if (rgb >= CART_ASSET_AMOUNT) {
        topupSettled = true;
        report('buyer: top-up settled', {
          assetLocalAmount: rgb,
          invoiceStatus,
          channels: await wcall(buyer, 'listChannels'),
          assets: await wcall(buyer, 'listAssets').catch(() => null),
        });
        break;
      }
    }
    expect(
      topupSettled,
      'the buyer top-up must credit RGB on the LSP channel'
    ).toBe(true);

    // ── 4. buyer needs outbound sats as well as the asset ───────────────────
    const liqDeadline = Date.now() + SETTLE_TIMEOUT_MS;
    let outbound = 0;
    while (Date.now() < liqDeadline) {
      const channels = await wcall<ChannelShape[]>(buyer, 'listChannels');
      const chan = channels.find((c) => c.assetId === f.ASSET_ID);
      outbound = Number(chan?.outboundBalanceMsat ?? 0);
      if (outbound >= CART_MSAT) break;
      await gatewayFund(f, buyerAddr, 0.001, 1).catch(() => undefined);
      await sleep(POLL_MS);
    }
    report('buyer: outbound liquidity', {
      outboundBalanceMsat: outbound,
      requiredMsat: CART_MSAT,
      channels: await wcall(buyer, 'listChannels'),
    });
    expect(outbound).toBeGreaterThanOrEqual(CART_MSAT);

    // ── 5. pay the cart ─────────────────────────────────────────────────────
    await ensureLspConnected(buyer);
    const paid = await lspCall<{
      invoice?: string;
      sendResult: { txid?: string; status?: string };
    }>(buyer, 'payAddress', {
      address: lnAddr.address,
      amtMsat: CART_MSAT,
      asset: { assetId: f.ASSET_ID, assetAmount: CART_ASSET_AMOUNT },
    });
    report('buyer: lsp.payAddress', paid);
    expect(paid.invoice, 'payAddress must mint a HODL invoice').toBeTruthy();
    const paymentHash = String(paid.sendResult.txid ?? '');
    expect(paymentHash).toBeTruthy();
    expect(String(paid.sendResult.status ?? '').toLowerCase()).not.toBe(
      'failed'
    );
    // Decode the HODL invoice the LSP minted: it must carry the cart's amount
    // and the merchant's hash, which is what ties this payment to the address.
    report(
      'buyer: decodeLnInvoice (HODL)',
      await wcall(buyer, 'decodeLnInvoice', paid.invoice).catch(() => null)
    );

    // ── 6. the LSP outbox settles it — merchant must stay reachable ─────────
    // Driving the merchant inside this loop is not decoration: the outbox calls
    // back to fetch an invoice, and a merchant that is not being polled is a
    // merchant whose wasm node is not processing anything.
    const settleDeadline = Date.now() + SETTLE_TIMEOUT_MS;
    let status: string | null = 'Pending';
    while (Date.now() < settleDeadline) {
      await gatewayFund(f, buyerAddr, 0.001, 1).catch(() => undefined);
      await wcall(merchant, 'listChannels').catch(() => undefined);
      await sleep(POLL_MS);
      status = await wcall<string | null>(
        buyer,
        'getLightningSendStatus',
        paymentHash
      );
      report('buyer: getLightningSendStatus', {
        paymentHash,
        status,
        buyerRgb: await lspChannelRgb(buyer),
        merchantRgb: await lspChannelRgb(merchant),
      });
      if (status === 'Succeeded' || status === 'Failed') break;
    }
    expect(
      status,
      'the buyer payment must settle, not merely stop failing'
    ).toBe('Succeeded');
    report('buyer: getPayment', await wcall(buyer, 'getPayment', paymentHash));
    report('buyer: listPayments', await wcall(buyer, 'listPayments'));

    // ── 7. the claim: the merchant actually received the asset ──────────────
    // A settled HTLC is not the same as a delivered asset — this is the check
    // that separates the two.
    const merchantRgb1 = await expect
      .poll(
        async () => {
          await gatewayFund(f, merchantAddr, 0.001, 1).catch(() => undefined);
          const rgb = await lspChannelRgb(merchant);
          return rgb > merchantRgb0 ? rgb : null;
        },
        {
          timeout: SETTLE_TIMEOUT_MS,
          message: "the merchant's channel RGB must rise after the payment",
        }
      )
      .not.toBeNull()
      .then(() => lspChannelRgb(merchant));

    report('merchant: channel RGB after payment', {
      before: merchantRgb0,
      after: merchantRgb1,
      delta: merchantRgb1 - merchantRgb0,
      expectedDelta: CART_ASSET_AMOUNT,
    });
    report(
      'merchant: listChannels (final)',
      await wcall(merchant, 'listChannels')
    );
    report(
      'merchant: listPayments (final)',
      await wcall(merchant, 'listPayments')
    );
    report('buyer: listChannels (final)', await wcall(buyer, 'listChannels'));
    expect(merchantRgb1 - merchantRgb0).toBe(CART_ASSET_AMOUNT);

    // No close-and-settle phase here, deliberately. The LSP opens **virtual**
    // channels (trusted_no_broadcast), which have no funding transaction — so
    // closing one is an `abandon`, not a close, and nothing can settle
    // on-chain. The node refuses it outright while value remains:
    // "virtual cleanup blocked: N RGB units remain on the channel — drain them
    // to the LSP first" (`ln_node.rs::ensure_virtual_cleanup_client_no_local_value`).
    // Post-close on-chain settlement belongs on a REGULAR channel — scenario H.
  } finally {
    await merchantCtx.close();
    await buyerCtx.close();
  }
});
