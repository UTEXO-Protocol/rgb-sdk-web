/**
 * Scenario C — RGB assets (§7a.3).
 *
 * issueAssetNia → listAssets → getAssetBalance → onchainReceive (witness AND
 * blinded) → decodeRGBInvoice → listOnchainTransfers. Each invoice must decode
 * back to the same assetId, the two receive variants must produce different
 * recipients, and transfer statuses and kinds must be in the canonical
 * vocabulary.
 *
 * For a real user this is issuing an asset and being paid one on-chain:
 *
 * ```ts
 * // Issue (needs colourable UTXOs — see scenario B)
 * const asset = await wallet.issueAssetNia({
 *   ticker: 'TICK', name: 'My asset', precision: 0, amounts: [1000],
 * });
 * await wallet.listAssets();                    // { nia, cfa, uda, ifa }
 * await wallet.getAssetBalance(asset.assetId);  // settled / future / spendable
 *
 * // Receive: hand the payer an invoice.
 * const inv = await wallet.onchainReceive({
 *   assetId: asset.assetId,
 *   amount: 10,
 *   durationSeconds: 86400,
 *   witness: true,      // default. false → a blinded receive
 * });
 * // → give inv.invoice to the sender
 *
 * // Send: pay someone else's invoice.
 * await wallet.onchainSend({
 *   invoice: theirInvoice,
 *   feeRate: 7,
 *   // witnessData is REQUIRED when paying a witness invoice, omitted for a
 *   // blinded one — which is why an app has to know which kind it was handed.
 * });
 *
 * // Either way the result shows up as a transfer. Poll until it settles:
 * await wallet.refreshWallet();
 * const transfers = await wallet.listOnchainTransfers(asset.assetId);
 * //   t.status: Settled | WaitingConfirmations | WaitingCounterparty | Failed
 * ```
 *
 * Witness vs blinded is the payer-visible difference: a **witness** receive is
 * paid to a fresh output the sender creates, a **blinded** one hides the UTXO
 * being paid to behind a blinding factor. `onchainReceive({ witness })` picks
 * between them; the older `blindReceive` / `witnessReceive` are what it
 * dispatches to and are better left alone in new code.
 *
 * `transportEndpoints` is not optional plumbing: RGB consignments travel
 * off-chain, so a payer with no reachable endpoint cannot deliver the asset
 * even after the bitcoin transaction confirms.
 */
import { test, expect } from '@playwright/test';
import {
  report,
  expectFields,
  expectEach,
  expectNoWireKeys,
  HEX_32,
} from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures, mineBlocks } from './fixtures';
import {
  bootWallet,
  wcall,
  fundAndCreateUtxos,
  wirePageLogging,
} from './harness-client';

const f = loadFixtures();

const TRANSFER_STATUSES = [
  'WaitingCounterparty',
  'WaitingSafeHeight',
  'WaitingConfirmations',
  'Settled',
  'Failed',
  'Initiated',
] as const;
const TRANSFER_KINDS = [
  'Issuance',
  'ReceiveBlind',
  'ReceiveWitness',
  'Send',
  'Inflation',
  'Burn',
] as const;

/** Per-variation payment in the onchainSend test. */
const SEND_AMOUNT = 5;

test('C: issue NIA, balances, onchainReceive (witness + blinded), decode, transfers', async ({
  page,
}) => {
  wirePageLogging(page);
  await bootWallet(page, f);
  const address = await wcall<string>(page, 'getAddress');
  await fundAndCreateUtxos(page, f, address);

  const issued = await wcall<Record<string, unknown>>(page, 'issueAssetNia', {
    ticker: 'E2ET',
    name: 'E2E Test Asset',
    precision: 0,
    amounts: [1000],
  });
  report('issueAssetNia', issued);
  expectFields(issued, {
    'assetId': { type: 'string', nonEmpty: true },
    'ticker': { oneOf: ['E2ET'] },
    'name': { oneOf: ['E2E Test Asset'] },
    'precision': { oneOf: [0] },
    'issuedSupply': { type: 'number', min: 1000, max: 1000 },
    'balance.settled': { type: 'number' },
    'balance.future': { type: 'number' },
    'balance.spendable': { type: 'number' },
  });
  expectNoWireKeys(issued);
  const assetId = issued.assetId as string;

  await wcall(page, 'syncWallet').catch(() => undefined);
  await wcall(page, 'refreshWallet').catch(() => undefined);
  const assets = await wcall<{ nia?: Record<string, unknown>[] }>(
    page,
    'listAssets'
  );
  report('listAssets (nia count)', assets.nia?.length);
  const listed = (assets.nia ?? []).find((a) => a.assetId === assetId);
  expect(
    listed,
    `issued asset ${assetId} must appear in listAssets`
  ).toBeTruthy();

  const balance = await wcall<Record<string, unknown>>(
    page,
    'getAssetBalance',
    assetId
  );
  report('getAssetBalance', balance);
  expectFields(balance, {
    settled: { type: 'number', optional: true },
    future: { type: 'number', optional: true },
    spendable: { type: 'number', optional: true },
  });
  // `future` is the projected TOTAL balance, not a pending delta — a fresh
  // issuance reports settled = future = spendable = issuedSupply.
  expect(balance.settled, 'issued supply must be settled').toBe(1000);

  // `onchainReceive` is the canonical entry point (RN-parity name); the older
  // `blindReceive` / `witnessReceive` are what it dispatches to. Both variants
  // are exercised here because they produce different invoices and are paid
  // differently: a witness invoice needs `witnessData` on the send, a blinded
  // one does not.
  const receives: Record<string, Record<string, unknown>> = {};
  for (const [label, witness] of [
    ['witness (default)', true],
    ['blinded', false],
  ] as const) {
    const receive = await wcall<Record<string, unknown>>(
      page,
      'onchainReceive',
      {
        assetId,
        amount: 1,
        minConfirmations: 1,
        durationSeconds: 3600,
        witness,
      }
    );
    report(`onchainReceive — ${label}`, receive);
    expectFields(receive, {
      invoice: { type: 'string', nonEmpty: true },
      recipientId: { type: 'string', nonEmpty: true },
      batchTransferIdx: { type: 'number' },
      expirationTimestamp: { type: 'number', optional: true },
    });
    expectNoWireKeys(receive);

    const decoded = await wcall<Record<string, unknown>>(
      page,
      'decodeRGBInvoice',
      { invoice: receive.invoice }
    );
    report(`decodeRGBInvoice — ${label}`, decoded);
    expectFields(decoded, {
      recipientId: { type: 'string', nonEmpty: true },
      assetId: { type: 'string', optional: true },
      network: {
        oneOf: ['mainnet', 'testnet', 'testnet4', 'regtest', 'signet', 'utexo'],
      },
      transportEndpoints: { type: 'array', nonEmpty: true },
    });
    expect(
      decoded.assetId,
      'invoice must decode back to the same assetId'
    ).toBe(assetId);
    expect(decoded.recipientId).toBe(receive.recipientId);
    expectNoWireKeys(decoded);
    receives[witness ? 'witness' : 'blind'] = receive;
  }

  // The two must be genuinely different recipients, not the same call twice —
  // `witness: false` is the only thing that separates them, and a dispatch that
  // ignored it would otherwise pass every check above.
  expect(
    receives.witness.recipientId,
    'witness and blinded receives must produce different recipients'
  ).not.toBe(receives.blind.recipientId);

  // `listOnchainTransfers` over `listTransfers`: same data, but it is the name
  // that belongs to the on-chain family (`onchainReceive` / `onchainSend`),
  // and the one both platforms carry on the shared contract.
  const transfers = await wcall<Record<string, unknown>[]>(
    page,
    'listOnchainTransfers',
    assetId
  );
  report('listOnchainTransfers', transfers);
  expect(transfers.length).toBeGreaterThan(0);
  expectEach(transfers, {
    idx: { type: 'number' },
    createdAt: { type: 'number', min: 1 },
    updatedAt: { type: 'number', min: 1 },
    status: { oneOf: TRANSFER_STATUSES },
    kind: { oneOf: TRANSFER_KINDS },
  });
  for (const t of transfers) expectNoWireKeys(t);
  expect(
    transfers.some((t) => t.kind === 'Issuance'),
    'the issuance transfer must be listed'
  ).toBe(true);
});

test('C: issueAssetIfa issues a real IFA, not a CFA in disguise', async ({
  page,
}) => {
  wirePageLogging(page);
  await bootWallet(page, f);
  const address = await wcall<string>(page, 'getAddress');
  await fundAndCreateUtxos(page, f, address);

  const issued = await wcall<Record<string, unknown>>(page, 'issueAssetIfa', {
    ticker: 'E2EI',
    name: 'E2E Inflatable',
    precision: 0,
    amounts: [500],
    inflationAmounts: [500],
    rejectListUrl: null,
  });
  report('issueAssetIfa', issued);
  // IFA models supply as initial/max/known-circulating — a CFA has none of
  // these, and `maxSupply` is the field that proves the inflation rights were
  // actually requested rather than dropped.
  expectFields(issued, {
    assetId: { type: 'string', nonEmpty: true },
    ticker: { oneOf: ['E2EI'] },
    name: { oneOf: ['E2E Inflatable'] },
    precision: { oneOf: [0] },
    initialSupply: { type: 'number', min: 500, max: 500 },
    maxSupply: { type: 'number', min: 1000, max: 1000 },
    knownCirculatingSupply: { type: 'number', min: 500, max: 500 },
  });
  expectNoWireKeys(issued);

  // The same asset through the other call — rn's scenario D makes exactly this
  // cross-check, and it is what pins a mapper that silently drops a schema.
});

/**
 * Known gap, not an SDK bug: an IFA issued through the node is invisible to
 * `listAssets()` on web, while a NIA issued the same way (also via the node
 * handle) shows up immediately. `syncWallet` + `refreshWallet` do not surface
 * it, and every schema array comes back empty. The SDK side is correct —
 * `listAssetsJson(['Nia','Ifa'])` asks for IFA and the mapper reads `r.ifa` —
 * so this needs an answer from rgb-lib/wasm before the check can be written.
 * rn has no such gap: scenario D cross-checks issuance against listAssets.ifa.
 */
test.fixme('C: an issued IFA appears in listAssets (upstream gap)', async ({
  page,
}) => {
  wirePageLogging(page);
  await bootWallet(page, f);
  const address = await wcall<string>(page, 'getAddress');
  await fundAndCreateUtxos(page, f, address);
  const issued = await wcall<Record<string, unknown>>(page, 'issueAssetIfa', {
    ticker: 'E2EI',
    name: 'E2E Inflatable',
    precision: 0,
    amounts: [500],
    inflationAmounts: [500],
    rejectListUrl: null,
  });
  const assets = await wcall<{ ifa?: Record<string, unknown>[] }>(
    page,
    'listAssets'
  );
  report('listAssets (ifa)', assets.ifa);
  expect((assets.ifa ?? []).some((a) => a.assetId === issued.assetId)).toBe(
    true
  );
});

/**
 * `onchainSend` across the shapes an app actually meets.
 *
 * Sending needs a counterparty, so this runs two wallets in two browser
 * contexts: the sender issues an asset, the receiver hands back invoices, and
 * each variation is paid in turn.
 *
 * The three differ in ways that are easy to get wrong and impossible to notice
 * from a single happy path:
 *
 *   blinded             the recipient hides which UTXO is being paid; the
 *                       sender passes no `witnessData`
 *   witness             the sender creates a fresh output for the recipient,
 *                       so `witnessData.amountSat` is REQUIRED — omit it and
 *                       the send fails
 *   donation: true      no consignment is delivered back to the sender and the
 *                       recipient cannot refuse; `false` (the default) is the
 *                       ordinary two-sided transfer
 *
 * ```ts
 * // The recipient's invoice is usually BLANK — it cannot name an asset it has
 * // never held — so the payer supplies assetId and amount:
 * const inv = await theirWallet.onchainReceive({ durationSeconds: 3600 });
 *
 * // blinded — nothing extra
 * await wallet.onchainSend({ invoice: inv.invoice, assetId, amount: 5, feeRate: 7 });
 *
 * // witness — the sat value of the output being created
 * await wallet.onchainSend({
 *   invoice: inv.invoice, assetId, amount: 5, feeRate: 7,
 *   witnessData: { amountSat: 1000 },
 * });
 *
 * // donation — fire and forget, the recipient has no say
 * await wallet.onchainSend({
 *   invoice: inv.invoice, assetId, amount: 5, feeRate: 7, donation: true,
 * });
 * ```
 */
test('C: onchainSend pays blinded, witness and donation invoices', async ({
  browser,
}) => {
  test.setTimeout(600_000);

  const senderCtx = await browser.newContext();
  const receiverCtx = await browser.newContext();
  const sender = await senderCtx.newPage();
  const receiver = await receiverCtx.newPage();

  try {
    wirePageLogging(sender);
    wirePageLogging(receiver);
    await bootWallet(sender, f);
    await bootWallet(receiver, f);

    const senderAddr = await wcall<string>(sender, 'getAddress');
    const receiverAddr = await wcall<string>(receiver, 'getAddress');
    // Both sides need colourable UTXOs: the sender to hold and split the asset,
    // the receiver to have somewhere for a blinded receive to point at.
    await fundAndCreateUtxos(sender, f, senderAddr, 8);
    await fundAndCreateUtxos(receiver, f, receiverAddr, 8);

    const issued = await wcall<{ assetId: string }>(sender, 'issueAssetNia', {
      ticker: 'E2ES',
      name: 'E2E Send Asset',
      precision: 0,
      amounts: [1000],
    });
    const assetId = issued.assetId;
    report('sender: issueAssetNia', issued);

    const variations = [
      { label: 'blinded', witness: false, donation: false },
      { label: 'witness', witness: true, donation: false },
      { label: 'donation', witness: false, donation: true },
    ] as const;

    for (const v of variations) {
      // A BLANK invoice — no assetId, no amount. The receiver has never seen
      // this asset, and naming one it does not know fails with "Asset with id
      // … not found". Leaving both out is the ordinary RGB pattern: the payer
      // names the asset and the amount on the send.
      //
      // (The LSP path in scenario J looks like it contradicts this, but the
      // rgbInvoice there is minted by the LSP over HTTP, not by the receiving
      // wallet's rgb-lib — so it can name an asset the receiver has never held.)
      const inv = await wcall<{ invoice: string; recipientId: string }>(
        receiver,
        'onchainReceive',
        { minConfirmations: 1, durationSeconds: 3600, witness: v.witness }
      );
      report(`receiver: onchainReceive — ${v.label}`, inv);

      const sent = await wcall<Record<string, unknown>>(sender, 'onchainSend', {
        invoice: inv.invoice,
        feeRate: 7,
        donation: v.donation,
        // Required for a witness invoice — the sat value of the output the
        // sender is creating. Meaningless (and omitted) for a blinded one.
        ...(v.witness ? { witnessData: { amountSat: 1000 } } : {}),
      });
      report(`sender: onchainSend — ${v.label}`, sent);
      expectFields(sent, { txid: { type: 'string', pattern: HEX_32 } });
      expectNoWireKeys(sent);

      // Let it progress before the next variation spends the change: an RGB
      // transfer still WaitingCounterparty holds the allocation it is spending.
      await expect
        .poll(
          async () => {
            await mineBlocks(1).catch(() => undefined);
            await wcall(sender, 'refreshWallet').catch(() => undefined);
            await wcall(receiver, 'refreshWallet').catch(() => undefined);
            const ts = await wcall<{ txid?: string; status?: string }[]>(
              sender,
              'listOnchainTransfers',
              assetId
            );
            const mine = ts.find((t) => t.txid === sent.txid);
            report(`sender: transfer — ${v.label}`, mine ?? null);
            return mine?.status === 'Settled' ||
              mine?.status === 'WaitingConfirmations'
              ? mine.status
              : null;
          },
          {
            timeout: 180_000,
            message: `the ${v.label} send must leave WaitingCounterparty`,
          }
        )
        .not.toBeNull();
    }

    // The receiver ends up holding all three payments.
    const received = await expect
      .poll(
        async () => {
          await mineBlocks(1).catch(() => undefined);
          await wcall(receiver, 'refreshWallet').catch(() => undefined);
          const bal = await wcall<{ future?: number } | null>(
            receiver,
            'getAssetBalance',
            assetId
          ).catch(() => null);
          const total = Number(bal?.future ?? 0);
          report('receiver: getAssetBalance', { future: total });
          return total >= SEND_AMOUNT * variations.length ? total : null;
        },
        {
          timeout: 300_000,
          message: 'the receiver must end up holding all three payments',
        }
      )
      .not.toBeNull()
      .then(() =>
        wcall<{ future?: number }>(receiver, 'getAssetBalance', assetId)
      );

    report('receiver: final balance', received);
    report(
      'receiver: listOnchainTransfers',
      await wcall(receiver, 'listOnchainTransfers', assetId)
    );
  } finally {
    await senderCtx.close();
    await receiverCtx.close();
  }
});
