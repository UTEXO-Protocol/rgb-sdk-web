/**
 * RlnWalletManager — BaseWalletManager implementation backed by RlnWasmBinding.
 *
 * Wraps the full RLN SDK surface (RGB wallet + optional Lightning node) behind
 * the IWalletManager interface, adding Lightning-specific extras.
 */

import { BaseWalletManager } from '@utexo/rgb-sdk-core';
import { ValidationError, logger, normalizeNetwork } from '@utexo/rgb-sdk-core';
import type {
  WalletInitParams,
  UTEXOWalletCreateParams,
  BitcoinNetwork,
  SendAssetBeginRequestModel,
  SendResult,
  SendBtcBeginRequestModel,
  VssBackupConfig,
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

/**
 * Web wallet params.
 *
 * Extends the shared contract (`UTEXOWalletCreateParams`) plus the still-used
 * rgb-lib-era optionals (`xpubVan`/`xpubCol`/`masterFingerprint`/
 * `maxAllocationsPerUtxo`/`vanillaKeychain`) — the migration plan assumed those
 * were dead; they are not.
 */
export interface RlnWalletInitParams
  extends UTEXOWalletCreateParams, Partial<WalletInitParams> {
  /** Mnemonic — required */
  mnemonic: string;
  /** SDK password — required for RlnWasmSdk.initValue / unlock */
  password: string;
  /** Bitcoin network (default: 'utexo') */
  network?: BitcoinNetwork;
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
  /** Relay auth for the WS gateway (production wasm-proxy-gateway rejects
   *  unauthenticated relay upgrades with 401). Defaults to the network's
   *  DEFAULT_RLN_URLS entry (utexo); pass `null` to send none. */
  relayAuthToken?: string | null;
  relayNodeId?: string | null;
  /** Indexer URL for goOnline. Defaults per network (DEFAULT_RLN_URLS →
   *  DEFAULT_INDEXER_URLS). create() always attempts to go online with the
   *  resolved URL (mirrors the RN SDK's unlock UX); if the indexer is
   *  unreachable the wallet is returned OFFLINE with a warning logged — call
   *  goOnline() to retry before network operations. */
  indexerUrl?: string;
  /** Skip the indexer consistency check when auto-connecting (recommended on
   *  regtest, where the full check can hang on a fresh esplora wallet). */
  skipConsistencyCheck?: boolean;
  /** VSS server URL for cloud backup (RN-parity param). Defaults to
   *  DEFAULT_VSS_SERVER_URL — the wallet-stream backup is configured
   *  automatically at init() with an identity derived from the mnemonic
   *  (storeId = wallet_<masterFingerprint>). Pass `null` to disable VSS.
   *  Restore is never automatic — call restoreFromVss() in the init→unlock
   *  gap. */
  vssUrl?: string | null;
  /** Internal (UTEXOWallet.init() fills this) — the mnemonic-derived VSS
   *  identity for the binding. The LDK/channel stream must be configured on
   *  the node handle BEFORE its runtime starts. */
  vssConfig?: VssBackupConfig | null;
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
  /** Resolved indexer target for the unlock-time auto-connect. */
  private autoOnline: {
    indexerUrl: string;
    skipConsistencyCheck: boolean;
  } | null = null;

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

    const urls = getRlnUrls(network);
    const proxyUrl = params.proxyUrl ?? urls?.proxyUrl;
    const transportEndpoint =
      params.transportEndpoint ?? urls?.transportEndpoint;
    // null = explicitly no auth; undefined = network default.
    const relayAuthToken =
      params.relayAuthToken === null
        ? undefined
        : (params.relayAuthToken ?? urls?.relayAuthToken);
    const relayNodeId =
      params.relayNodeId === null
        ? undefined
        : (params.relayNodeId ?? urls?.relayNodeId);
    const indexerUrl =
      params.indexerUrl ??
      urls?.indexerUrl ??
      DEFAULT_INDEXER_URLS[normalizeNetwork(network)] ??
      DEFAULT_INDEXER_URLS.utexo;

    const bindingParams: RlnBindingCreateParams = {
      mnemonic: params.mnemonic,
      password: params.password,
      network,
      dataDir: params.dataDir,
      maxAllocationsPerUtxo: params.maxAllocationsPerUtxo,
      vanillaKeychain: params.vanillaKeychain,
      proxyUrl,
      transportEndpoint,
      relayAuthToken,
      relayNodeId,
      nodeRuntimeId: params.nodeRuntimeId,
      supportedSchemas: params.supportedSchemas,
      enableVirtualChannels: params.enableVirtualChannels,
      vss: params.vssConfig
        ? {
            serverUrl: params.vssConfig.serverUrl,
            storeId: params.vssConfig.storeId,
            signingKeyHex: params.vssConfig.signingKey,
          }
        : null,
    };

    const binding = await RlnWasmBinding.create(bindingParams);

    // Explicit keys win; otherwise reuse the binding's (derived once in wasm).
    const keys =
      params.xpubVan && params.xpubCol && params.masterFingerprint
        ? {
            accountXpubVanilla: params.xpubVan,
            accountXpubColored: params.xpubCol,
            masterFingerprint: params.masterFingerprint,
          }
        : binding.getKeys();

    const fullParams: WalletInitParams = {
      ...params,
      xpubVan: keys.accountXpubVanilla,
      xpubCol: keys.accountXpubColored,
      masterFingerprint: keys.masterFingerprint,
      network,
    };

    const manager = new RlnWalletManager(fullParams, binding);
    manager.autoOnline = {
      indexerUrl,
      skipConsistencyCheck: params.skipConsistencyCheck ?? false,
    };
    return manager;
  }

  /** Phase 2, step 1: sdk.unlock (password check + runtime authorization) +
   *  LDK VSS configure (guarded channel restore, pre-runtime) — no network.
   *  The RGB wallet object exists since create(); this releases its gate. */
  async unlockWallet(): Promise<void> {
    await this.rlnBinding.unlockWallet();
  }

  /** Phase 2, step 2: non-fatal indexer auto-connect (goOnline() retries a
   *  failure) + node attach inside connect(). Idempotent. */
  async autoGoOnline(): Promise<void> {
    if (this.isOnline()) return;
    const { indexerUrl, skipConsistencyCheck } = this.autoOnline ?? {};
    try {
      await this.goOnline(indexerUrl, skipConsistencyCheck ?? false);
    } catch (e) {
      logger.warn(
        `RlnWalletManager.autoGoOnline: goOnline failed (wallet stays offline; call goOnline() to retry). indexer=${indexerUrl}`,
        e
      );
    }
  }

  /** Full phase 2 for direct manager users. */
  async unlock(): Promise<void> {
    await this.unlockWallet();
    await this.autoGoOnline();
  }

  async initialize(): Promise<void> {
    // No-op (abstract in the base) — the real phases are create()/unlock().
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

  // Override: the base doesn't await binding sync/refresh (void interface),
  // but they MUST be awaited — a fire-and-forget call can collide with the
  // next wallet op on the shared wasm RefCell and panic ("RefCell already
  // borrowed").
  async syncWallet(): Promise<void> {
    await this.rlnBinding.syncWallet();
  }

  async refreshWallet(): Promise<void> {
    await this.refreshWalletChanged();
  }

  /** Like refreshWallet(), but reports whether any transfer changed status
   *  this pass (the base IWalletManager signature is fixed to Promise<void>,
   *  so the signal needs its own method). */
  async refreshWalletChanged(): Promise<boolean> {
    return this.rlnBinding.refreshWallet();
  }

  /** Returns the Lightning node binding, or null if no proxyUrl was configured. */
  getLightningNode(): IRlnNodeBinding | null {
    return this.rlnBinding.getLightningNode();
  }

  /** Lightning node binding WITHOUT the lazy attach side effect — safe in the
   *  locked (pre-unlock) phase (see RlnWasmBinding.peekLightningNode). */
  peekLightningNode(): IRlnNodeBinding | null {
    return this.rlnBinding.peekLightningNode();
  }

  /** Stop LDK VSS replication and release the single-writer guards; resets
   *  the binding's configured latch so unlock() can re-run the configure. */
  disableLdkVssReplication(): void {
    this.rlnBinding.disableLdkVssReplication();
  }

  /** Attach the wallet to the LN node (otherwise lazy on first node use).
   *  Call after on-chain wallet setup (funding/createUtxos) to avoid a
   *  "RefCell already borrowed" panic from the node runtime. */
  attachLightningNode(): void {
    this.rlnBinding.attachLightningNode();
  }

  /** Returns the node's public key string, or null if no Lightning node is
   *  configured. Uses peek — reading the pubkey must not lazily attach the
   *  wallet/start the runtime (it works in the locked phase too). */
  getNodePubkey(): string | null {
    return this.rlnBinding.peekLightningNode()?.nodePubkey() ?? null;
  }

  /** Restore the wallet stream from VSS (requires configureVssBackup first).
   *  Overwrites local wallet state with the cloud snapshot. Works in the
   *  LOCKED init→unlock gap — that's the intended restore window. */
  vssRestoreBackup(): Promise<void> {
    return this.rlnBinding.vssRestoreBackup();
  }

  /** Error from the unlock-time configureLdkVssReplication attempt, or null. */
  getLdkVssInitError(): string | null {
    return this.rlnBinding.getLdkVssInitError();
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
