/**
 * Scenario B — on-chain & UTXO (§7a.3).
 *
 * getAddress → fund via gateway → getBtcBalance → createUtxos → listUnspents.
 * The point is field verification: balances as numbers on both sides, unspents
 * with a PARSED outpoint (txid + numeric vout), never the raw "txid:vout"
 * string the binding returns.
 *
 * For a real user this is "receive bitcoin, then get ready to hold assets":
 *
 * ```ts
 * const address = await wallet.getAddress();   // show as QR; send BTC here
 *
 * // …wait for the transfer to confirm. Nothing to trigger — poll:
 * await wallet.syncWallet();
 * const btc = await wallet.getBtcBalance();
 * //   btc.vanilla.spendable — plain BTC, usable for fees and channels
 * //   btc.colored           — reserved for the UTXOs that carry RGB
 *
 * // RGB allocations each need their own UTXO. Without these, issuing or
 * // receiving an asset later fails for lack of a colourable output — so an
 * // app usually does this once, right after the wallet is first funded.
 * await wallet.createUtxos({ upTo: false, num: 5, feeRate: 7 });
 *
 * const unspents = await wallet.listUnspents();
 * //   u.utxo.colorable — can carry RGB;  u.utxo.outpoint.{txid,vout}
 * ```
 */
import { test, expect } from '@playwright/test';
import {
  report,
  expectFields,
  expectEach,
  expectNoWireKeys,
  HEX_32,
} from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures, gatewayFund } from './fixtures';
import {
  bootWallet,
  wcall,
  waitForFunds,
  waitForColorable,
  wirePageLogging,
  type BtcBalanceShape,
} from './harness-client';

const f = loadFixtures();

const balanceSideSpec = {
  settled: { type: 'number', min: 0 },
  future: { type: 'number', min: 0 },
  spendable: { type: 'number', min: 0 },
} as const;

test('B: address, funding, balance, UTXOs, unspents', async ({ page }) => {
  wirePageLogging(page);
  await bootWallet(page, f);

  const address = await wcall<string>(page, 'getAddress');
  report('getAddress', address);
  expect(address.startsWith('bcrt1'), `regtest bech32, got: ${address}`).toBe(
    true
  );

  const before = await wcall<BtcBalanceShape>(page, 'getBtcBalance');
  report('getBtcBalance (before)', before);
  expectFields(before, {
    'vanilla.settled': balanceSideSpec.settled,
    'vanilla.future': balanceSideSpec.future,
    'vanilla.spendable': balanceSideSpec.spendable,
    'colored.settled': balanceSideSpec.settled,
    'colored.future': balanceSideSpec.future,
    'colored.spendable': balanceSideSpec.spendable,
  });
  expectNoWireKeys(before);

  await gatewayFund(f, address, 1, 6);
  const after = await waitForFunds(page, before.vanilla.spendable + 1);
  report('getBtcBalance (after funding)', after);
  expect(
    after.vanilla.spendable,
    'balance must actually increase after funding'
  ).toBeGreaterThan(before.vanilla.spendable);

  const created = await wcall<unknown>(page, 'createUtxos', {
    upTo: false,
    num: 5,
    feeRate: 7,
  });
  report('createUtxos', created);
  await gatewayFund(f, address, 0.001, 1);
  await waitForColorable(page, 5);

  const unspents = await wcall<Record<string, unknown>[]>(page, 'listUnspents');
  report('listUnspents (count)', unspents.length);
  expect(unspents.length).toBeGreaterThan(0);
  expectEach(unspents, {
    'utxo.outpoint.txid': { type: 'string', pattern: HEX_32 },
    'utxo.outpoint.vout': { type: 'number', min: 0 },
    'utxo.btcAmount': { type: 'number', min: 0 },
    'utxo.colorable': { type: 'boolean' },
    'rgbAllocations': { type: 'array' },
  });
  for (const u of unspents) expectNoWireKeys(u);

  const colorable = unspents.filter(
    (u) => (u.utxo as { colorable: boolean }).colorable
  );
  expect(
    colorable.length,
    'createUtxos must have produced colorable UTXOs'
  ).toBeGreaterThan(0);
});
