/**
 * Raw capture (ADR-0002 step 0). Two wallets run the main L1 flows against the
 * regtest stand while the harness records every WasmWallet result before
 * RgbLibWeb decodes it. The records become tests/fixtures/rgb-lib-wasm-*.
 *
 * Run: npm run capture:fixtures (needs the stand, tests/e2e/README.md).
 */
import { test, expect } from '@playwright/test';
import { STAND, mine } from '../stand.mjs';
import {
  bootWallet,
  fundAndCreateUtxos,
  settle,
  wcall,
  wcallError,
  wirePageLogging,
} from '../client.mjs';
import { writeFixtures } from './write-fixtures.mjs';

const label = (page, name) =>
  page.evaluate((n) => window.harness.label(n), name);
const take = async (page, who) =>
  JSON.parse(await page.evaluate(() => window.harness.takeCapture())).map(
    (r) => ({ ...r, label: `${who}: ${r.label}` })
  );

test('capture raw rgb-lib-wasm values', async ({ browser }) => {
  const capturedAt = Date.now();
  const contexts = [await browser.newContext(), await browser.newContext()];
  const [s, r] = await Promise.all(contexts.map((c) => c.newPage()));
  wirePageLogging(s);
  wirePageLogging(r);
  const records = [];
  try {
    await bootWallet(s, { capture: true });
    await bootWallet(r, { capture: true });

    await label(s, 'empty wallet');
    await wcall(s, 'getAddress');
    await wcall(s, 'getBtcBalance');
    await wcall(s, 'listUnspents');
    await wcall(s, 'listTransactions');
    await wcall(s, 'listAssets');
    await wcallError(s, 'getAssetBalance', 'rgb:unknown-asset');
    await wcallError(s, 'estimateFeeRate', 1).catch(() => undefined);

    await label(s, 'funded, colorable UTXOs');
    await fundAndCreateUtxos(s, 8);
    await wcall(s, 'getBtcBalance');
    await wcall(s, 'listUnspents');
    await wcall(s, 'listTransactions');
    await wcall(s, 'estimateFeeRate', 1).catch(() => undefined);

    await label(s, 'issue NIA');
    const nia = await wcall(s, 'issueAssetNia', {
      ticker: 'CAPN',
      name: 'Capture NIA',
      precision: 2,
      amounts: [1000, 500],
    });
    await label(s, 'issue IFA');
    const ifa = await wcall(s, 'issueAssetIfa', {
      ticker: 'CAPI',
      name: 'Capture IFA',
      precision: 0,
      amounts: [500],
      inflationAmounts: [500],
      rejectListUrl: null,
    });
    await label(s, 'inflate IFA');
    await wcall(s, 'inflate', {
      assetId: ifa.assetId,
      inflationAmounts: [200],
      feeRate: 2,
    });
    await label(s, 'with NIA and IFA');
    await wcall(s, 'listAssets');
    await wcall(s, 'getAssetBalance', nia.assetId);
    await wcall(s, 'listUnspents');

    await label(r, 'funded receiver');
    await fundAndCreateUtxos(r, 8);

    await label(r, 'blank blinded invoice');
    const blind = await wcall(r, 'onchainReceive', {
      minConfirmations: 1,
      durationSeconds: 3600,
      witness: false,
    });
    await wcall(r, 'decodeRGBInvoice', { invoice: blind.invoice });
    await label(r, 'blank witness invoice');
    const witness = await wcall(r, 'onchainReceive', {
      minConfirmations: 1,
      durationSeconds: 3600,
      witness: true,
    });

    await label(s, 'send to blinded');
    const sent1 = await wcall(s, 'onchainSend', {
      invoice: blind.invoice,
      assetId: nia.assetId,
      amount: 100,
      feeRate: 2,
    });
    await label(s, 'send to witness');
    const sent2 = await wcall(s, 'onchainSend', {
      invoice: witness.invoice,
      assetId: nia.assetId,
      amount: 50,
      feeRate: 2,
      witnessData: { amountSat: 1000 },
    });
    await label(s, 'pending sends');
    await wcall(s, 'listTransfers', nia.assetId);
    await label(r, 'pending receives');
    await wcall(r, 'listTransfers');
    await wcall(r, 'refresh');

    await label(s, 'settling');
    await label(r, 'settling');
    await settle([r, s], async () => {
      const out = await wcall(s, 'listTransfers', nia.assetId);
      return [sent1.txid, sent2.txid].every(
        (txid) => out.find((t) => t.txid === txid)?.status === 'Settled'
      );
    });

    await label(s, 'settled sends');
    await wcall(s, 'listTransfers', nia.assetId);
    await wcall(s, 'listTransfers', ifa.assetId);
    await wcall(s, 'listTransactions');
    await wcall(s, 'getAssetBalance', nia.assetId);
    await label(r, 'settled receives');
    await wcall(r, 'listTransfers', nia.assetId);
    await wcall(r, 'listAssets');
    await wcall(r, 'getAssetBalance', nia.assetId);
    await wcall(r, 'listUnspents');

    await label(r, 'named witness invoice');
    const named = await wcall(r, 'witnessReceive', {
      assetId: nia.assetId,
      amount: 7,
    });
    await label(s, 'decode named invoice');
    await wcall(s, 'decodeRGBInvoice', { invoice: named.invoice });

    await label(r, 'fail a pending receive');
    const toFail = await wcall(r, 'blindReceive', {
      assetId: nia.assetId,
      amount: 3,
    });
    await wcall(r, 'failTransfers', {
      batchTransferIdx: toFail.batchTransferIdx,
    });
    await wcall(r, 'listTransfers', nia.assetId);
    await wcall(r, 'refresh');

    await label(s, 'send BTC');
    await wcall(s, 'sendBtc', {
      address: await wcall(r, 'getAddress'),
      amount: 10_000,
      feeRate: 2,
    });
    await mine(1);
    await label(r, 'after BTC receive');
    await wcall(r, 'getBtcBalance');
    await wcall(r, 'listTransactions');
    await label(s, 'invalid input rejected by the runtime');
    await wcallError(s, 'sendBtc', {
      address: 'not-an-address',
      amount: 1000,
      feeRate: 2,
    });
    await wcallError(s, 'estimateFeeRate', 1000).catch(() => undefined);

    records.push(...(await take(s, 'sender')), ...(await take(r, 'receiver')));
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
  expect(records.length).toBeGreaterThan(20);
  const written = writeFixtures(records, { capturedAt });
  console.log('fixtures written:', written, 'stand:', STAND.indexerUrl);
});
