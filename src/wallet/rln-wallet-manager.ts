/**
 * RlnWalletManager — the RGB wallet + Lightning node layer, backed by
 * RlnWasmBinding. `UTEXOWallet` composes this and exposes the shared
 * `IUTEXOProtocol` contract.
 *
 * Every public method is `async` so validation and disposal failures surface
 * as promise rejections, not synchronous throws — a call site's `.catch()`
 * then behaves the same whichever way the call fails.
 */

import {
  ValidationError,
  WalletError,
  logger,
  normalizeNetwork,
  seedFromMnemonic,
} from '@utexo/rgb-sdk-core';
import type {
  UTEXOWalletCreateParams,
  BitcoinNetwork,
  Network,
  BtcBalance,
  Unspent,
  ListAssets,
  AssetBalance,
  AssetNIA,
  AssetIfa,
  Transaction,
  Transfer,
  InvoiceRequest,
  InvoiceReceiveData,
  InvoiceData,
  IssueAssetNiaRequestModel,
  IssueAssetIfaRequestModel,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  OperationResult,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  FailTransfersRequest,
  WalletBackupResponse,
  VssBackupConfig,
  VssBackupInfo,
  GetFeeEstimationResponse,
  EstimateFeeResult,
} from '@utexo/rgb-sdk-core';
import type {
  IRlnNodeBinding,
  PendingFundingRequest,
  BuildFundingTxParams,
  FundingTx,
  SubmitFundingParams,
  SendRgbFromGroupsRequest,
  SendRgbFromGroupsResult,
} from '../rln';
import { RlnWasmBinding } from '../binding/RlnWasmBinding';
import type { RlnBindingCreateParams } from '../binding/RlnWasmBinding';
import { DEFAULT_INDEXER_URLS, getRlnUrls } from '../binding/RlnDefaults';
import { RlnSigner } from '../signer/RlnSigner';

/**
 * Default on-chain fee rate (sat/vB) for SDK-built transactions.
 *
 * Mirrors the native daemon's `FEE_RATE` (`rgb-lightning-node/src/core_types.rs`,
 * the default for `[rgb] fee_rate_sat_vb`), so a channel funded from the browser
 * pays what a channel funded by the node would.
 */
export const DEFAULT_FEE_RATE_SAT_VB = 7;

/**
 * Web wallet params — the shared contract (`UTEXOWalletCreateParams`) plus the
 * rgb-lib-era optionals (`xpubVan`/`xpubCol`/`masterFingerprint`/
 * `maxAllocationsPerUtxo`/`vanillaKeychain`) that web still uses.
 */
export interface RlnWalletInitParams extends UTEXOWalletCreateParams {
  // rgb-lib-era fields web reads — declared explicitly rather than inherited
  // from the old rgb-lib parameter bag.

  /** Vanilla (BTC) account xpub. Derived from the mnemonic when omitted. */
  xpubVan?: string;
  /** Coloured (RGB) account xpub. Derived from the mnemonic when omitted. */
  xpubCol?: string;
  /** Master fingerprint. Derived from the mnemonic when omitted. */
  masterFingerprint?: string;
  /** rgb-lib wallet tuning — passed through to the wasm binding. */
  maxAllocationsPerUtxo?: number;
  /** rgb-lib keychain index for the vanilla wallet. */
  vanillaKeychain?: number | null;

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
  /**
   * On-chain fee rate (sat/vB) for transactions this SDK builds on the
   * wallet's behalf — today, the Lightning channel funding transaction.
   *
   * This is the web analogue of the native daemon's `[rgb] fee_rate_sat_vb`
   * (`config/mod.rs`, default `FEE_RATE = 7`), and it is a **wallet-level**
   * setting for the same reason it is node-level there: `openChannel` takes no
   * fee argument on either platform, and adding one to `OpenChannelParams`
   * would put a field in the shared contract that rn cannot honour.
   * The native node funds channels from its own config; web has no node, so
   * the wallet holds it instead. Default {@link DEFAULT_FEE_RATE_SAT_VB}.
   */
  feeRateSatVb?: number;
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

/**
 * `binding` and `signer` are required and non-null, so the delegations below
 * cannot fail on a missing dependency.
 */
export class RlnWalletManager {
  private readonly rlnBinding: RlnWasmBinding;
  private readonly signer: RlnSigner;

  private readonly xpubVan: string;
  private readonly xpubCol: string;
  private mnemonic: string | null;
  private seed: Uint8Array | null;
  private readonly network: Network;
  private disposed = false;

  /** Resolved indexer target for the unlock-time auto-connect. */
  private autoOnline: {
    indexerUrl: string;
    skipConsistencyCheck: boolean;
  } | null = null;

  private constructor(params: RlnWalletInitParams, binding: RlnWasmBinding) {
    if (!params.xpubVan) {
      throw new ValidationError('xpubVan is required', 'xpubVan');
    }
    if (!params.xpubCol) {
      throw new ValidationError('xpubCol is required', 'xpubCol');
    }

    this.rlnBinding = binding;
    this.signer = new RlnSigner();
    this.network = normalizeNetwork(params.network ?? 'regtest');
    this.xpubVan = params.xpubVan;
    this.xpubCol = params.xpubCol;
    this.mnemonic = params.mnemonic ?? null;
    this.seed = params.mnemonic ? seedFromMnemonic(params.mnemonic) : null;
  }

  // ── Lifecycle & state ───────────────────────────────────────────────────────

  getXpub(): { xpubVan: string; xpubCol: string } {
    return { xpubVan: this.xpubVan, xpubCol: this.xpubCol };
  }

  getNetwork(): Network {
    return this.network;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.mnemonic = null;
    if (this.seed) {
      this.seed.fill(0);
      this.seed = null;
    }
    this.rlnBinding.dropWallet();
    this.disposed = true;
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new WalletError('Wallet has been disposed');
    }
  }

  // ── Binding delegations ─────────────────────────────────────────────────────

  async getBtcBalance(): Promise<BtcBalance> {
    this.ensureNotDisposed();
    return this.rlnBinding.getBtcBalance();
  }

  async getAddress(): Promise<string> {
    this.ensureNotDisposed();
    return this.rlnBinding.getAddress();
  }

  async rotateVanillaAddress(): Promise<string> {
    this.ensureNotDisposed();
    return this.rlnBinding.rotateVanillaAddress();
  }

  async rotateColoredAddress(): Promise<string> {
    this.ensureNotDisposed();
    return this.rlnBinding.rotateColoredAddress();
  }

  async listUnspents(): Promise<Unspent[]> {
    this.ensureNotDisposed();
    return this.rlnBinding.listUnspents();
  }

  async createUtxosBegin(
    params: CreateUtxosBeginRequestModel
  ): Promise<string> {
    this.ensureNotDisposed();
    return this.rlnBinding.createUtxosBegin(params);
  }

  async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    this.ensureNotDisposed();
    return this.rlnBinding.createUtxosEnd(params);
  }

  async listAssets(): Promise<ListAssets> {
    this.ensureNotDisposed();
    return this.rlnBinding.listAssets();
  }

  async getAssetBalance(assetId: string): Promise<AssetBalance> {
    this.ensureNotDisposed();
    return this.rlnBinding.getAssetBalance(assetId);
  }

  async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    this.ensureNotDisposed();
    return this.rlnBinding.issueAssetNia(params);
  }

  async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<AssetIfa> {
    this.ensureNotDisposed();
    return this.rlnBinding.issueAssetIfa(params);
  }

  async inflateBegin(params: InflateAssetIfaRequestModel): Promise<string> {
    this.ensureNotDisposed();
    return this.rlnBinding.inflateBegin(params);
  }

  async inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
    this.ensureNotDisposed();
    return this.rlnBinding.inflateEnd(params);
  }

  async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    this.ensureNotDisposed();
    return this.rlnBinding.sendBegin(params);
  }

  async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    this.ensureNotDisposed();
    return this.rlnBinding.sendEnd(params);
  }

  async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    this.ensureNotDisposed();
    return this.rlnBinding.sendBtcBegin(params);
  }

  async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    this.ensureNotDisposed();
    return this.rlnBinding.sendBtcEnd(params);
  }

  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    this.ensureNotDisposed();
    return this.rlnBinding.blindReceive(params);
  }

  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    this.ensureNotDisposed();
    return this.rlnBinding.witnessReceive(params);
  }

  async decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
    this.ensureNotDisposed();
    return this.rlnBinding.decodeRGBInvoice(params);
  }

  async listTransactions(): Promise<Transaction[]> {
    this.ensureNotDisposed();
    return this.rlnBinding.listTransactions();
  }

  async listTransfers(assetId?: string): Promise<Transfer[]> {
    this.ensureNotDisposed();
    return this.rlnBinding.listTransfers(assetId);
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    this.ensureNotDisposed();
    return this.rlnBinding.failTransfers(params);
  }

  async createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse> {
    this.ensureNotDisposed();
    return this.rlnBinding.createBackup(params);
  }

  async configureVssBackup(config: VssBackupConfig): Promise<void> {
    this.ensureNotDisposed();
    this.rlnBinding.configureVssBackup(config);
  }

  async disableVssAutoBackup(): Promise<void> {
    this.ensureNotDisposed();
    this.rlnBinding.disableVssAutoBackup();
  }

  // ── Channel funding (web-only) ──────────────────────────────────────────────
  //
  // `openChannel` only gets LDK to FundingGenerationReady; the app funds the
  // channel itself. rn's node does this internally and needs none of it.

  async listPendingFundingRequests(): Promise<PendingFundingRequest[]> {
    this.ensureNotDisposed();
    return this.rlnBinding.listPendingFundingRequests();
  }

  async buildLightningFundingTx(
    params: BuildFundingTxParams
  ): Promise<FundingTx> {
    this.ensureNotDisposed();
    return this.rlnBinding.buildLightningFundingTx(params);
  }

  async submitFundingTransaction(params: SubmitFundingParams): Promise<void> {
    this.ensureNotDisposed();
    return this.rlnBinding.submitFundingTransaction(params);
  }

  async vssBackup(config: VssBackupConfig): Promise<number> {
    this.ensureNotDisposed();
    return this.rlnBinding.vssBackup(config);
  }

  async vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo> {
    this.ensureNotDisposed();
    return this.rlnBinding.vssBackupInfo(config);
  }

  async estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
    this.ensureNotDisposed();
    if (!Number.isInteger(blocks) || blocks <= 0) {
      throw new ValidationError('blocks must be a positive integer', 'blocks');
    }
    return this.rlnBinding.getFeeEstimation({ blocks });
  }

  async estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
    this.ensureNotDisposed();
    return this.signer.estimateFee(psbtBase64);
  }

  // ── Signing ─────────────────────────────────────────────────────────────────

  async signMessage(message: string): Promise<string> {
    this.ensureNotDisposed();
    if (!message) {
      throw new ValidationError('message is required', 'message');
    }
    if (!this.seed) {
      throw new WalletError(
        'Wallet seed is required for message signing. Initialize the wallet with a mnemonic.'
      );
    }
    return this.signer.signMessage({
      message,
      seed: this.seed,
      network: this.network,
    });
  }

  async verifyMessage(
    message: string,
    signature: string,
    accountXpub?: string
  ): Promise<boolean> {
    if (!message) {
      throw new ValidationError('message is required', 'message');
    }
    if (!signature) {
      throw new ValidationError('signature is required', 'signature');
    }
    return this.signer.verifyMessage({
      message,
      signature,
      accountXpub: accountXpub ?? this.xpubVan,
      network: this.network,
    });
  }

  async signPsbt(psbt: string, mnemonic?: string): Promise<string> {
    this.ensureNotDisposed();
    const mnemonicToUse = mnemonic ?? this.mnemonic;
    if (mnemonicToUse) {
      return this.signer.signPsbtWithMnemonic(
        mnemonicToUse,
        psbt,
        this.network
      );
    }
    if (this.seed) {
      return this.signer.signPsbtWithSeed(this.seed, psbt, this.network);
    }
    throw new WalletError(
      'mnemonic is required. Provide it as a parameter or initialize the wallet with one.'
    );
  }

  // ── Compound operations: begin → sign → end ─────────────────────────────────

  async send(
    params: SendAssetBeginRequestModel,
    mnemonic?: string
  ): Promise<SendResult> {
    const psbt = await this.sendBegin(params);
    return this.sendEnd({ signedPsbt: await this.signPsbt(psbt, mnemonic) });
  }

  async sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    const psbt = await this.sendBtcBegin(params);
    return this.sendBtcEnd({ signedPsbt: await this.signPsbt(psbt) });
  }

  async createUtxos(params: {
    upTo?: boolean;
    num?: number;
    size?: number;
    feeRate?: number;
  }): Promise<number> {
    const psbt = await this.createUtxosBegin(params);
    return this.createUtxosEnd({ signedPsbt: await this.signPsbt(psbt) });
  }

  async inflate(
    params: InflateAssetIfaRequestModel,
    mnemonic?: string
  ): Promise<OperationResult> {
    const psbt = await this.inflateBegin(params);
    return this.inflateEnd({ signedPsbt: await this.signPsbt(psbt, mnemonic) });
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

    const fullParams: RlnWalletInitParams = {
      ...params,
      xpubVan: keys.accountXpubVanilla,
      xpubCol: keys.accountXpubColored,
      masterFingerprint: keys.masterFingerprint,
      network: network as BitcoinNetwork,
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
    // No-op — the real phases are create()/unlock().
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

  // MUST be awaited — a fire-and-forget sync/refresh can collide with the next
  // wallet op on the shared wasm RefCell and panic ("RefCell already borrowed").
  async syncWallet(): Promise<void> {
    await this.rlnBinding.syncWallet();
  }

  async refreshWallet(): Promise<void> {
    await this.refreshWalletChanged();
  }

  /** Like refreshWallet(), but reports whether any transfer changed status
   *  this pass. */
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
