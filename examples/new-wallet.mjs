/**
 * Create a new UTEXO wallet from freshly generated keys.
 *
 * Generates a mnemonic, initializes a UTEXOWallet,
 * and prints the deposit address and BTC balance.
 */

import { generateKeys, UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'testnet';

const keys = await generateKeys(NETWORK);
console.log('Mnemonic (store securely):', keys.mnemonic);

const wallet = new UTEXOWallet(keys.mnemonic, { network: NETWORK });
await wallet.initialize();

const address = await wallet.getAddress();
console.log('Deposit address:', address);

const balance = await wallet.getBtcBalance();
console.log('BTC balance:', balance);

await wallet.dispose();
