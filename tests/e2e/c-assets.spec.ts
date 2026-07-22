/**
 * Scenario C — RGB assets (§7a.3).
 *
 * issueAssetNia → listAssets → getAssetBalance → blindReceive →
 * decodeRGBInvoice → listTransfers. The invoice must decode back to the same
 * assetId; transfer statuses and kinds must be in the canonical vocabulary.
 */
import { test, expect } from '@playwright/test';
import {
  report,
  expectFields,
  expectEach,
  expectNoWireKeys,
} from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures } from './fixtures';
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

test('C: issue NIA, balances, blind receive, decode, transfers', async ({
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

  const receive = await wcall<Record<string, unknown>>(page, 'blindReceive', {
    assetId,
    amount: 1,
    minConfirmations: 1,
    durationSeconds: 3600,
  });
  report('blindReceive', receive);
  expectFields(receive, {
    invoice: { type: 'string', nonEmpty: true },
    recipientId: { type: 'string', nonEmpty: true },
    batchTransferIdx: { type: 'number' },
  });
  expectNoWireKeys(receive);

  const decoded = await wcall<Record<string, unknown>>(
    page,
    'decodeRGBInvoice',
    { invoice: receive.invoice }
  );
  report('decodeRGBInvoice', decoded);
  expectFields(decoded, {
    recipientId: { type: 'string', nonEmpty: true },
    assetId: { type: 'string', optional: true },
    network: {
      oneOf: ['mainnet', 'testnet', 'testnet4', 'regtest', 'signet', 'utexo'],
    },
    transportEndpoints: { type: 'array', nonEmpty: true },
  });
  expect(decoded.assetId, 'invoice must decode back to the same assetId').toBe(
    assetId
  );
  expect(decoded.recipientId).toBe(receive.recipientId);
  expectNoWireKeys(decoded);

  const transfers = await wcall<Record<string, unknown>[]>(
    page,
    'listTransfers',
    assetId
  );
  report('listTransfers', transfers);
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
