/**
 * APay (async payments): receive RGB via a Lightning Address while the
 * recipient may be offline — recipient and sender sides, mirroring the
 * demo's APay flow.
 *
 * The LSP holds the payment (HODL) and delivers via its outbox when the
 * recipient reconnects; settlement on the recipient is automatic (no
 * claimHodlInvoice). lspBearerToken is required for the APay routes.
 * Full protocol → docs/async-payments.md.
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'utexo';
const PASSWORD = 'my-secure-password';
const LSP_BEARER_TOKEN = 'bearer-token';
const ASSET_ID = 'rgb:...';

// ── Recipient: enable a Lightning Address ────────────────────────────────────

// lspBaseUrl defaults per network (utexo → https://lsp-signet.utexo.com)
const recipient = new UTEXOWallet({
  mnemonic: 'recipient twelve word mnemonic phrase here ...',
  password: PASSWORD,
  network: NETWORK,
  lspBaseUrl: 'https://lsp-signet.utexo.com',
  lspBearerToken: LSP_BEARER_TOKEN,
});
await recipient.init();
await recipient.unlock();
const recipientLsp = await recipient.createLsp();

await recipientLsp.connect();
await recipientLsp.waitForChannel(ASSET_ID, {
  onProgress: (msg) => console.log(msg),
});

// Registers one signed hash batch and resolves the LSP-minted address.
// Register exactly one batch — the size already matches the LSP pool cap.
const { address, unusedHashes } = await recipientLsp.enableLightningAddress();
console.log('Lightning Address:', address, `(${unusedHashes} hashes left)`);

// While the tab is open: reconnect periodically so the LSP outbox can reach
// the node, and top up the hash pool only when it runs low (an unconditional
// refill overflows the pool and the LSP rejects the batch).
let hashesLeft = unusedHashes ?? 0;
setInterval(async () => {
  await recipientLsp.connect();
  if (hashesLeft < 5) {
    ({ unusedHashes: hashesLeft } = await recipientLsp.refillHashPool());
    console.log('Hash pool refilled:', hashesLeft);
  }
}, 60_000);

// ── Sender: pay the Lightning Address ────────────────────────────────────────

const sender = new UTEXOWallet({
  mnemonic: 'sender twelve word mnemonic phrase here ...',
  password: PASSWORD,
  network: NETWORK,
});
await sender.init();
await sender.unlock();
const senderLsp = await sender.createLsp();

await senderLsp.connect();
await senderLsp.waitForChannel(ASSET_ID, {
  onProgress: (msg) => console.log(msg),
});
await senderLsp.waitForOutboundLiquidity(3_000_000, {
  onProgress: (msg) => console.log(msg),
});

// Resolves the address (LNURL) and pays the returned HODL invoice
const { sendResult } = await senderLsp.payAddress({
  address,
  amtMsat: 3_000_000,
  asset: { assetId: ASSET_ID, assetAmount: 1 },
});
console.log('Payment hash:', sendResult.txid);

// Sender polls until Settled ('WaitingCounterparty' → 'Settled' | 'Failed')
let status;
while (status !== 'Settled') {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  status = await sender.getLightningSendRequest(sendResult.txid);
  console.log('Send status:', status);
  if (status === 'Failed') throw new Error('payment failed');
}

// ── Recipient: settlement is automatic ───────────────────────────────────────

// When the recipient is online (or next reconnects), the LSP outbox delivers
// the payment — watch the inbound record and the channel's RGB balance.
await recipient.syncWallet();
const inbound = (await recipient.listPayments()).find(
  (p) => p.inbound && p.paymentHash === sendResult.txid
);
console.log('Inbound:', inbound?.rawStatus ?? inbound?.status ?? 'not yet');
const channels = await recipient.listChannels();
console.log('Channel RGB:', channels[0]?.assetLocalAmount);

await sender.dispose();
await recipient.dispose();
