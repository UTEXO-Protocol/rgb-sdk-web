/**
 * RlnWalletManager — BaseWalletManager implementation backed by RlnWasmBinding.
 *
 * Wraps the full RLN SDK surface (RGB wallet + optional Lightning node) behind
 * the IWalletManager interface, adding Lightning-specific extras.
 */

import { BaseWalletManager, deriveKeysFromMnemonic } from '@utexo/rgb-sdk-core';
import { ValidationError } from '@utexo/rgb-sdk-core';
import type { WalletInitParams, SendAssetBeginRequestModel, SendResult, SendBtcBeginRequestModel } from '@utexo/rgb-sdk-core';
import type { IRlnNodeBinding, SendRgbFromGroupsRequest, SendRgbFromGroupsResult } from '@utexo/rgb-sdk-core';
import { RlnWasmBinding } from '../binding/RlnWasmBinding';
import type { RlnBindingCreateParams } from '../binding/RlnWasmBinding';
import { RlnSigner } from '../signer/RlnSigner';

export interface RlnWalletInitParams extends Partial<WalletInitParams> {
  /** Mnemonic — required */
  mnemonic: string;
  /** SDK password — required for RlnWasmSdk.initValue / unlock */
  password: string;
  /** Bitcoin network (default: 'regtest') */
  network?: string;
  /** WebSocket proxy URL for the Lightning node — enables createNodeHandle.
   *  If omitted, falls back to transportEndpoint for backwards compatibility. */
  proxyUrl?: string;
  /** RGB proxy transport endpoint (HTTP) — used for setDefaultRgbProxyTransport
   *  and RGB consignment delivery. When neither proxyUrl nor transportEndpoint
   *  is set, no Lightning node is created. */
  transportEndpoint?: string;
  /** Stable runtime ID for persistent node state across page reloads */
  nodeRuntimeId?: string;
  /** Local directory for wallet DB (default: auto-generated in-memory path) */
  dataDir?: string;
  /** Asset schemas to support (default: ['Nia', 'Ifa']) */
  supportedSchemas?: string[];
}

export class RlnWalletManager extends BaseWalletManager {
  private readonly rlnBinding: RlnWasmBinding;

  private constructor(params: WalletInitParams, binding: RlnWasmBinding) {
    super(params, binding, new RlnSigner());
    this.rlnBinding = binding;
  }

  static async create(params: RlnWalletInitParams): Promise<RlnWalletManager> {
    if (!params.mnemonic) {
      throw new ValidationError(
        'mnemonic is required to create an RlnWalletManager',
        'mnemonic'
      );
    }
    if (!params.password) {
      throw new ValidationError(
        'password is required to create an RlnWalletManager',
        'password'
      );
    }

    const network = String(params.network ?? 'regtest');

    // Derive xpubs so BaseWalletManager gets the required account keys
    const keys = params.xpubVan && params.xpubCol && params.masterFingerprint
      ? { accountXpubVanilla: params.xpubVan, accountXpubColored: params.xpubCol, masterFingerprint: params.masterFingerprint }
      : await deriveKeysFromMnemonic(network, params.mnemonic);

    const bindingParams: RlnBindingCreateParams = {
      mnemonic: params.mnemonic,
      password: params.password,
      network,
      dataDir: params.dataDir,
      maxAllocationsPerUtxo: params.maxAllocationsPerUtxo,
      vanillaKeychain: params.vanillaKeychain,
      proxyUrl: params.proxyUrl,
      transportEndpoint: params.transportEndpoint,
      nodeRuntimeId: params.nodeRuntimeId,
      supportedSchemas: params.supportedSchemas,
    };

    const fullParams: WalletInitParams = {
      ...params,
      xpubVan: keys.accountXpubVanilla,
      xpubCol: keys.accountXpubColored,
      masterFingerprint: keys.masterFingerprint,
      network,
    };

    const binding = await RlnWasmBinding.create(bindingParams);
    return new RlnWalletManager(fullParams, binding);
  }

  async initialize(): Promise<void> {
    // No-op — wallet is ready after RlnWasmBinding.create()
  }

  async goOnline(indexerUrl?: string, skipConsistencyCheck = false): Promise<void> {
    await this.rlnBinding.connect(indexerUrl, skipConsistencyCheck);
  }

  /** Returns the Lightning node binding, or null if no proxyUrl was configured. */
  getLightningNode(): IRlnNodeBinding | null {
    return this.rlnBinding.getLightningNode();
  }

  /** Returns the node's public key string, or null if no Lightning node is configured. */
  getNodePubkey(): string | null {
    return this.rlnBinding.getLightningNode()?.nodePubkey() ?? null;
  }

  /** Return raw backup bytes from the most recent createBackup call. */
  getLastBackupBytes(): Uint8Array | null {
    return this.rlnBinding.getLastBackupBytes();
  }

  /** Restore wallet state from raw backup bytes. */
  restoreFromBackupBytes(bytes: Uint8Array, password: string): void {
    this.rlnBinding.restoreFromBackupBytes(bytes, password);
  }

  /** Compound send: begin → external sign → end. */
  async sendWithSigner(
    params: SendAssetBeginRequestModel,
    signPsbt: (unsignedPsbt: string) => Promise<string>
  ): Promise<SendResult> {
    const psbt = await this.sendBegin(params);
    const signedPsbt = await signPsbt(psbt);
    return this.sendEnd({ signedPsbt });
  }

  /** Compound BTC send: begin → external sign → end. */
  async sendBtcWithSigner(
    params: SendBtcBeginRequestModel,
    signPsbt: (unsignedPsbt: string) => Promise<string>
  ): Promise<string> {
    const psbt = await this.sendBtcBegin(params);
    const signedPsbt = await signPsbt(psbt);
    return this.sendBtcEnd({ signedPsbt });
  }

  /** Send RGB assets via group-based routing. */
  async sendRgbFromGroups(params: SendRgbFromGroupsRequest): Promise<SendRgbFromGroupsResult> {
    return this.rlnBinding.sendRgbFromGroups(params);
  }
}

export async function createRlnWalletManager(
  params: RlnWalletInitParams
): Promise<RlnWalletManager> {
  return RlnWalletManager.create(params);
}
