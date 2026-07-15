/**
 * RlnWasmBinding — browser WASM implementation of IRlnSdkBinding.
 *
 * A single RlnWasmWallet handles all wallet operations; a direct RlnWasmNode
 * handles Lightning + asset issuance (HODL / fail-pending-payment exist only
 * on the direct node, not the SDK node handle).
 *
 * Split lifecycle: create() = all local setup, SDK stays locked (the wallet
 * object exists but ops are gated by the `unlocked` flag; VSS ops and
 * clearLdkVssFence work in this gap) → unlockWallet() = sdk.unlock + LDK
 * VSS configure → connect() = goOnline + node attach.
 */

import {
  RlnWasmSdk,
  RlnWasmWallet,
  RlnWasmNode,
  RlnWasmInvoice,
  rgbRestoreKeysValue,
} from '@utexo/rln-wasm';
import { initRlnWasm } from '../wasm/initRln';
import { WalletError, logger, normalizeNetwork } from '@utexo/rgb-sdk-core';
import { DEFAULT_INDEXER_URLS } from './RlnDefaults';
import type { IRlnSdkBinding } from '../rln';
import type { IRlnNodeBinding } from '../rln';
import type {
  BtcBalance,
  Unspent,
  ListAssets,
  AssetBalance,
  AssetNIA,
  AssetIfa,
  AssetCFA,
  Transaction,
  Transfer,
  InvoiceReceiveData,
  InvoiceData,
  SendResult,
  OperationResult,
  WalletBackupResponse,
  VssBackupConfig,
  VssBackupInfo,
  GetFeeEstimationResponse,
  RecipientMap,
  BatchRecipient,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  InvoiceRequest,
  IssueAssetNiaRequestModel,
  IssueAssetIfaRequestModel,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  FailTransfersRequest,
  Assignment,
  AssignmentType,
} from '@utexo/rgb-sdk-core';
import type {
  SendRgbFromGroupsRequest,
  SendRgbFromGroupsResult,
  RlnSdkInitParams,
  SwapMakerInitParams,
  SwapMakerInitResult,
  SwapInfo,
} from '../rln';
import type {
  RlnWalletData,
  RlnOnline,
  RlnRawBtcBalance,
  RlnRawBalance,
  RlnRawAssetNia,
  RlnRawAssetCfa,
  RlnRawListAssets,
  RlnRawTransfer,
  RlnRawTransaction,
  RlnRawInvoiceReceiveData,
  RlnRawUnspent,
  RlnRawSendResult,
  RlnRawAssetBalance,
  RlnRawTransportEndpoint,
} from './RlnWasmTypes';

// ─── Params ───────────────────────────────────────────────────────────────────

export interface RlnBindingCreateParams {
  /** mnemonic for the wallet */
  mnemonic: string;
  /** password for sdk.initValue / sdk.unlock */
  password: string;
  /** bitcoin network: 'mainnet' | 'testnet' | 'regtest' | 'signet' | 'utexo' */
  network: string;
  /** local directory for wallet DB (in WASM context this is an in-memory path) */
  dataDir?: string;
  /** max UTXOs per allocation slot */
  maxAllocationsPerUtxo?: number;
  /** vanilla keychain index (null = default) */
  vanillaKeychain?: number | null;
  /** WebSocket proxy URL for the Lightning node — enables createNodeHandle */
  proxyUrl?: string;
  /** RGB proxy transport endpoint (HTTP) — passed to sdk.setDefaultRgbProxyTransport */
  transportEndpoint?: string;
  /** stable runtime ID for persistent node state across reloads */
  nodeRuntimeId?: string;
  /** WS gateway relay auth (appended as auth_token/node_id query params on
   *  every relay URL) — required by production wasm-proxy-gateway deployments */
  relayAuthToken?: string;
  relayNodeId?: string;
  /** enable virtual channels v0 (default: true) */
  enableVirtualChannels?: boolean;
  /** asset schemas to support (default: ['Nia', 'Ifa']) */
  supportedSchemas?: string[];
  /** VSS identity (shared by both streams). The binding only configures the
   *  LDK stream (pre-runtime, at unlockWallet(); the wasm side appends
   *  `-ldk` to storeId); the wallet stream is the owner's configureVssBackup
   *  call. */
  vss?: {
    serverUrl: string;
    storeId: string;
    signingKeyHex: string;
  } | null;
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function mapNetwork(network: string): string {
  const map: Record<string, string> = {
    mainnet: 'Mainnet',
    testnet: 'Testnet',
    testnet4: 'Testnet4',
    signet: 'Signet',
    utexo: 'Signet',
    regtest: 'Regtest',
  };
  return map[String(network).toLowerCase()] ?? 'Regtest';
}

function normalizeBalance(b: RlnRawBalance | undefined): BtcBalance['vanilla'] {
  return {
    settled: Number(b?.settled ?? 0),
    future: Number(b?.future ?? 0),
    spendable: Number(b?.spendable ?? 0),
  };
}

function normalizeBtcBalance(raw: unknown): BtcBalance {
  const r = raw as RlnRawBtcBalance;
  return {
    vanilla: normalizeBalance(r?.vanilla),
    colored: normalizeBalance(r?.colored),
  };
}

function normalizeAssetBalance(raw: unknown): AssetBalance {
  const r = raw as RlnRawAssetBalance;
  return {
    settled: Number(r?.settled ?? 0),
    future: Number(r?.future ?? 0),
    spendable: Number(r?.spendable ?? 0),
    offchainOutbound: Number(r?.offchain_outbound ?? 0),
    offchainInbound: Number(r?.offchain_inbound ?? 0),
  };
}

// rgb-lib serializes assets snake_case (the wasm build does not enable its
// `camel_case` feature — CI: `wasm-pack build --target web`, no --features).
function normalizeAssetNia(a: RlnRawAssetNia): AssetNIA {
  return {
    assetId: String(a.asset_id ?? ''),
    ticker: String(a.ticker ?? ''),
    name: String(a.name ?? ''),
    details: (a.details ?? null) as string | null,
    precision: Number(a.precision ?? 0),
    issuedSupply: Number(a.issued_supply ?? 0),
    timestamp: Number(a.timestamp ?? 0),
    addedAt: Number(a.added_at ?? 0),
    balance: normalizeBalance(a.balance),
  };
}

function normalizeAssetCfa(a: RlnRawAssetCfa): AssetCFA {
  return {
    assetId: String(a.asset_id ?? ''),
    name: String(a.name ?? ''),
    details: (a.details ?? undefined) as string | undefined,
    precision: Number(a.precision ?? 0),
    issuedSupply: Number(a.issued_supply ?? 0),
    timestamp: Number(a.timestamp ?? 0),
    addedAt: Number(a.added_at ?? 0),
    balance: normalizeBalance(a.balance),
  };
}

function normalizeListAssets(raw: unknown): ListAssets {
  const r = raw as RlnRawListAssets;
  return {
    nia: (r.nia ?? []).map(normalizeAssetNia),
    cfa: (r.cfa ?? []).map(normalizeAssetCfa),
    uda: [],
    ifa: [],
  };
}

function parseAssignment(raw: unknown): Assignment {
  if (typeof raw === 'string') return { type: raw as AssignmentType };
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if ('Fungible' in o)
      return { type: 'Fungible', amount: Number(o.Fungible) };
    if ('InflationRight' in o)
      return { type: 'InflationRight', amount: Number(o.InflationRight) };
    if ('NonFungible' in o) return { type: 'NonFungible' };
    if ('ReplaceRight' in o) return { type: 'ReplaceRight' };
  }
  return { type: 'Any' };
}

function normalizeTransfer(raw: RlnRawTransfer): Transfer {
  const eps = (raw.transport_endpoints ?? []) as RlnRawTransportEndpoint[];
  const req = raw.requested_assignment;
  return {
    idx: Number(raw.idx ?? 0),
    batchTransferIdx: Number(raw.batch_transfer_idx ?? 0),
    createdAt: Number(raw.created_at ?? 0),
    updatedAt: Number(raw.updated_at ?? 0),
    status: (raw.status ?? 'WaitingCounterparty') as Transfer['status'],
    requestedAssignment: req != null ? parseAssignment(req) : undefined,
    assignments: ((raw.assignments ?? []) as unknown[]).map(parseAssignment),
    kind: (raw.kind ?? 'Send') as Transfer['kind'],
    txid: (raw.txid ?? undefined) as string | undefined,
    recipientId: (raw.recipient_id ?? undefined) as string | undefined,
    receiveUtxo: (raw.receive_utxo ?? undefined) as Transfer['receiveUtxo'],
    changeUtxo: (raw.change_utxo ?? undefined) as Transfer['changeUtxo'],
    expiration: (raw.expiration ?? undefined) as number | undefined,
    transportEndpoints: eps.map((te) => ({
      endpoint: String(te.endpoint ?? ''),
      transportType: String(te.transport_type ?? ''),
      used: Boolean(te.used),
    })),
    invoiceString: (raw.invoice_string ?? undefined) as string | undefined,
    consignmentPath: undefined,
  };
}

function normalizeTransaction(raw: RlnRawTransaction): Transaction {
  const ct = raw.confirmation_time;
  return {
    transactionType: raw.transaction_type as Transaction['transactionType'],
    txid: String(raw.txid ?? ''),
    received: Number(raw.received ?? 0),
    sent: Number(raw.sent ?? 0),
    fee: Number(raw.fee ?? 0),
    confirmationTime: ct
      ? { height: Number(ct.height ?? 0), timestamp: Number(ct.timestamp ?? 0) }
      : undefined,
  };
}

/** rgb-lib refresh returns a map of batch-transfer idx → RefreshedTransfer
 *  (serde_wasm_bindgen emits a JS Map; handle a plain object defensively).
 *  A non-null `updated_status` means that transfer advanced this pass. */
function refreshResultHasChanges(result: unknown): boolean {
  const entries =
    result instanceof Map
      ? Array.from(result.values())
      : result && typeof result === 'object'
        ? Object.values(result)
        : [];
  return entries.some((entry) => {
    if (entry == null || typeof entry !== 'object') return false;
    const t = entry as { updated_status?: unknown; updatedStatus?: unknown };
    return (t.updated_status ?? t.updatedStatus) != null;
  });
}

function normalizeReceiveData(
  raw: RlnRawInvoiceReceiveData
): InvoiceReceiveData {
  return {
    invoice: String(raw.invoice ?? ''),
    recipientId: String(raw.recipient_id ?? ''),
    expirationTimestamp: (raw.expiration_timestamp ?? null) as number | null,
    batchTransferIdx: Number(raw.batch_transfer_idx ?? 0),
  };
}

function normalizeUnspent(raw: RlnRawUnspent): Unspent {
  const utxo = raw.utxo ?? {};
  const op = utxo.outpoint ?? {};
  const allocs = raw.rgb_allocations ?? [];
  return {
    utxo: {
      outpoint: { txid: String(op.txid ?? ''), vout: Number(op.vout ?? 0) },
      btcAmount: Number(utxo.btc_amount ?? 0),
      colorable: Boolean(utxo.colorable),
      exists: Boolean(utxo.exists ?? true),
    },
    rgbAllocations: allocs.map((a) => ({
      assetId: (a.asset_id ?? undefined) as string | undefined,
      assignment: parseAssignment(a.assignment),
      settled: Boolean(a.settled),
    })),
    pendingBlinded: Number(raw.pending_blinded ?? 0),
  };
}

function normalizeSendResult(raw: RlnRawSendResult): SendResult {
  return {
    txid: String(raw.txid ?? ''),
    batchTransferIdx: Number(raw.batch_transfer_idx ?? 0),
  };
}

function parseJson<T>(jsonStr: string): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    throw new WalletError(
      `Failed to parse RLN response JSON: ${e}`,
      'parseJson'
    );
  }
}

function sdkRecipientToRln(r: BatchRecipient) {
  return {
    recipient_id: r.recipientId,
    witness_data:
      r.witnessData != null
        ? {
            amount_sat: String(r.witnessData.amountSat),
            blinding:
              r.witnessData.blinding != null
                ? String(r.witnessData.blinding)
                : null,
          }
        : null,
    assignment: { Fungible: r.assignment.Fungible },
    transport_endpoints: r.transportEndpoints,
  };
}

function sdkRecipientMapToRln(map: RecipientMap) {
  const out: Record<string, ReturnType<typeof sdkRecipientToRln>[]> = {};
  for (const [assetId, list] of Object.entries(map)) {
    out[assetId] = list.map(sdkRecipientToRln);
  }
  return out;
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class RlnWasmBinding implements IRlnSdkBinding {
  private readonly sdk: RlnWasmSdk;
  /** The RGB wallet — exists from create() (the wasm wallet has no lifecycle
   *  check). Never read directly: the `wallet` getter enforces the LOCKED
   *  gate; `walletPreUnlock` is only for ops that may run in the gap. */
  private _wallet: RlnWasmWallet | null = null;
  /** LOCKED gate — false until unlockWallet() completes. The wallet object
   *  exists from create(), so the gate is this flag, not the wallet's absence. */
  private unlocked = false;
  /** Wallet init payload built at create(). Also the single source of truth
   *  for the derived account keys (getKeys()). */
  private readonly walletData: RlnWalletData;
  /** SDK password — kept for the sdk.unlock in unlockWallet() (create() only
   *  runs initValue, leaving the SDK initialized-but-locked). */
  private readonly password: string;
  private readonly enableVirtualChannels: boolean;
  private nodeHandle: RlnWasmNode | null;
  private rlnNode: IRlnNodeBinding | null;
  private online: RlnOnline | null = null;
  private nodeAttached = false;
  private lastBackupBytes: Uint8Array | null = null;
  private readonly defaultIndexerUrl: string;
  private readonly configuredTransportEndpoint: string | null;
  /** Error from the unlock-time configureLdkVssReplication attempt (see
   *  getLdkVssInitError). */
  private ldkVssInitError: string | null = null;
  /** LDK-stream VSS identity (null = VSS disabled). */
  private vssParams: {
    serverUrl: string;
    storeId: string;
    signingKeyHex: string;
  } | null = null;
  private ldkVssConfigured = false;

  private constructor(
    sdk: RlnWasmSdk,
    walletData: RlnWalletData,
    password: string,
    nodeHandle: RlnWasmNode | null,
    rlnNode: IRlnNodeBinding | null,
    defaultIndexerUrl: string,
    transportEndpoint: string | null,
    enableVirtualChannels: boolean
  ) {
    this.sdk = sdk;
    this.walletData = walletData;
    this.password = password;
    this.nodeHandle = nodeHandle;
    this.rlnNode = rlnNode;
    this.defaultIndexerUrl = defaultIndexerUrl;
    this.configuredTransportEndpoint = transportEndpoint;
    this.enableVirtualChannels = enableVirtualChannels;
  }

  /** LOCKED-gated wallet access — every wallet op goes through this. */
  private get wallet(): RlnWasmWallet {
    if (!this.unlocked || !this._wallet) {
      throw new WalletError(
        'Wallet is locked — call unlock() first (init() only prepares the SDK, wallet and node handle).',
        'walletLocked'
      );
    }
    return this._wallet;
  }

  /** Ungated wallet access — only for the VSS wallet-stream ops, which
   *  legitimately run in the LOCKED init→unlock gap. */
  private get walletPreUnlock(): RlnWasmWallet {
    if (!this._wallet) {
      throw new WalletError(
        'Wallet is not initialized — call init() first.',
        'walletNotInitialized'
      );
    }
    return this._wallet;
  }

  static async create(params: RlnBindingCreateParams): Promise<RlnWasmBinding> {
    await initRlnWasm();

    const sdk = new RlnWasmSdk();
    sdk.setDefaultEnableVirtualChannelsV0(params.enableVirtualChannels ?? true);
    await sdk.preloadPersistentRuntimeState();

    if (params.transportEndpoint) {
      sdk.setDefaultRgbProxyTransport(params.transportEndpoint, null, null);
    }

    try {
      await sdk.initValue(params.password, params.mnemonic);
    } catch (e) {
      const msg = String(e);
      if (
        msg.includes('already initialized with different password') ||
        msg.includes('already initialized with different mnemonic')
      ) {
        throw new Error(
          'RLN WASM SDK is already initialized with a different wallet in this browser tab. ' +
            'Only one RLN wallet can exist per tab. Remove the existing RLN wallet first, then reload the page before creating a new one.'
        );
      }
      throw e;
    }
    // No sdk.unlock here — that happens in unlockWallet(); everything below
    // is standalone and doesn't need the unlocked SDK.
    const networkStr = mapNetwork(params.network);
    const keys = rgbRestoreKeysValue(networkStr, params.mnemonic) as {
      account_xpub_vanilla: string;
      account_xpub_colored: string;
      master_fingerprint: string;
      mnemonic: string;
    };

    const walletData: RlnWalletData = {
      data_dir:
        params.dataDir ??
        `/rln_${keys.master_fingerprint}_${networkStr.toLowerCase()}`,
      bitcoin_network: networkStr,
      database_type: 'Sqlite',
      max_allocations_per_utxo: params.maxAllocationsPerUtxo ?? 5,
      account_xpub_vanilla: keys.account_xpub_vanilla,
      account_xpub_colored: keys.account_xpub_colored,
      mnemonic: params.mnemonic,
      master_fingerprint: keys.master_fingerprint,
      vanilla_keychain: params.vanillaKeychain ?? null,
      supported_schemas: params.supportedSchemas ?? ['Nia', 'Ifa'],
    };

    let nodeHandle: RlnWasmNode | null = null;
    let rlnNode: IRlnNodeBinding | null = null;

    // Node handle creation doesn't start the runtime (attachWallet does) —
    // it must exist in the LOCKED phase so clearLdkVssFence works in the gap.
    const proxyUrl = params.proxyUrl ?? params.transportEndpoint;
    if (proxyUrl) {
      const { RlnNodeBinding } = await import('../lightning/RlnNodeBinding');
      const runtimeId = params.nodeRuntimeId ?? keys.master_fingerprint;
      nodeHandle = RlnWasmNode.newWithNodeRuntimeId(
        proxyUrl,
        runtimeId,
        networkStr
      );
      if (params.relayAuthToken || params.relayNodeId) {
        nodeHandle.setRelaySessionAuth(
          params.relayAuthToken ?? null,
          params.relayNodeId ?? null
        );
      }
      rlnNode = new RlnNodeBinding(nodeHandle);
    }
    const normalizedNet = normalizeNetwork(params.network);
    const defaultIndexerUrl =
      DEFAULT_INDEXER_URLS[normalizedNet] ?? DEFAULT_INDEXER_URLS.utexo;

    const binding = new RlnWasmBinding(
      sdk,
      walletData,
      params.password,
      nodeHandle,
      rlnNode,
      defaultIndexerUrl,
      params.transportEndpoint ?? null,
      params.enableVirtualChannels ?? true
    );
    binding.vssParams = params.vss ?? null;
    // Created while LOCKED (no wasm lifecycle check) so VSS restore can run
    // in the init→unlock gap; ops stay gated by the `unlocked` flag.
    binding._wallet = await RlnWasmWallet.create(JSON.stringify(walletData));
    return binding;
  }

  /** Phase 2: sdk.unlock (idempotent for the same password; validates the
   *  password and authorizes the node runtime) → LDK VSS configure
   *  (non-fatal — see getLdkVssInitError) → LOCKED gate released.
   *  Idempotent/retryable; the binding stays locked on a thrown failure. */
  async unlockWallet(): Promise<void> {
    await this.sdk.unlock(JSON.stringify({ password: this.password }));
    await this.configureLdkVss();
    this.unlocked = true;
  }

  /** Whether unlockWallet() has completed (the LOCKED gate is released). */
  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Account keys derived once at create() via the wasm rgbRestoreKeysValue —
   *  the single source of truth (callers must not re-derive from the mnemonic). */
  getKeys(): {
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
  } {
    return {
      accountXpubVanilla: this.walletData.account_xpub_vanilla,
      accountXpubColored: this.walletData.account_xpub_colored,
      masterFingerprint: this.walletData.master_fingerprint,
    };
  }

  /** Configure LDK/channel-state VSS replication — must run before the node
   *  runtime starts (the wasm side does the guarded fresh-device restore
   *  here). Non-fatal: a failure (held fence, VSS down) is captured in
   *  getLdkVssInitError() and channel state stays local-only. Idempotent. */
  private async configureLdkVss(): Promise<void> {
    if (this.ldkVssConfigured || !this.vssParams || !this.nodeHandle) return;
    const { serverUrl, storeId, signingKeyHex } = this.vssParams;
    try {
      const restored = await this.nodeHandle.configureLdkVssReplication(
        serverUrl,
        storeId,
        signingKeyHex
      );
      // Latch only on success so the recovery path (disable → clearFence →
      // unlock) can re-run the configure.
      this.ldkVssConfigured = true;
      this.ldkVssInitError = null;
      logger.info(
        `RlnWasmBinding: LDK VSS replication enabled (${restored} keys restored)`
      );
    } catch (e) {
      this.ldkVssInitError = String(e);
      logger.warn(
        'RlnWasmBinding: configureLdkVssReplication failed — channel state stays local-only',
        e
      );
    }
  }

  // ── Lifecycle (IRgbLibBinding) ─────────────────────────────────────────────

  getOnline(): void {
    // returns void per interface; online state is checked internally
  }

  dropWallet(): void {
    try {
      this._wallet?.free();
      this._wallet = null;
      this.unlocked = false;
      this.nodeHandle?.free();
      this.sdk.free();
    } catch (e) {
      logger.warn('RlnWasmBinding.dropWallet error', e);
    }
  }

  registerWallet(): { address: string; btcBalance: BtcBalance } {
    const address = this.wallet.getAddress();
    const btcBalance = normalizeBtcBalance(this.wallet.getBtcBalanceValue());
    return { address, btcBalance };
  }

  /** Whether goOnlineValue has succeeded (wallet connected to an indexer). */
  isOnline(): boolean {
    return this.online !== null;
  }

  /** Connect wallet to indexer — must be called before any network
   *  operation. Omitted/empty indexerUrl falls back to the network's
   *  DEFAULT_INDEXER_URLS entry. */
  async connect(
    indexerUrl?: string,
    skipConsistencyCheck = false
  ): Promise<void> {
    const url = indexerUrl || this.defaultIndexerUrl;
    if (this.online) {
      // Idempotent: rgb-lib rejects a second go_online, and create({ indexerUrl })
      // may have already connected + attached the node (see ensureNodeAttached).
      if (indexerUrl && indexerUrl !== this.online.indexer_url) {
        logger.warn(
          `RlnWasmBinding.connect: already online via ${this.online.indexer_url}; ignoring ${indexerUrl}`
        );
      }
      return;
    }
    this.online = await this.wallet.goOnlineValue(skipConsistencyCheck, url);
    // Attach only after goOnlineValue RESOLVES — it holds a borrow_mut()
    // across its await; an attached node's runtime tick would panic
    // ("RefCell already borrowed").
    this.ensureNodeAttached();
  }

  /**
   * Attach the wallet to the LN node. Called from connect() once goOnlineValue
   * has resolved (RN-style UX — no separate attach step) and lazily from LN
   * entry points as a fallback for wallets that came up offline. Idempotent.
   */
  private ensureNodeAttached(): void {
    if (this.nodeHandle && !this.nodeAttached) {
      // Accept trusted virtual-channel opens (0-conf, scid-privacy,
      // never-broadcast). Must be set BEFORE attachWallet, which seeds the
      // backend's flag registry (mirrors the wasm-sdk example flows).
      if (this.enableVirtualChannels) {
        try {
          this.nodeHandle.setEnableVirtualChannelsV0(true);
        } catch (e) {
          logger.warn('RlnWasmBinding: setEnableVirtualChannelsV0 failed', e);
        }
      }
      this.nodeHandle.attachWallet(this.wallet);
      this.nodeAttached = true;
      // DORMANT chain-sync session (huge interval; a busy loop collides with
      // wallet ops on the shared RefCell). Explicit chainSyncTickValue()
      // calls keep the LDK best-block fresh — without a session the height
      // freezes at attach and peers reject HTLCs (expiry_too_soon).
      try {
        this.nodeHandle.chainSyncStartValue(this.defaultIndexerUrl, 3_600_000);
      } catch (e) {
        logger.warn('RlnWasmBinding: chainSyncStart on attach failed', e);
      }
    }
  }

  /** Explicitly attach the wallet to the LN node (otherwise lazy on first use). */
  attachLightningNode(): void {
    this.ensureNodeAttached();
  }

  /**
   * Start the node's background chain-sync loop (drives LN channel funding
   * confirmations). Call this only once on-chain wallet setup (funding,
   * createUtxos) is done — running it concurrently with wallet operations
   * panics the wasm ("RefCell already borrowed").
   */
  startNodeChainSync(indexerUrl?: string, pollIntervalMs = 3_600_000): void {
    if (!this.nodeHandle) return;
    const url = indexerUrl || this.defaultIndexerUrl;
    try {
      this.nodeHandle.chainSyncStartValue(url, pollIntervalMs);
    } catch (e) {
      logger.warn('RlnWasmBinding: chainSyncStart failed', e);
    }
  }

  private requireOnline(): RlnOnline {
    if (!this.online) {
      throw new WalletError(
        'Wallet is not online. Call goOnline() first.',
        'requireOnline'
      );
    }
    return this.online;
  }

  // ── Balance & Address ──────────────────────────────────────────────────────

  async getBtcBalance(): Promise<BtcBalance> {
    return normalizeBtcBalance(this.wallet.getBtcBalanceValue());
  }

  async getAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  async rotateVanillaAddress(): Promise<string> {
    throw new Error('rotateVanillaAddress is not implemented for RLN wallet');
  }

  async rotateColoredAddress(): Promise<string> {
    throw new Error('rotateColoredAddress is not implemented for RLN wallet');
  }

  // ── UTXOs ──────────────────────────────────────────────────────────────────

  async listUnspents(): Promise<Unspent[]> {
    const raw = parseJson<RlnRawUnspent[]>(this.wallet.listUnspentsJson(false));
    return raw.map(normalizeUnspent);
  }

  async createUtxosBegin(
    params: CreateUtxosBeginRequestModel
  ): Promise<string> {
    const online = this.requireOnline();
    return await this.wallet.createUtxosBegin(
      online,
      params.upTo ?? true,
      params.num ?? null,
      params.size ?? null,
      BigInt(Math.round(params.feeRate ?? 1)),
      false
    );
  }

  async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    const online = this.requireOnline();
    return await this.wallet.createUtxosEnd(
      online,
      params.signedPsbt,
      params.skipSync ?? false
    );
  }

  // ── Assets ────────────────────────────────────────────────────────────────

  async listAssets(): Promise<ListAssets> {
    const raw = parseJson<unknown>(this.wallet.listAssetsJson(['Nia', 'Ifa']));
    return normalizeListAssets(raw);
  }

  async getAssetBalance(assetId: string): Promise<AssetBalance> {
    const raw = parseJson<unknown>(this.wallet.getAssetBalanceJson(assetId));
    return normalizeAssetBalance(raw);
  }

  async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    if (!this.nodeHandle) {
      throw new WalletError(
        'issueAssetNia requires a Lightning node (proxyUrl must be configured)',
        'issueAssetNia'
      );
    }
    this.ensureNodeAttached();
    const raw = this.nodeHandle.issueAssetNiaValue({
      ticker: params.ticker,
      name: params.name,
      precision: params.precision,
      amounts: params.amounts.map(BigInt),
    });
    return normalizeAssetNia(raw as RlnRawAssetNia);
  }

  async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<AssetIfa> {
    if (!this.nodeHandle) {
      throw new WalletError(
        'issueAssetIfa requires a Lightning node (proxyUrl must be configured)',
        'issueAssetIfa'
      );
    }
    this.ensureNodeAttached();
    // IFA → CFA mapping (RLN uses CFA schema for fungible assets with inflation)
    const raw = this.nodeHandle.issueAssetCfaValue({
      name: params.name,
      precision: params.precision,
      amounts: params.amounts.map(BigInt),
    });
    const cfa = normalizeAssetCfa(raw as RlnRawAssetCfa);
    // Return as AssetIfa shape (best-effort mapping)
    return {
      assetId: cfa.assetId,
      ticker: params.ticker,
      name: cfa.name,
      details: cfa.details,
      precision: cfa.precision,
      initialSupply: cfa.issuedSupply,
      maxSupply: cfa.issuedSupply,
      knownCirculatingSupply: cfa.issuedSupply,
      timestamp: cfa.timestamp,
      addedAt: cfa.addedAt,
      balance: cfa.balance,
    } as AssetIfa;
  }

  async inflateBegin(_params: InflateAssetIfaRequestModel): Promise<string> {
    const online = this.requireOnline();
    return await this.wallet.inflateBegin(
      online,
      _params.assetId,
      _params.inflationAmounts,
      BigInt(Math.round(_params.feeRate ?? 1)),
      _params.minConfirmations ?? 1
    );
  }

  async inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
    const online = this.requireOnline();
    const raw = parseJson<RlnRawSendResult>(
      await this.wallet.inflateEndJson(online, params.signedPsbt)
    );
    return normalizeSendResult(raw);
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    const online = this.requireOnline();
    // sendBegin takes a recipient map, not an invoice string — decode to build it.
    const invoiceObj = new RlnWasmInvoice(params.invoice);
    const invoiceData = invoiceObj.invoiceDataValue() as Record<
      string,
      unknown
    >;
    const recipientId = String(
      invoiceData.recipient_id ?? invoiceData.recipientId ?? ''
    );
    const assetId = String(
      invoiceData.asset_id ?? invoiceData.assetId ?? params.assetId ?? ''
    );
    const endpoints = (invoiceData.transport_endpoints ??
      invoiceData.transportEndpoints ?? [
        this._transportEndpoint(),
      ]) as string[];
    const amount = params.amount ?? 0;
    const recipientMap = {
      [assetId]: [
        {
          recipient_id: recipientId,
          // amount_sat / blinding must be strings (see sdkRecipientToRln).
          witness_data: params.witnessData
            ? {
                amount_sat: String(params.witnessData.amountSat),
                blinding:
                  params.witnessData.blinding != null
                    ? String(params.witnessData.blinding)
                    : null,
              }
            : null,
          assignment: { Fungible: amount },
          transport_endpoints: endpoints,
        },
      ],
    };
    return await this.wallet.sendBegin(
      online,
      recipientMap,
      params.donation ?? false,
      BigInt(Math.round(params.feeRate ?? 1)),
      params.minConfirmations ?? 1
    );
  }

  async sendBeginBatch(params: {
    recipientMap: RecipientMap;
    feeRate?: number;
    minConfirmations?: number;
    donation?: boolean;
  }): Promise<string> {
    const online = this.requireOnline();
    return await this.wallet.sendBegin(
      online,
      sdkRecipientMapToRln(params.recipientMap),
      params.donation ?? false,
      BigInt(Math.round(params.feeRate ?? 1)),
      params.minConfirmations ?? 1
    );
  }

  async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    const online = this.requireOnline();
    const raw = parseJson<RlnRawSendResult>(
      await this.wallet.sendEndJson(
        online,
        params.signedPsbt,
        params.skipSync ?? false
      )
    );
    return normalizeSendResult(raw);
  }

  async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    const online = this.requireOnline();
    return await this.wallet.sendBtcBegin(
      online,
      params.address,
      BigInt(params.amount),
      BigInt(Math.round(params.feeRate)),
      params.skipSync ?? false
    );
  }

  async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    const online = this.requireOnline();
    return await this.wallet.sendBtcEnd(
      online,
      params.signedPsbt,
      params.skipSync ?? false
    );
  }

  // ── Receiving ─────────────────────────────────────────────────────────────

  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    const assignment =
      params.amount != null ? { Fungible: params.amount } : { Fungible: 0 };
    const raw = this.wallet.blindReceiveValue(
      params.assetId ?? null,
      assignment,
      params.durationSeconds ?? null,
      [this._transportEndpoint()],
      params.minConfirmations ?? 1
    );
    return normalizeReceiveData(raw as RlnRawInvoiceReceiveData);
  }

  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    const assignment =
      params.amount != null ? { Fungible: params.amount } : { Fungible: 0 };
    const raw = this.wallet.witnessReceiveValue(
      params.assetId ?? null,
      assignment,
      params.durationSeconds ?? null,
      [this._transportEndpoint()],
      params.minConfirmations ?? 1
    );
    return normalizeReceiveData(raw as RlnRawInvoiceReceiveData);
  }

  async decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
    if (this.nodeHandle) {
      this.ensureNodeAttached();
      const raw = parseJson<Record<string, unknown>>(
        this.nodeHandle.decodeRgbInvoiceJson(params.invoice)
      );
      return raw as unknown as InvoiceData;
    }
    // Fallback: use standalone RlnWasmInvoice parser (no node needed)
    const invoiceObj = new RlnWasmInvoice(params.invoice);
    const raw = invoiceObj.invoiceDataValue() as Record<string, unknown>;
    return raw as unknown as InvoiceData;
  }

  // ── Transactions & Transfers ───────────────────────────────────────────────

  async listTransactions(): Promise<Transaction[]> {
    const raw = parseJson<RlnRawTransaction[]>(
      this.wallet.listTransactionsJson()
    );
    return raw.map(normalizeTransaction);
  }

  async listTransfers(assetId?: string): Promise<Transfer[]> {
    const raw = parseJson<RlnRawTransfer[]>(
      this.wallet.listTransfersJson(assetId ?? null)
    );
    return raw.map(normalizeTransfer);
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    const online = this.requireOnline();
    return await this.wallet.failTransfers(
      online,
      params.batchTransferIdx ?? null,
      params.noAssetOnly ?? false,
      params.skipSync ?? false
    );
  }

  // Must be awaited — a fire-and-forget refresh can collide with the next
  // wallet op on the shared wasm RefCell and panic ("RefCell already
  // borrowed"). Returning a Promise from the `void` interface method is fine.
  /** Returns true when any transfer changed status this pass — refresh
   *  settlements don't bump rgb-lib's backup timestamp, so this is the only
   *  signal callers (auto VSS backup) have that wallet state advanced. */
  async refreshWallet(): Promise<boolean> {
    if (!this.online) return false;
    // filter must be [] (wasm rejects null); refreshValue not refreshJson (the
    // integer-keyed result breaks JSON conversion).
    const result = await this.wallet.refreshValue(this.online, null, [], false);
    return refreshResultHasChanges(result);
  }

  async syncWallet(): Promise<void> {
    if (!this.online) return;
    try {
      await this.wallet.syncOnline(this.online);
    } catch (e) {
      logger.warn('RlnWasmBinding.syncWallet error', e);
    }
  }

  // ── Fee & Backup ──────────────────────────────────────────────────────────

  async getFeeEstimation(params: {
    blocks: number;
  }): Promise<GetFeeEstimationResponse> {
    const online = this.requireOnline();
    const fee = await this.wallet.getFeeEstimation(online, params.blocks);
    return fee as GetFeeEstimationResponse;
  }

  async createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse> {
    const bytes = this.wallet.backup(params.password);
    this.lastBackupBytes = bytes;
    return { message: 'Backup created successfully', backupPath: ':memory:' };
  }

  getLastBackupBytes(): Uint8Array | null {
    return this.lastBackupBytes;
  }

  restoreFromBackupBytes(bytes: Uint8Array, password: string): void {
    this.wallet.restoreBackup(bytes, password);
  }

  // ── VSS ───────────────────────────────────────────────────────────────────
  // Wallet-stream VSS ops use walletPreUnlock: they must work in the LOCKED
  // init→unlock gap (the explicit-restore window).

  configureVssBackup(config: VssBackupConfig): void {
    this.walletPreUnlock.configureVssBackup(
      config.serverUrl,
      config.storeId,
      config.signingKey
    );
  }

  disableVssAutoBackup(): void {
    this.walletPreUnlock.disableVssBackup();
  }

  /** Download and install the wallet snapshot from VSS (assets/stock/BDK
   *  state). Requires configureVssBackup first. Overwrites local wallet
   *  state with the cloud copy — callers guard against clobbering. */
  vssRestoreBackup(): Promise<void> {
    return this.walletPreUnlock.vssRestoreBackup();
  }

  async vssBackup(_config: VssBackupConfig): Promise<number> {
    const raw = parseJson<{ version?: number }>(
      await this.walletPreUnlock.vssBackupJson()
    );
    return raw.version ?? 0;
  }

  async vssBackupInfo(_config: VssBackupConfig): Promise<VssBackupInfo> {
    const raw = parseJson<{
      backup_exists?: boolean;
      server_version?: number;
      backup_required?: boolean;
    }>(await this.walletPreUnlock.vssBackupInfoJson());
    return {
      backupExists: Boolean(raw.backup_exists),
      serverVersion: raw.server_version ?? null,
      backupRequired: Boolean(raw.backup_required),
    };
  }

  // ── IRlnWalletBinding extras ───────────────────────────────────────────────

  async sendRgbFromGroups(
    params: SendRgbFromGroupsRequest
  ): Promise<SendRgbFromGroupsResult> {
    const raw = parseJson<{ txid?: string }>(
      await this.wallet.sendRgbFromGroupsJson(params.groups)
    );
    return { txid: raw.txid };
  }

  async postAssetMedia(mimeType: string, bytesHex: string): Promise<string> {
    return await this.sdk.postAssetMediaJson(mimeType, bytesHex);
  }

  // ── IRlnSdkBinding extras ─────────────────────────────────────────────────

  async initSdk(params: RlnSdkInitParams): Promise<void> {
    await this.sdk.initValue(params.password, params.mnemonic);
    await this.sdk.unlock(JSON.stringify({ password: params.password }));
  }

  async lock(): Promise<void> {
    await this.sdk.lock();
  }

  async unlock(password: string): Promise<void> {
    await this.sdk.unlock(JSON.stringify({ password }));
  }

  version(): string {
    return this.sdk.version();
  }

  async makerInit(params: SwapMakerInitParams): Promise<SwapMakerInitResult> {
    const raw = parseJson<{ swap_string?: string }>(
      await this.sdk.makerInitJson(params.requestJson)
    );
    return { swapString: raw.swap_string ?? '' };
  }

  async makerExecute(swapString: string): Promise<void> {
    await this.sdk.makerExecuteJson(swapString);
  }

  async taker(requestJson: string): Promise<void> {
    await this.sdk.taker(requestJson);
  }

  async getSwap(swapString: string): Promise<SwapInfo> {
    const raw = parseJson<{ status?: string }>(
      await this.sdk.getSwapJson(swapString)
    );
    return { swapString, status: raw.status ?? '' };
  }

  async listSwaps(): Promise<SwapInfo[]> {
    const raw = parseJson<Array<{ swap_string?: string; status?: string }>>(
      await this.sdk.listSwapsJson()
    );
    return raw.map((s) => ({
      swapString: s.swap_string ?? '',
      status: s.status ?? '',
    }));
  }

  getLightningNode(): IRlnNodeBinding | null {
    // Lazily attach the wallet to the node the first time the LN node is
    // accessed (after on-chain wallet setup), avoiding the RefCell conflict.
    this.ensureNodeAttached();
    return this.rlnNode;
  }

  /** Stop LDK VSS replication and release the fence + Web Lock; resets the
   *  latch so unlockWallet() can re-run the configure. Local channel state
   *  is unaffected. */
  disableLdkVssReplication(): void {
    this.nodeHandle?.disableLdkVssReplication();
    this.ldkVssConfigured = false;
    this.ldkVssInitError = null;
  }

  /** getLightningNode() without the lazy attach — required in the locked
   *  phase (attach starts the runtime, breaking the pre-runtime configure). */
  peekLightningNode(): IRlnNodeBinding | null {
    return this.rlnNode;
  }

  /** Error from the unlock-time configureLdkVssReplication attempt, or null.
   *  Kept here because a configure failure never reaches the wasm replicator,
   *  whose own lastError would stay null. */
  getLdkVssInitError(): string | null {
    return this.ldkVssInitError;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _transportEndpoint(): string {
    // rgb-lib transport endpoints require the rpc:// / rpcs:// scheme —
    // normalize the configured http(s) URL; localhost is a dev-only fallback.
    const ep = this.configuredTransportEndpoint;
    if (!ep) return 'rpc://localhost:3000/json-rpc';
    return ep
      .replace(/^https:\/\//i, 'rpcs://')
      .replace(/^http:\/\//i, 'rpc://');
  }
}
