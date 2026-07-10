/**
 * Create a new UTEXO wallet from freshly generated keys.
 *
 * Generates a mnemonic, creates a UTEXOWallet (loads the WASM and
 * auto-connects to the indexer), and prints the deposit address and
 * BTC balance.
 */

import { generateKeys, UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'regtest';

const keys = await generateKeys(NETWORK);
console.log('Mnemonic (store securely):', keys.mnemonic);

// indexerUrl / transportEndpoint / proxyUrl default per network when omitted.
const wallet = new UTEXOWallet({
  mnemonic: keys.mnemonic,
  password: 'my-secure-password',
  network: NETWORK,
});
await wallet.init();
console.log('online:', wallet.isOnline());

const address = await wallet.getAddress();
console.log('Deposit address:', address);

const balance = await wallet.getBtcBalance();
console.log('BTC balance:', balance);

await wallet.dispose();
