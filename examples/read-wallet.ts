/**
 * Reopen a stored wallet and read it. The same mnemonic and dataDir find the
 * wallet's state in IndexedDB.
 */
import { RgbLibWeb } from '@utexo/rgb-sdk-web';

export async function readWallet(mnemonic: string) {
  const wallet = await RgbLibWeb.create({
    network: 'testnet',
    mnemonic,
    dataDir: 'my-app',
  });

  const btc = await wallet.getBtcBalance();
  const assets = await wallet.listAssets();
  const transactions = await wallet.listTransactions();
  const unspents = await wallet.listUnspents();
  for (const asset of assets.nia ?? []) {
    const transfers = await wallet.listTransfers(asset.assetId);
    console.log(asset.ticker, asset.balance, transfers.length, 'transfers');
  }
  console.log({ btc, transactions: transactions.length, unspents });

  await wallet.destroy();
}
