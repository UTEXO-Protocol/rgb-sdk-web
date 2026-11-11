/**
 * An RGB transfer between two wallets on-chain. The receiver makes an
 * invoice; the sender pays it; both refresh until the transfer settles.
 */
import type { RgbLibWeb } from '@utexo/rgb-sdk-web';

export async function transfer(
  sender: RgbLibWeb,
  receiver: RgbLibWeb,
  assetId: string
) {
  // A blinded (UTXO) invoice for any asset. `witness: true` makes a
  // witness invoice instead; the sender then adds witnessData.
  const invoice = await receiver.onchainReceive({
    minConfirmations: 1,
    durationSeconds: 3600,
  });

  const sent = await sender.onchainSend({
    invoice: invoice.invoice,
    assetId,
    amount: 10,
    feeRate: 2,
  });
  console.log('sent in', sent.txid);

  // After the transaction confirms, refresh both sides to settle it.
  await receiver.refresh();
  await sender.refresh();
  console.log('receiver balance', await receiver.getAssetBalance(assetId));
}
