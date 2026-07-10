/**
 * Lightning channels + keysend: connect to a peer, open an RGB channel,
 * wait until it is usable, then send spontaneous keysend payments
 * (BTC and RGB) without an invoice.
 *
 * Assumes the wallet is funded (BTC for capacity + fees) and holds the
 * asset. proxyUrl defaults per network, so the Lightning node is enabled.
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'utexo';
const MNEMONIC = 'twelve word mnemonic phrase here ...';
const PASSWORD = 'my-secure-password';
const PEER_PUBKEY = '02...'; // hosted RLN node pubkey
const PEER_ADDR = 'peer.example.com:9735'; // LDK P2P host:port
const ASSET_ID = 'rgb:...';

const wallet = new UTEXOWallet({
  mnemonic: MNEMONIC,
  password: PASSWORD,
  network: NETWORK,
});
await wallet.init();
console.log('Node pubkey:', await wallet.getNodePubkey());

// Connect to the peer over Lightning P2P
await wallet.connectPeer(PEER_ADDR, PEER_PUBKEY);
console.log('Peers:', await wallet.listPeers());

// Open an RGB channel — capacity/asset amounts are bigint. Returns the
// temporary channel ID; the final one appears in listChannels().
const tempChannelId = await wallet.openChannel({
  peerPubkey: PEER_PUBKEY,
  capacitySat: 100_000n,
  isPublic: false,
  assetId: ASSET_ID,
  assetLocalAmount: 100n,
});
console.log('Opening channel:', tempChannelId);

// Wait until the funding tx confirms and the channel is usable
let channel;
while (!channel?.isUsable) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await wallet.syncWallet();
  channel = (await wallet.listChannels()).find(
    (c) => c.peerPubkey === PEER_PUBKEY
  );
  console.log('Channel usable:', channel?.isUsable ?? false);
}

// Keysend — BTC (amount in msat)
const btcPay = await wallet.keysend(PEER_PUBKEY, 5_000_000);
console.log('BTC keysend:', btcPay.paymentHash, btcPay.status);

// Keysend — RGB asset over the channel
const rgbPay = await wallet.keysend(PEER_PUBKEY, 3_000_000, ASSET_ID, 10);
console.log('RGB keysend:', rgbPay.paymentHash, rgbPay.status);

// Payment history (rich records: status, rawStatus, preimage when known)
console.log('Payments:', await wallet.listPayments());

// Cooperative close when done:
// wallet.closeChannel(channel.channelId, PEER_PUBKEY);

await wallet.dispose();
