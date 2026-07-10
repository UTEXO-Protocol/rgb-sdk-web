/**
 * RlnWalletManager — BaseWalletManager implementation backed by RlnWasmBinding.
 *
 * Wraps the full RLN SDK surface (RGB wallet + optional Lightning node) behind
 * the IWalletManager interface, adding Lightning-specific extras.
 */

import { BaseWalletManager, deriveKeysFromMnemonic } from '@utexo/rgb-sdk-core';
import { ValidationError, logger, normalizeNetwork } from '@utexo/rgb-sdk-core';
import type {
  WalletInitParams,
  SendAssetBeginRequestModel,
  SendResult,
  SendBtcBeginRequestModel,
} from '@utexo/rgb-sdk-core';
import type {
  IRlnNodeBinding,
  SendRgbFromGroupsRequest,
  SendRgbFromGroupsResult,
} from '../rln';
import { RlnWasmBinding } from '../binding/RlnWasmBinding';
import type { RlnBindingCreateParams } from '../binding/RlnWasmBinding';
import { DEFAULT_INDEXER_URLS, getRlnUrls } from '../binding/RlnDefaults';
import { RlnSigner } from '../signer/RlnSigner';

export interface RlnWalletInitParams extends Partial<WalletInitParams> {
  /** Mnemonic — required */
  mnemonic: string;
  /** SDK password — required for RlnWasmSdk.initValue / unlock */
  password: string;
  /** Bitcoin network (default: 'utexo') */
  network?: string;
  /** WebSocket proxy URL for the Lightning node — enables createNodeHandle.
   *  Defaults to the network's DEFAULT_RLN_URLS entry (regtest/utexo); on
   *  networks without a default, omitting it means no Lightning node. */
  proxyUrl?: string;
  /** RGB proxy transport endpoint (HTTP) — used for setDefaultRgbProxyTransport
   *  and RGB consignment delivery. Defaults to the network's DEFAULT_RLN_URLS
   *  entry (regtest/utexo). */
  transportEndpoint?: string;
  /** Stable runtime ID for persistent node state across page reloads */
  nodeRuntimeId?: string;
  /** Indexer URL for goOnline. Defaults per network (DEFAULT_RLN_URLS →
   *  DEFAULT_INDEXER_URLS). create() always attempts to go online with the
   *  resolved URL (mirrors the RN SDK's unlock UX); if the indexer is
   *  unreachable the wallet is returned OFFLINE with a warning logged — call
   *  goOnline() to retry before network operations. */
  indexerUrl?: string;
  /** Skip the indexer consistency check when auto-connecting (recommended on
   *  regtest, where the full check can hang on a fresh esplora wallet). */
  skipConsistencyCheck?: boolean;
  /** Local directory for wallet DB (default: auto-generated in-memory path) */
  dataDir?: string;
  /** Asset schemas to support (default: ['Nia', 'Ifa']) */
  supportedSchemas?: string[];
  /** Enable virtual channels v0 on the Lightning node (default: true).
   *  Applies node-wide to all peers; persisted per nodeRuntimeId. */
  enableVirtualChannels?: boolean;
  /** utexo-lsp HTTP base URL — enables `UTEXOWallet.createLsp()` auto-discovery. */
  lspBaseUrl?: string;
  /** Bearer token for utexo-lsp APay/internal routes. */
  lspBearerToken?: string;
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

    const network = String(params.network ?? 'utexo');

    // Network-dependent URL defaults: explicit param → DEFAULT_RLN_URLS →
    // DEFAULT_INDEXER_URLS (indexer only; proxy/transport stay unset on
    // networks without an RLN default, meaning no Lightning node).
    const urls = getRlnUrls(network);
    const proxyUrl = params.proxyUrl ?? urls?.proxyUrl;
    const transportEndpoint =
      params.transportEndpoint ?? urls?.transportEndpoint;
    const indexerUrl =
      params.indexerUrl ??
      urls?.indexerUrl ??
      DEFAULT_INDEXER_URLS[normalizeNetwork(network)] ??
      DEFAULT_INDEXER_URLS.utexo;

    // Derive xpubs so BaseWalletManager gets the required account keys
    const keys =
      params.xpubVan && params.xpubCol && params.masterFingerprint
        ? {
            accountXpubVanilla: params.xpubVan,
            accountXpubColored: params.xpubCol,
            masterFingerprint: params.masterFingerprint,
          }
        : await deriveKeysFromMnemonic(network, params.mnemonic);

    const bindingParams: RlnBindingCreateParams = {
      mnemonic: params.mnemonic,
      password: params.password,
      network,
      dataDir: params.dataDir,
      maxAllocationsPerUtxo: params.maxAllocationsPerUtxo,
      vanillaKeychain: params.vanillaKeychain,
      proxyUrl,
      transportEndpoint,
      nodeRuntimeId: params.nodeRuntimeId,
      supportedSchemas: params.supportedSchemas,
      enableVirtualChannels: params.enableVirtualChannels,
    };

    const fullParams: WalletInitParams = {
      ...params,
      xpubVan: keys.accountXpubVanilla,
      xpubCol: keys.accountXpubColored,
      masterFingerprint: keys.masterFingerprint,
      network,
    };

    const binding = await RlnWasmBinding.create(bindingParams);
    const manager = new RlnWalletManager(fullParams, binding);

    // Auto-online (RN-style UX: no separate goOnline call). Safe at this
    // point: the wallet is not yet attached to the LN node, so goOnlineValue's
    // held RefCell borrow cannot collide with node runtime ticks (attach is
    // deferred to first LN use). Non-fatal by design — an unreachable indexer
    // must not break wallet creation/restore; goOnline() retries.
    try {
      await manager.goOnline(indexerUrl, params.skipConsistencyCheck ?? false);
    } catch (e) {
      logger.warn(
        `RlnWalletManager.create: auto goOnline failed (wallet stays offline; call goOnline() to retry). indexer=${indexerUrl}`,
        e
      );
    }
    return manager;
  }

  async initialize(): Promise<void> {
    // No-op — wallet is ready after RlnWasmBinding.create()
  }

  async goOnline(
    indexerUrl?: string,
    skipConsistencyCheck = false
  ): Promise<void> {
    await this.rlnBinding.connect(indexerUrl, skipConsistencyCheck);
  }

  /** Whether the wallet is connected to an indexer (create() auto-connects;
   *  false means the auto-connect failed — call goOnline() to retry). */
  isOnline(): boolean {
    return this.rlnBinding.isOnline();
  }

  // Override BaseWalletManager: it calls binding.syncWallet()/refreshWallet()
  // WITHOUT awaiting (the IRgbLibBinding signature is `void`). The RLN binding's
  // sync/refresh hold a wasm RefCell borrow across an await, so they MUST be
  // awaited or a following wallet op panics ("RefCell already borrowed").
  async syncWallet(): Promise<void> {
    await this.rlnBinding.syncWallet();
  }

  async refreshWallet(): Promise<void> {
    await this.rlnBinding.refreshWallet();
  }

  /** Returns the Lightning node binding, or null if no proxyUrl was configured. */
  getLightningNode(): IRlnNodeBinding | null {
    return this.rlnBinding.getLightningNode();
  }

  /** Attach the wallet to the LN node (otherwise lazy on first node use).
   *  Call after on-chain wallet setup (funding/createUtxos) to avoid a
   *  "RefCell already borrowed" panic from the node runtime. */
  attachLightningNode(): void {
    this.rlnBinding.attachLightningNode();
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
  async sendRgbFromGroups(
    params: SendRgbFromGroupsRequest
  ): Promise<SendRgbFromGroupsResult> {
    return this.rlnBinding.sendRgbFromGroups(params);
  }
}

export async function createRlnWalletManager(
  params: RlnWalletInitParams
): Promise<RlnWalletManager> {
  return RlnWalletManager.create(params);
}
