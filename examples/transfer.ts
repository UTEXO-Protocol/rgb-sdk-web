/**
 * An RGB transfer between two wallets on-chain. The receiver makes a
 * witness invoice; the sender pays it and the receiving output's sats; both
 * refresh until the receiver's transfer is `Settled`.
 */
import type { RgbLibWeb } from '@utexo/rgb-sdk-web';

export async function transfer(
  sender: RgbLibWeb,
  receiver: RgbLibWeb,
  assetId: string
) {
  // Witness invoice (the default): the asset arrives on a new output of the
  // sender's transaction, so the receiver needs no free UTXOs.
  const { invoice, recipientId } = await receiver.onchainReceive({
    assetId,
    amount: 10,
    minConfirmations: 1,
    durationSeconds: 3600,
  });
  // Blinded alternative: `witness: false` receives on a UTXO of the receiver,
  // which must have free UTXOs (`createUtxos()`), and the sender then passes
  // no `witnessData`.

  const { txid } = await sender.onchainSend({
    invoice,
    amount: 10,
    feeRate: 2,
    minConfirmations: 1,
    witnessData: { amountSat: 1000 }, // sats of the receiver's new output
  });
  console.log('sent in', txid);

  // A transfer advances in steps (consignment exchange, then confirmation),
  // so refresh both sides until the receiver's side settles.
  for (let attempt = 0; attempt < 60; attempt++) {
    await receiver.refresh();
    await sender.refresh();
    const received = (await receiver.listTransfers(assetId)).find(
      (t) => t.recipientId === recipientId
    );
    if (received?.status === 'Settled') break;
    if (received?.status === 'Failed') throw new Error('transfer failed');
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  console.log('receiver balance', await receiver.getAssetBalance(assetId));
}
