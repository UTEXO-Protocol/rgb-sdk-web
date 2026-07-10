/**
 * Read wallet info: offline and online operations.
 *
 * Offline (no indexer): getXpub, getNetwork
 * Online (requires indexer): getAddress, getBtcBalance, listAssets
 *
 * init() auto-connects non-fatally — check isOnline() and retry with
 * goOnline() if the indexer was unreachable.
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

// Offline — no indexer needed
console.log('xpub:', wallet.getXpub());
console.log('network:', wallet.getNetwork());

// Online — retry the connection if the auto-connect failed
if (!wallet.isOnline()) {
  await wallet.goOnline('http://127.0.0.1:3002');
}
console.log('address:', await wallet.getAddress());
console.log('BTC balance:', await wallet.getBtcBalance());
console.log('assets:', await wallet.listAssets());

await wallet.dispose();
