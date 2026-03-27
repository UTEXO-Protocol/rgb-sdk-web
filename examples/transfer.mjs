/**
 * RGB asset transfer: two wallets, witness + blind receive.
 *
 * Assumes both wallets have UTXOs and wallet A holds the asset.
 * Set ASSET_ID to an existing asset id.
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'testnet';
const MNEMONIC_A = 'sender twelve word mnemonic phrase here ...';
const MNEMONIC_B = 'receiver twelve word mnemonic phrase here ...';
const ASSET_ID = 'rgb:...';
const AMOUNT = 50;

const walletA = new UTEXOWallet(MNEMONIC_A, { network: NETWORK });
const walletB = new UTEXOWallet(MNEMONIC_B, { network: NETWORK });

await walletA.initialize();
await walletB.initialize();
await walletA.goOnline('');
await walletB.goOnline('');

// Receiver: create invoices
const blindInvoice = await walletB.blindReceive({ amount: AMOUNT });
const witnessInvoice = await walletB.witnessReceive({ amount: AMOUNT });
console.log('Blind invoice:', blindInvoice.invoice);
console.log('Witness invoice:', witnessInvoice.invoice);

// Sender: send to blind invoice
await walletA.send({
  invoice: blindInvoice.invoice,
  assetId: ASSET_ID,
  amount: AMOUNT,
});
console.log('Blind send done');

// Sender: send to witness invoice (include BTC output amount)
await walletA.send({
  invoice: witnessInvoice.invoice,
  assetId: ASSET_ID,
  amount: AMOUNT,
  witnessData: { amountSat: 1000 },
});
console.log('Witness send done');

// Refresh both wallets to pick up the transfers
await walletA.refreshWallet();
await walletB.refreshWallet();

console.log('Wallet A transfers:', await walletA.listTransfers(ASSET_ID));
console.log('Wallet B transfers:', await walletB.listTransfers(ASSET_ID));

await walletA.dispose();
await walletB.dispose();
