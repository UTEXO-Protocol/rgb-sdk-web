/**
 * RGB asset transfer: two wallets, witness + blind receive.
 *
 * Assumes both wallets have UTXOs and wallet A holds the asset.
 * Set ASSET_ID to an existing asset id.
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'regtest';
const MNEMONIC_A = 'sender twelve word mnemonic phrase here ...';
const MNEMONIC_B = 'receiver twelve word mnemonic phrase here ...';
const PASSWORD = 'my-secure-password';
const ASSET_ID = 'rgb:...';
const AMOUNT = 50;

const walletA = new UTEXOWallet({
  mnemonic: MNEMONIC_A,
  password: PASSWORD,
  network: NETWORK,
});
await walletA.init();
const walletB = new UTEXOWallet({
  mnemonic: MNEMONIC_B,
  password: PASSWORD,
  network: NETWORK,
});
await walletB.init();

// Receiver: create invoices — onchainReceive is witness by default,
// pass witness: false for a blinded invoice.
const witnessInvoice = await walletB.onchainReceive({ amount: AMOUNT });
const blindInvoice = await walletB.onchainReceive({ amount: AMOUNT, witness: false });
console.log('Witness invoice:', witnessInvoice.invoice);
console.log('Blind invoice:', blindInvoice.invoice);

// Sender: send to the witness invoice (witnessData is required — it sets the
// BTC amount on the witness output)
await walletA.onchainSend({
  invoice: witnessInvoice.invoice,
  assetId: ASSET_ID,
  amount: AMOUNT,
  feeRate: 2,
  witnessData: { amountSat: 1000 },
});
console.log('Witness send done');

// Sender: send to the blind invoice (no witnessData)
await walletA.onchainSend({
  invoice: blindInvoice.invoice,
  assetId: ASSET_ID,
  amount: AMOUNT,
  feeRate: 2,
});
console.log('Blind send done');

// Refresh both wallets to pick up the transfers
await walletA.refreshWallet();
await walletB.refreshWallet();

console.log('Wallet A transfers:', await walletA.listTransfers(ASSET_ID));
console.log('Wallet B transfers:', await walletB.listTransfers(ASSET_ID));

await walletA.dispose();
await walletB.dispose();
