/**
 * A new wallet: keys, one create() call, an address and the balance.
 * Store the mnemonic safely; it is the only way to restore the wallet.
 */
import { RgbLibWeb, generateKeys } from '@utexo/rgb-sdk-web';

export async function newWallet() {
  const keys = await generateKeys('testnet');

  const wallet = await RgbLibWeb.create({
    network: 'testnet',
    mnemonic: keys.mnemonic,
    // Optional: one address instead of a new one per call.
    reuseAddresses: true,
  });

  const address = await wallet.getAddress();
  const balance = await wallet.getBtcBalance();
  console.log({ address, vanilla: balance.vanilla, colored: balance.colored });

  return { wallet, mnemonic: keys.mnemonic };
}
