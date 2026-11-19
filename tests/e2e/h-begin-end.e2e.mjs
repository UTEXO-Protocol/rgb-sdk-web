/**
 * Scenario H — prepare, approve and submit as separate steps, on the `beginEnd`
 * and `psbt` carriers over the real runtime: a declined burn gives its inputs
 * back, an approved burn reports the exact fee of the transaction on chain, and
 * repeating an end step with the same signed PSBT returns the same result.
 */
import { test, expect } from '@playwright/test';
import { report, HEX_32 } from '@utexo/rgb-sdk-core/conformance';
import {
  bootWallet,
  fundAndCreateUtxos,
  settle,
  wcall,
  wcallError,
  wirePageLogging,
} from './client.mjs';
import { STAND, fund, mine } from './stand.mjs';

const ISSUED = 5000;
const INFLATED = 300;
const BURNED = 1200;
const SENT = 400;

const sign = (page, psbt) => wcall(page, 'psbt.signPsbt', psbt);
const settled = async (page, assetId) =>
  (await wcall(page, 'getAssetBalance', assetId)).settled;

test('H: a burn is prepared, declined or approved, and submitted once', async ({
  page,
}) => {
  test.setTimeout(300_000);
  wirePageLogging(page);
  await bootWallet(page);

  await fund(await wcall(page, 'getAddress'));
  const unsignedUtxos = await wcall(page, 'beginEnd.createUtxosBegin', {
    num: 8,
    size: 2000,
    feeRate: 2,
  });
  const created = await wcall(page, 'beginEnd.createUtxosEnd', {
    signedPsbt: await sign(page, unsignedUtxos),
  });
  expect(created).toBeGreaterThan(0);
  await mine(1);

  const { assetId } = await wcall(page, 'issueAssetIfa', {
    ticker: 'E2EB',
    name: 'E2E Begin End',
    precision: 0,
    amounts: [ISSUED],
    inflationAmounts: [INFLATED],
    rejectListUrl: null,
  });
  const burn = (amount) => ({
    assetId,
    amount: String(amount),
    burnRecipient: 'ab'.repeat(32),
    feeRate: 2,
    minConfirmations: 1,
  });

  // Declined: the inputs come back and the signed PSBT cannot be submitted.
  const declined = await wcall(page, 'beginEnd.burnBegin', burn(700));
  const declinedPsbt = await sign(page, declined.psbt);
  expect(
    await wcall(page, 'failTransfers', {
      batchTransferIdx: declined.batchTransferIdx,
    })
  ).toBe(true);
  const refused = await wcallError(page, 'beginEnd.burnEnd', {
    signedPsbt: declinedPsbt,
  });
  report('burnEnd of a declined burn', refused.detail);
  expect(refused.operation).toBe('burnEnd');
  expect(await settled(page, assetId)).toBe(ISSUED);

  // Approved: what was shown is what reaches the chain.
  const begun = await wcall(page, 'beginEnd.burnBegin', burn(BURNED));
  report('burnBegin', { ...begun, psbt: undefined });
  expect(begun.txid).toMatch(HEX_32);
  expect(await wcall(page, 'psbt.estimateFee', begun.psbt)).toEqual({
    fee: begun.fee,
    vbytes: begun.vbytes,
    feeRate: begun.feeRate,
  });
  const signedPsbt = await sign(page, begun.psbt);
  expect((await wcall(page, 'psbt.estimateFee', signedPsbt)).fee).toBe(
    begun.fee
  );

  const ended = await wcall(page, 'beginEnd.burnEnd', { signedPsbt });
  expect(ended).toEqual({
    txid: begun.txid,
    batchTransferIdx: begun.batchTransferIdx,
  });

  // Submitted twice is still one operation.
  expect(await wcall(page, 'beginEnd.burnEnd', { signedPsbt })).toEqual(ended);
  const listed = (await wcall(page, 'listTransfers', assetId)).filter(
    (t) => t.txid === begun.txid
  );
  expect(listed.length).toBe(1);

  const response = await fetch(`${STAND.indexerUrl}/tx/${begun.txid}`);
  expect(response.ok).toBe(true);
  const onChain = await response.json();
  report('burn on chain', { fee: onChain.fee, weight: onChain.weight });
  expect(onChain.fee).toBe(begun.fee);
  expect(Math.ceil(onChain.weight / 4)).toBe(begun.vbytes);

  await settle(
    [page],
    async () => (await settled(page, assetId)) === ISSUED - BURNED
  );
  expect(await wcall(page, 'beginEnd.burnEnd', { signedPsbt })).toEqual(ended);
  const transfer = (await wcall(page, 'listTransfers', assetId)).find(
    (t) => t.txid === begun.txid
  );
  expect(transfer).toMatchObject({ kind: 'Burn', status: 'Settled' });
});

test('H: inflate, send and sendBtc run as separate steps', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const contexts = [await browser.newContext(), await browser.newContext()];
  const [sender, receiver] = await Promise.all(
    contexts.map((c) => c.newPage())
  );
  try {
    wirePageLogging(sender);
    wirePageLogging(receiver);
    await bootWallet(sender);
    await bootWallet(receiver);
    await fundAndCreateUtxos(sender, 8);
    await fundAndCreateUtxos(receiver, 8);
    const { assetId } = await wcall(sender, 'issueAssetIfa', {
      ticker: 'E2EC',
      name: 'E2E Other Pairs',
      precision: 0,
      amounts: [ISSUED],
      inflationAmounts: [INFLATED],
      rejectListUrl: null,
    });

    const unsignedInflation = await wcall(sender, 'beginEnd.inflateBegin', {
      assetId,
      inflationAmounts: [INFLATED],
      feeRate: 2,
    });
    const signedInflation = await sign(sender, unsignedInflation);
    const inflated = await wcall(sender, 'beginEnd.inflateEnd', {
      signedPsbt: signedInflation,
    });
    expect(
      await wcall(sender, 'beginEnd.inflateEnd', {
        signedPsbt: signedInflation,
      })
    ).toEqual(inflated);
    await settle(
      [sender],
      async () => (await settled(sender, assetId)) === ISSUED + INFLATED
    );

    const invoice = await wcall(receiver, 'onchainReceive', {
      minConfirmations: 1,
      durationSeconds: 3600,
      witness: false,
    });
    const unsignedSend = await wcall(sender, 'beginEnd.onchainSendBegin', {
      invoice: invoice.invoice,
      assetId,
      amount: SENT,
      feeRate: 2,
    });
    const signedSend = await sign(sender, unsignedSend);
    const sent = await wcall(sender, 'beginEnd.onchainSendEnd', {
      signedPsbt: signedSend,
    });
    expect(sent.txid).toMatch(HEX_32);
    expect(
      await wcall(sender, 'beginEnd.onchainSendEnd', { signedPsbt: signedSend })
    ).toEqual(sent);
    await settle([receiver, sender], async () => {
      const received = await wcall(receiver, 'listTransfers', assetId).catch(
        () => []
      );
      return received.some(
        (t) => t.recipientId === invoice.recipientId && t.status === 'Settled'
      );
    });
    expect(await settled(receiver, assetId)).toBe(SENT);
    expect(
      await wcall(sender, 'beginEnd.onchainSendEnd', { signedPsbt: signedSend })
    ).toEqual(sent);

    const unsignedBtc = await wcall(sender, 'beginEnd.sendBtcBegin', {
      address: await wcall(receiver, 'getAddress'),
      amount: 20_000,
      feeRate: 2,
    });
    const txid = await wcall(sender, 'beginEnd.sendBtcEnd', {
      signedPsbt: await sign(sender, unsignedBtc),
    });
    expect(txid).toMatch(HEX_32);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
