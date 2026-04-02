/**
 * Create UTXOs and issue a NIA asset.
 *
 * Requires a funded wallet (send BTC to the deposit address first).
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'testnet';
const MNEMONIC = 'your twelve word mnemonic phrase here ...';

const wallet = new UTEXOWallet(MNEMONIC, { network: NETWORK });
await wallet.initialize();

const count = await wallet.createUtxos({ num: 5, size: 1000 });
await wallet.syncWallet();
console.log(`Created ${count} UTXOs`);

const asset = await wallet.issueAssetNia({
  ticker: 'DEMO',
  name: 'Demo Token',
  amounts: [1000],
  precision: 0,
});
console.log('Asset issued:', asset.assetId);

await wallet.dispose();
