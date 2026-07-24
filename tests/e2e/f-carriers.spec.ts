/**
 * Scenario F — carrier reality, web only (§7a.3).
 *
 * §6.0f proves the carriers are not stubs; this proves they succeed:
 * `beginEnd.createUtxosBegin` + `psbt.signPsbt` + `beginEnd.createUtxosEnd`
 * complete a real begin/sign/end round-trip, and `backupNow()` performs a
 * real backup when the stack runs with VSS=1 (otherwise that part is skipped —
 * the full VSS round-trip is scenario G / 6b.4).
 *
 * These carriers exist for apps that must not hand the SDK a mnemonic — the
 * key lives elsewhere (a hardware signer, a server, a separate approval step)
 * and the SDK only ever sees a PSBT:
 *
 * ```ts
 * if (wallet.capabilities.beginEndFlows && wallet.capabilities.psbtSigning) {
 *   // 1. build, unsigned
 *   const begun = await wallet.beginEnd.createUtxosBegin({
 *     upTo: false, num: 5, feeRate: 7,
 *   });
 *
 *   // 2. sign — here with the wallet's own key, but this is the seam where a
 *   //    hardware signer or a remote approval service would take over
 *   const signed = await wallet.psbt.signPsbt(begun.psbt);
 *
 *   // 3. broadcast
 *   await wallet.beginEnd.createUtxosEnd({ signedPsbt: signed });
 * }
 *
 * // Same shape for sending BTC: sendBtcBegin → signPsbt → sendBtcEnd.
 * // And backups are explicit — nothing uploads on its own:
 * await wallet.backupNow();
 * ```
 *
 * Check `capabilities` rather than calling blindly: these carriers are present
 * on web, which runs an rgb-lib wallet *beside* the node, and absent on React
 * Native, where the node owns the keys and never hands out a PSBT (§2.7a).
 */
import { test, expect } from '@playwright/test';
import { report, expectFields, HEX_32 } from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures, gatewayFund } from './fixtures';
import {
  bootWallet,
  wcall,
  fundAndCreateUtxos,
  waitForColorable,
  retry,
  wirePageLogging,
} from './harness-client';

const f = loadFixtures();

test('F: psbt + beginEnd carriers do real work', async ({ page }) => {
  wirePageLogging(page);
  await bootWallet(page, f);
  const address = await wcall<string>(page, 'getAddress');
  await fundAndCreateUtxos(page, f, address, 3);

  // begin → sign → end: a real createUtxos round-trip through the carriers.
  // Retried with a resync — esplora's tip lag makes a psbt built too early
  // spend an input the node already considers spent.
  const numCreated = await retry(async () => {
    await wcall(page, 'syncWallet');
    const unsigned = await wcall<string>(page, 'beginEnd.createUtxosBegin', {
      upTo: false,
      num: 2,
      feeRate: 7,
    });
    report('beginEnd.createUtxosBegin (psbt length)', unsigned.length);
    expect(unsigned.length).toBeGreaterThan(0);

    const signed = await wcall<string>(page, 'psbt.signPsbt', unsigned);
    report('psbt.signPsbt (signed length)', signed.length);
    expect(signed.length).toBeGreaterThan(0);
    expect(signed, 'signing must change the psbt').not.toBe(unsigned);

    return wcall<number>(page, 'beginEnd.createUtxosEnd', {
      signedPsbt: signed,
    });
  });
  report('beginEnd.createUtxosEnd', numCreated);
  expect(numCreated).toBeGreaterThan(0);

  // Confirm, and wait until the wallet sees the new outputs — a stale view
  // here would make sendBtcBegin select already-spent inputs.
  await gatewayFund(f, address, 0.001, 1);
  await waitForColorable(page, 3 + numCreated);

  // sendBtc through the same carriers: begin → sign → end returns a txid.
  // Retried with a resync: esplora's tip lags, so a psbt built too early spends
  // an input the node already considers spent (`bad-txns-inputs-missingorspent`).
  const txid = await retry(async () => {
    await wcall(page, 'syncWallet');
    const sendPsbt = await wcall<string>(page, 'beginEnd.sendBtcBegin', {
      address,
      amount: 10_000,
      feeRate: 7,
    });
    const sendSigned = await wcall<string>(page, 'psbt.signPsbt', sendPsbt);
    return wcall<string>(page, 'beginEnd.sendBtcEnd', {
      signedPsbt: sendSigned,
    });
  });
  report('beginEnd.sendBtcEnd (txid)', txid);
  expect(txid).toMatch(HEX_32);
});

test('F: vss carrier performs a real backup (VSS=1)', async ({ page }) => {
  test.skip(!f.VSS_URL, 'stack started without VSS=1 — no VSS_URL in fixture');
  wirePageLogging(page);

  await bootWallet(page, f, { vss: true });
  // Give the backup something to contain.
  const address = await wcall<string>(page, 'getAddress');
  await gatewayFund(f, address, 0.01, 1);
  await wcall(page, 'syncWallet');

  const version = await wcall<number>(page, 'backupNow');
  report('backupNow (version)', version);
  expect(typeof version).toBe('number');
  expect(version).toBeGreaterThanOrEqual(0);

  const info = await wcall<Record<string, unknown>>(page, 'vssBackupInfo');
  report('vssBackupInfo', info);
  expectFields(info, {
    backupExists: { type: 'boolean', oneOf: [true] },
    backupRequired: { type: 'boolean' },
    serverVersion: { type: 'number', optional: true },
  });
});
