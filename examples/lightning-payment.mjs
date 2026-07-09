/**
 * Plain Lightning payments between the in-browser wasm node and a hosted
 * node: receive via createLightningInvoice, pay via payLightningInvoice.
 *
 * Assumes a usable channel with the hosted node already exists (see
 * lightning-channels-keysend.mjs or lsp-bridge.mjs for opening one).
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'utexo';
const MNEMONIC = 'twelve word mnemonic phrase here ...';
const PASSWORD = 'my-secure-password';
const ASSET_ID = 'rgb:...';

const wallet = await UTEXOWallet.create({
  mnemonic: MNEMONIC,
  password: PASSWORD,
  network: NETWORK,
});

// ── Receive ──────────────────────────────────────────────────────────────────

// BTC invoice — amountSats only. Omit it for a zero-amount ("any amount")
// invoice where the payer picks the amount.
const btcInvoice = await wallet.createLightningInvoice({ amountSats: 3000 });
console.log('BTC invoice:', btcInvoice.lnInvoice);

// RGB asset invoice — asset.amount is in asset units (assetAmount is
// accepted as an alias); amountSats is the sats component.
const rgbInvoice = await wallet.createLightningInvoice({
  amountSats: 3000,
  asset: { assetId: ASSET_ID, amount: 10 },
});
console.log('RGB invoice:', rgbInvoice.lnInvoice);

// Share the invoice with the payer, then poll until it settles:
// 'WaitingCounterparty' → 'Settled' | 'Failed'
let receiveStatus;
while (receiveStatus !== 'Settled') {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  receiveStatus = await wallet.getLightningReceiveRequest(btcInvoice.lnInvoice);
  console.log('Receive status:', receiveStatus);
  if (receiveStatus === 'Failed') throw new Error('invoice failed/expired');
}

// ── Pay ──────────────────────────────────────────────────────────────────────

const LN_INVOICE = 'lnbc...'; // BOLT11 from the hosted node / another wallet

// Inspect before paying
const decoded = await wallet.decodeLnInvoice(LN_INVOICE);
console.log('Paying:', decoded.amtMsat, 'msat to', decoded.payee);

// Atomic pay — amount comes from the invoice itself. For a zero-amount
// invoice pass `amount` (sats); for an RGB invoice pass assetId/assetAmount.
const pay = await wallet.payLightningInvoice({ lnInvoice: LN_INVOICE });
console.log('Payment hash:', pay.txid);

// Poll the send until terminal
let sendStatus;
while (sendStatus !== 'Settled') {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  sendStatus = await wallet.getLightningSendRequest(pay.txid);
  console.log('Send status:', sendStatus);
  if (sendStatus === 'Failed') throw new Error('payment failed');
}

await wallet.dispose();
