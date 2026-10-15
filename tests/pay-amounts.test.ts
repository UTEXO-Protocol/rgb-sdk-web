/**
 * Amount validation for Lightning payment entry points.
 *
 * payLightningInvoice / createLightningInvoice / keysend convert user
 * amounts to bigint for the node binding. Float math before BigInt()
 * silently rounds anything outside the safe-integer range (realistic for
 * RGB u64 base units), so invalid inputs must throw ValidationError before
 * any node call. Valid inputs proceed past validation and fail later at the
 * missing node — proving the guard let them through.
 */
import { UTEXOWallet } from '../dist/index.mjs';

const wallet = new UTEXOWallet({
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  password: 'test',
} as any);

describe('Lightning amount validation', () => {
  it('payLightningInvoice rejects fractional sats', async () => {
    await expect(
      wallet.payLightningInvoice({
        lnInvoice: 'lnbc1dummy',
        amount: 0.5,
      } as any)
    ).rejects.toThrow('amount must be a non-negative safe integer');
  });

  it('payLightningInvoice rejects amounts outside the safe-integer range', async () => {
    await expect(
      wallet.payLightningInvoice({
        lnInvoice: 'lnbc1dummy',
        amount: 2 ** 53,
      } as any)
    ).rejects.toThrow('amount must be a non-negative safe integer');
  });

  it('payLightningInvoice rejects negative asset amounts', async () => {
    await expect(
      wallet.payLightningInvoice({
        lnInvoice: 'lnbc1dummy',
        amount: 1000,
        assetId: 'rgb:asset',
        assetAmount: -5,
      } as any)
    ).rejects.toThrow('assetAmount must be a non-negative safe integer');
  });

  it('payLightningInvoice passes exact amounts through validation', async () => {
    // Validation succeeds; the call then fails at the missing node.
    await expect(
      wallet.payLightningInvoice({ lnInvoice: 'lnbc1dummy', amount: 1000 })
    ).rejects.toThrow('not initialized');
  });

  it('keysend rejects unsafe msat amounts', async () => {
    await expect(wallet.keysend('02' + 'ab'.repeat(32), 1.5)).rejects.toThrow(
      'amtMsat must be a non-negative safe integer'
    );
  });

  it('keysend passes exact amounts through validation', async () => {
    await expect(wallet.keysend('02' + 'ab'.repeat(32), 1000)).rejects.toThrow(
      'not initialized'
    );
  });

  it('createLightningInvoice rejects fractional sats', async () => {
    await expect(
      wallet.createLightningInvoice({ amountSats: 10.5 } as any)
    ).rejects.toThrow('amountSats must be a non-negative safe integer');
  });

  it('createLightningInvoice passes exact amounts through validation', async () => {
    await expect(
      wallet.createLightningInvoice({ amountSats: 1000 })
    ).rejects.toThrow('not initialized');
  });
});
