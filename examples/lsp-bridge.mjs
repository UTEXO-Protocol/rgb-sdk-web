/**
 * LSP bridge flows (UtexoLsp): receive RGB over Lightning from an on-chain
 * sender, and send RGB on-chain by paying over Lightning.
 *
 * lspBaseUrl drives no-arg createLsp() peer discovery (GET /get_info);
 * omitted, it defaults per network (utexo → https://lsp-signet.utexo.com).
 * See docs/lsp.md for the full method reference.
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
  // lspBaseUrl: 'https://...',  // optional — network default when omitted
});

// Peer discovered from lspBaseUrl; port defaults to 9735
const lsp = await wallet.createLsp();

// 1. Connect + wait for a usable RGB channel with the LSP
await lsp.connect();
const channel = await lsp.waitForChannel(ASSET_ID, {
  onProgress: (msg) => console.log(msg),
});
console.log('Channel ready:', channel.channelId, channel.capacitySat, 'sat');

// ── Receive: on-chain RGB → Lightning ────────────────────────────────────────

// One call creates the LN invoice and registers it with the LSP (expiries
// kept in sync). Give rgbInvoice to the on-chain sender; the LSP pays
// lnInvoice once the RGB transfer settles.
const { lnInvoice, rgbInvoice } = await lsp.receiveAsset({
  assetId: ASSET_ID,
  amountSats: 3000,
  amountRgb: 1,
});
console.log('RGB invoice (give to sender):', rgbInvoice);

const outcome = await lsp.awaitReceiveSettlement(lnInvoice, {
  onProgress: (status) => console.log('Receive status:', status),
});
console.log('Receive outcome:', outcome); // 'settled' | 'timed_out'

// ── Send: Lightning → on-chain RGB ───────────────────────────────────────────

// Make sure the channel has enough outbound balance to route the payment
await lsp.waitForOutboundLiquidity(3_000_000, {
  onProgress: (msg) => console.log(msg),
});

// The LSP returns a BOLT11 invoice and sendAsset pays it immediately; the
// LSP delivers the RGB on-chain to the recipient once the LN leg settles.
const RECIPIENT_RGB_INVOICE = 'rgb:...'; // recipient's on-chain RGB invoice
const result = await lsp.sendAsset({
  rgbInvoice: RECIPIENT_RGB_INVOICE,
  ln: { amtMsat: 3_000_000 },
});
console.log('Sent. Payment hash:', result.sendResult.txid);

await wallet.dispose();
