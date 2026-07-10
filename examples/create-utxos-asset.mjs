/**
 * Create UTXOs and issue a NIA asset.
 *
 * Requires a funded wallet (send BTC to the deposit address first).
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'regtest';
const MNEMONIC = 'your twelve word mnemonic phrase here ...';

const wallet = new UTEXOWallet({
  mnemonic: MNEMONIC,
  password: 'my-secure-password',
  network: NETWORK,
});
await wallet.init();

await wallet.syncWallet();
const count = await wallet.createUtxos({ upTo: true, num: 4, feeRate: 2 });
console.log(`Created ${count} UTXOs`);

const asset = await wallet.issueAssetNia({
  ticker: 'DEMO',
  name: 'Demo Token',
  amounts: [1000],
  precision: 0,
});
console.log('Asset issued:', asset.assetId);

await wallet.dispose();
