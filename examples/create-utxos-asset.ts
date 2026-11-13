/**
 * Colorable UTXOs and a new NIA asset. The wallet needs BTC first: send some
 * to `getAddress()`, then wait for a confirmation.
 */
import type { RgbLibWeb } from '@utexo/rgb-sdk-web';

export async function createUtxosAndIssue(wallet: RgbLibWeb) {
  // RGB allocations live on UTXOs of the colored keychain.
  const created = await wallet.createUtxos({ num: 5, feeRate: 2 });
  console.log('UTXOs created:', created);

  // Wait for the UTXO transaction to confirm, then issue.
  const asset = await wallet.issueAssetNia({
    ticker: 'DEMO',
    name: 'Demo Asset',
    precision: 0,
    amounts: [1000],
  });
  console.log('issued', asset.assetId);

  return asset.assetId;
}
