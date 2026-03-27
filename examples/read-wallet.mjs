/**
 * Read wallet info: offline and online operations.
 *
 * Offline (no indexer): getXpub, getNetwork, getAddress
 * Online (requires indexer): getBtcBalance, listAssets
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'testnet';
const MNEMONIC = 'your twelve word mnemonic phrase here ...';

const wallet = new UTEXOWallet(MNEMONIC, { network: NETWORK });
await wallet.initialize();

// Offline — no indexer needed
console.log('xpub:', wallet.getXpub());
console.log('network:', wallet.getNetwork());
console.log('address:', await wallet.getAddress());

// Online — connect to indexer first
await wallet.goOnline('');
console.log('BTC balance:', await wallet.getBtcBalance());
console.log('assets:', await wallet.listAssets());

await wallet.dispose();
