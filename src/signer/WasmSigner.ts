/**
 * WasmSigner — implements ISigner for the browser WASM SDK.
 *
 * For PSBT signing, delegates to the WasmWallet's built-in mnemonic-based
 * signer (wallet.sign_psbt) rather than using an external BDK wallet.
 * This avoids re-deriving keys and is the idiomatic WASM approach.
 *
 * signMessage / verifyMessage / estimateFee remain pure-JS via rgb-sdk-core
 * and bitcoinjs-lib (no WASM dependency).
 */

import type { ISigner } from '@utexo/rgb-sdk-core';
import type { Network, EstimateFeeResult } from '@utexo/rgb-sdk-core';
import { signMessage, verifyMessage } from '@utexo/rgb-sdk-core';
import { estimatePsbt } from '../crypto/signer';
import type { WasmRgbLibBinding } from '../binding/WasmRgbLibBinding';

export class WasmSigner implements ISigner {
  private readonly binding: WasmRgbLibBinding;

  constructor(binding: WasmRgbLibBinding) {
    this.binding = binding;
  }

  /**
   * Sign a PSBT using the wallet's built-in mnemonic-based signer.
   * The mnemonic param is ignored — it is already embedded in the WasmWallet.
   */
  async signPsbtWithMnemonic(
    _mnemonic: string,
    psbt: string,
    _network: Network
  ): Promise<string> {
    return this.binding.signPsbt(psbt);
  }

  /**
   * Sign a PSBT using the wallet's built-in signer.
   * The seed param is ignored — the wallet uses its embedded mnemonic.
   */
  async signPsbtWithSeed(
    _seed: Uint8Array,
    psbt: string,
    _network: Network
  ): Promise<string> {
    return this.binding.signPsbt(psbt);
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
