/**
 * RlnSigner — ISigner implementation for RlnWalletManager.
 *
 * The RLN WASM wallet does not have a built-in PSBT signer, so we delegate
 * to the standalone BDK-based signPsbt() from the crypto module, which
 * derives keys from the mnemonic on every call.
 */

import type { ISigner, Network, EstimateFeeResult } from '@utexo/rgb-sdk-core';
import { signMessage, verifyMessage } from '@utexo/rgb-sdk-core';
import { signPsbt, estimatePsbt } from '../crypto/signer';

export class RlnSigner implements ISigner {
  async signPsbtWithMnemonic(
    mnemonic: string,
    psbt: string,
    network: Network
  ): Promise<string> {
    return signPsbt(mnemonic, psbt, network);
  }

  async signPsbtWithSeed(
    _seed: Uint8Array,
    _psbt: string,
    _network: Network
  ): Promise<string> {
    throw new Error('Seed-based signing is not supported for RLN wallet. Use mnemonic instead.');
  }

  async signMessage(params: {
    message: string | Uint8Array;
    seed: Uint8Array;
    network: Network;
  }): Promise<string> {
    return signMessage(params);
  }

  async verifyMessage(params: {
    message: string | Uint8Array;
    signature: string;
    accountXpub: string;
    network: Network;
  }): Promise<boolean> {
    return verifyMessage(params);
  }

  async estimateFee(psbt: string): Promise<EstimateFeeResult> {
    return estimatePsbt(psbt);
  }
}
