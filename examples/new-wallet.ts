/**
 * A new wallet: keys, one create() call, an address and the balance.
 * Store the mnemonic safely: it restores the keys and bitcoin. RGB assets
 * also need a backup of the wallet state (VSS or exportBackup()).
 */
import { RgbLibWeb, generateKeys } from '@utexo/rgb-sdk-web';

export async function newWallet() {
  const keys = await generateKeys('utexo');

  const wallet = await RgbLibWeb.create({
    network: 'utexo',
    mnemonic: keys.mnemonic,
    // Optional: one address instead of a new one per call.
    reuseAddresses: true,
  });

  const address = await wallet.getAddress();
  const balance = await wallet.getBtcBalance();
  console.log({ address, vanilla: balance.vanilla, colored: balance.colored });

  return { wallet, mnemonic: keys.mnemonic };
}
