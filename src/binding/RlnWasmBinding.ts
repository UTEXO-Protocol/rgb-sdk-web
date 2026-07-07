/**
 * RlnWasmBinding — browser WASM implementation of IRlnSdkBinding.
 *
 * Uses rln-wasm-sdk exclusively (no rgb-lib-wasm dependency).
 * A single RlnWasmWallet handles all wallet operations; a RlnWasmNode
 * (with wallet attached) handles Lightning + asset issuance. The direct node
 * object is used (not RlnWasmSdkNodeHandle) because HODL-invoice and
 * fail-pending-payment operations are only exposed on RlnWasmNode.
 */

import {
  RlnWasmSdk,
  RlnWasmWallet,
  RlnWasmNode,
  RlnWasmInvoice,
  rgbRestoreKeysValue,
} from 'rln-wasm-sdk';
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
  /** enable virtual channels v0 (default: true) */
  enableVirtualChannels?: boolean;
  /** asset schemas to support (default: ['Nia', 'Ifa']) */
  supportedSchemas?: string[];
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
    offchainOutbound: Number(r?.offchain_outbound ?? r?.offchainOutbound ?? 0),
    offchainInbound: Number(r?.offchain_inbound ?? r?.offchainInbound ?? 0),
  };
}

function normalizeAssetNia(a: RlnRawAssetNia): AssetNIA {
  return {
    assetId: String(a.asset_id ?? a.assetId ?? ''),
    ticker: String(a.ticker ?? ''),
    name: String(a.name ?? ''),
    details: (a.details ?? null) as string | null,
    precision: Number(a.precision ?? 0),
    issuedSupply: Number(a.issued_supply ?? a.issuedSupply ?? 0),
    timestamp: Number(a.timestamp ?? 0),
    addedAt: Number(a.added_at ?? a.addedAt ?? 0),
    balance: normalizeBalance(a.balance),
  };
}

function normalizeAssetCfa(a: RlnRawAssetCfa): AssetCFA {
  return {
    assetId: String(a.asset_id ?? a.assetId ?? ''),
    name: String(a.name ?? ''),
    details: (a.details ?? undefined) as string | undefined,
    precision: Number(a.precision ?? 0),
    issuedSupply: Number(a.issued_supply ?? a.issuedSupply ?? 0),
    timestamp: Number(a.timestamp ?? 0),
    addedAt: Number(a.added_at ?? a.addedAt ?? 0),
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
  const eps = (raw.transport_endpoints ??
    raw.transportEndpoints ??
    []) as RlnRawTransportEndpoint[];
  const req = raw.requested_assignment ?? raw.requestedAssignment;
  return {
    idx: Number(raw.idx ?? 0),
    batchTransferIdx: Number(
      raw.batch_transfer_idx ?? raw.batchTransferIdx ?? 0
    ),
    createdAt: Number(raw.created_at ?? raw.createdAt ?? 0),
    updatedAt: Number(raw.updated_at ?? raw.updatedAt ?? 0),
    status: (raw.status ?? 'WaitingCounterparty') as Transfer['status'],
    requestedAssignment: req != null ? parseAssignment(req) : undefined,
    assignments: ((raw.assignments ?? []) as unknown[]).map(parseAssignment),
    kind: (raw.kind ?? 'Send') as Transfer['kind'],
    txid: (raw.txid ?? undefined) as string | undefined,
    recipientId: (raw.recipient_id ?? raw.recipientId ?? undefined) as
      | string
      | undefined,
    receiveUtxo: (raw.receive_utxo ??
      raw.receiveUtxo ??
      undefined) as Transfer['receiveUtxo'],
    changeUtxo: (raw.change_utxo ??
      raw.changeUtxo ??
      undefined) as Transfer['changeUtxo'],
    expiration: (raw.expiration ?? undefined) as number | undefined,
    transportEndpoints: eps.map((te) => ({
      endpoint: String(te.endpoint ?? ''),
      transportType: String(te.transport_type ?? te.transportType ?? ''),
      used: Boolean(te.used),
    })),
    invoiceString: (raw.invoice_string ?? raw.invoiceString ?? undefined) as
      | string
      | undefined,
    consignmentPath: undefined,
  };
}

function normalizeTransaction(raw: RlnRawTransaction): Transaction {
  const ct = raw.confirmation_time ?? raw.confirmationTime;
  return {
    transactionType: (raw.transaction_type ??
      raw.transactionType) as Transaction['transactionType'],
    txid: String(raw.txid ?? ''),
    received: Number(raw.received ?? 0),
    sent: Number(raw.sent ?? 0),
    fee: Number(raw.fee ?? 0),
    confirmationTime: ct
      ? { height: Number(ct.height ?? 0), timestamp: Number(ct.timestamp ?? 0) }
      : undefined,
  };
}

function normalizeReceiveData(
  raw: RlnRawInvoiceReceiveData
): InvoiceReceiveData {
  return {
    invoice: String(
      raw.invoice ?? raw.invoice_string ?? raw.invoiceString ?? ''
    ),
    recipientId: String(raw.recipient_id ?? raw.recipientId ?? ''),
    expirationTimestamp: (raw.expiration_timestamp ??
      raw.expirationTimestamp ??
      null) as number | null,
    batchTransferIdx: Number(
      raw.batch_transfer_idx ?? raw.batchTransferIdx ?? 0
    ),
  };
}

function normalizeUnspent(raw: RlnRawUnspent): Unspent {
  const utxo = raw.utxo ?? {};
  const op = utxo.outpoint ?? {};
  const allocs = raw.rgb_allocations ?? raw.rgbAllocations ?? [];
  return {
    utxo: {
      outpoint: { txid: String(op.txid ?? ''), vout: Number(op.vout ?? 0) },
      btcAmount: Number(utxo.btc_amount ?? utxo.btcAmount ?? 0),
      colorable: Boolean(utxo.colorable),
      exists: Boolean(utxo.exists ?? true),
    },
    rgbAllocations: allocs.map((a) => ({
      assetId: (a.asset_id ?? a.assetId ?? undefined) as string | undefined,
      assignment: parseAssignment(a.assignment),
      settled: Boolean(a.settled),
    })),
    pendingBlinded: Number(raw.pending_blinded ?? raw.pendingBlinded ?? 0),
  };
}

function normalizeSendResult(raw: RlnRawSendResult): SendResult {
  return {
    txid: String(raw.txid ?? ''),
    batchTransferIdx: Number(
      raw.batch_transfer_idx ?? raw.batchTransferIdx ?? 0
    ),
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
    // amount_sat / blinding use rgb-lib's from_str_or_number deserializer,
    // which rejects the integer form serde_wasm_bindgen produces for whole
    // JS numbers — pass them as strings.
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
  private readonly wallet: RlnWasmWallet;
  private nodeHandle: RlnWasmNode | null;
  private rlnNode: IRlnNodeBinding | null;
  private online: RlnOnline | null = null;
  private nodeAttached = false;
  private lastBackupBytes: Uint8Array | null = null;
  private readonly defaultIndexerUrl: string;
  private readonly configuredTransportEndpoint: string | null;

  private constructor(
    sdk: RlnWasmSdk,
    wallet: RlnWasmWallet,
    nodeHandle: RlnWasmNode | null,
    rlnNode: IRlnNodeBinding | null,
    defaultIndexerUrl: string,
    transportEndpoint: string | null
  ) {
    this.sdk = sdk;
    this.wallet = wallet;
    this.nodeHandle = nodeHandle;
    this.rlnNode = rlnNode;
    this.defaultIndexerUrl = defaultIndexerUrl;
    this.configuredTransportEndpoint = transportEndpoint;
  }

  static async create(params: RlnBindingCreateParams): Promise<RlnWasmBinding> {
    await initRlnWasm();

    const sdk = new RlnWasmSdk();

    // Enable virtual channels before any init (matches official SDK sequence).
    sdk.setDefaultEnableVirtualChannelsV0(params.enableVirtualChannels ?? true);

    // Preload persistent runtime state BEFORE initValue.
    await sdk.preloadPersistentRuntimeState();

    // Set default RGB proxy transport at SDK level if provided.
    if (params.transportEndpoint) {
      sdk.setDefaultRgbProxyTransport(params.transportEndpoint, null, null);
    }

    console.log('[RLN] initValue start, network:', params.network);
    try {
      await sdk.initValue(params.password, params.mnemonic);
      console.log('[RLN] initValue ok');
    } catch (e) {
      const msg = String(e);
      console.error('[RLN] initValue failed:', msg);
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

    console.log('[RLN] unlock start');
    await sdk.unlock(JSON.stringify({ password: params.password }));
    console.log('[RLN] unlock ok');

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

    console.log('[RLN] createWallet start, data_dir:', walletData.data_dir);

    // Create node handle BEFORE wallet (matches official RLN init sequence).
    let nodeHandle: RlnWasmNode | null = null;
    let rlnNode: IRlnNodeBinding | null = null;

    const proxyUrl = params.proxyUrl ?? params.transportEndpoint;
    if (proxyUrl) {
      const { RlnNodeBinding } = await import('../lightning/RlnNodeBinding');
      // Use the STANDALONE node constructor (static newWithNodeRuntimeId), not
      // sdk.newNode(): the latter binds the node to the SDK facade and
      // auto-attaches the SDK default wallet, which then conflicts (shared
      // RefCell) with our standalone RlnWasmWallet. The official examples always
      // build the node this way. A stable runtimeId (master fingerprint) keeps
      // the node identity + persisted runtime state stable across reloads.
      const runtimeId = params.nodeRuntimeId ?? keys.master_fingerprint;
      nodeHandle = RlnWasmNode.newWithNodeRuntimeId(proxyUrl, runtimeId);
      // Enable virtual channels v0 ON THE NODE (the SDK-default flag does not
      // propagate to a standalone node). Gates both outbound virtual opens and
      // the inbound accept path: the wasm backend's OpenChannelRequest handler
      // accepts the LSP's trusted virtual channels (trusted_no_broadcast,
      // dust_limit_satoshis=1) via accept_inbound_channel_from_trusted_peer_0conf
      // only when this flag is set; without it LDK's stock accept rejects them
      // with "dust_limit_satoshis (1) is less than the implementation limit (354)".
      if (params.enableVirtualChannels ?? true) {
        try {
          nodeHandle.setEnableVirtualChannelsV0(true);
        } catch (e) {
          logger.warn('RlnWasmBinding: setEnableVirtualChannelsV0 failed', e);
        }
      }
      rlnNode = new RlnNodeBinding(nodeHandle);
    }

    let wallet: RlnWasmWallet;
    try {
      // Use the STANDALONE wallet (static RlnWasmWallet.create), not
      // sdk.createWallet(): the latter returns an SDK-managed handle whose ops
      // route through the SDK facade and re-borrow the same RefCell the node's
      // ldk-over-websocket runtime holds → "RefCell already borrowed" panic on
      // any wallet call (getBtcBalanceValue, etc). The official example uses the
      // standalone wallet for exactly this reason.
      wallet = await RlnWasmWallet.create(JSON.stringify(walletData));
      console.log('[RLN] createWallet ok');
    } catch (e) {
      console.error('[RLN] createWallet failed:', String(e));
      throw e;
    }

    // NOTE: the wallet must NOT be attached to the node here. goOnlineValue
    // holds a borrow_mut() on the wallet's shared RefCell across its await
    // (sdk_facade.rs); once attached, the node's ldk-over-websocket runtime
    // borrows that same RefCell on its ticks → "RefCell already borrowed"
    // panic. goOnline itself is safe anywhere BEFORE attach (connect() may run
    // during create() via the indexerUrl param); attach is deferred to first
    // LN use (ensureNodeAttached).

    const normalizedNet = normalizeNetwork(params.network);
    const defaultIndexerUrl =
      DEFAULT_INDEXER_URLS[normalizedNet] ?? DEFAULT_INDEXER_URLS.utexo;

    return new RlnWasmBinding(
      sdk,
      wallet,
      nodeHandle,
      rlnNode,
      defaultIndexerUrl,
      params.transportEndpoint ?? null
    );
  }

  // ── Lifecycle (IRgbLibBinding) ─────────────────────────────────────────────

  getOnline(): void {
    // returns void per interface; online state is checked internally
  }

  dropWallet(): void {
    try {
      this.wallet.free();
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

  /** Connect wallet to indexer — must be called before any network operation.
   *  If indexerUrl is omitted or empty, falls back to the DEFAULT_INDEXER_URLS
   *  entry for the wallet's network (same behaviour as WasmRgbLibBinding). */
  async connect(
    indexerUrl?: string,
    skipConsistencyCheck = false
  ): Promise<void> {
    const url = indexerUrl || this.defaultIndexerUrl;
    if (this.online) {
      // Idempotent: create({ indexerUrl }) auto-connects, so app code that
      // still calls goOnline() afterwards must not re-enter goOnlineValue
      // (rgb-lib rejects a second go_online, and the wallet may already be
      // attached to the LN node by then — see ensureNodeAttached).
      if (indexerUrl && indexerUrl !== this.online.indexer_url) {
        logger.warn(
          `RlnWasmBinding.connect: already online via ${this.online.indexer_url}; ignoring ${indexerUrl}`
        );
      }
      return;
    }
    console.log('[RLN] goOnline start', { url, skipConsistencyCheck });
    this.online = await this.wallet.goOnlineValue(skipConsistencyCheck, url);
    console.log('[RLN] goOnline ok');
    // NOTE: the wallet is NOT attached to the node here. Once attached, the
    // node's running ldk-over-websocket runtime borrows the shared wallet
    // RefCell on its ticks; a concurrent foreground wallet op (getBtcBalance
    // during funding, etc.) then panics with "RefCell already borrowed". Attach
    // is deferred until the LN node is actually used (ensureNodeAttached), which
    // is after on-chain wallet setup. Likewise chain sync is opt-in
    // (startNodeChainSync), never auto-started.
  }

  /**
   * Attach the wallet to the LN node on first use. Deferred from connect() so
   * that on-chain wallet operations (funding, createUtxos) run while the node
   * does not yet share the wallet's RefCell. Idempotent.
   */
  private ensureNodeAttached(): void {
    if (this.nodeHandle && !this.nodeAttached) {
      this.nodeHandle.attachWallet(this.wallet);
      this.nodeAttached = true;
      // Start a DORMANT chain-sync session (huge interval — the background loop
      // must stay idle or it collides with foreground wallet ops on the shared
      // RefCell). Explicit chainSyncTickValue() calls in RlnNodeBinding's drive
      // path keep the LDK best-block fresh; without an active session the node's
      // height freezes at attach time and, once the regtest chain advances, peers
      // reject our HTLCs (expiry_too_soon → temporary channel failure). Matches
      // the wasm-interop reference pattern.
      try {
        this.nodeHandle.chainSyncStartValue(this.defaultIndexerUrl, 3_600_000);
      } catch (e) {
        logger.warn('RlnWasmBinding: chainSyncStart on attach failed', e);
      }
      console.log(
        '[RLN] wallet attached to node',
        this.nodeHandle.nodeInfoValue()
      );
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

  // IFA inflation is not supported in RLN WASM
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
    // RLN wallet.sendBegin takes a recipient map, not an invoice string.
    // Decode the RGB invoice to build the map.
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
          // amount_sat / blinding use rgb-lib's from_str_or_number
          // deserializer — pass as strings (whole JS numbers arrive as
          // rejected serde integers otherwise).
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

  // NOTE: these MUST await the underlying wallet call. The wasm wallet holds a
  // RefCell borrow across the await inside syncOnline/refreshJson; if we fire
  // them without awaiting (fire-and-forget) and a subsequent wallet op
  // (getBtcBalance, etc.) runs before they settle, the wasm panics with
  // "RefCell already borrowed". (The IRgbLibBinding signature is `void`, but a
  // Promise-returning impl is structurally compatible and lets callers await.)
  async refreshWallet(): Promise<void> {
    if (!this.online) return;
    // filter must be an array — the wasm deserializes Vec<RefreshFilter>
    // and rejects null with "Invalid filter"; [] = refresh all transfers.
    // Use refreshValue, not refreshJson: the result is keyed by integer
    // batch_transfer_idx, which refreshJson's JSON conversion rejects
    // ("expected a string key"). The result is discarded anyway.
    await this.wallet.refreshValue(this.online, null, [], false);
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

  configureVssBackup(config: VssBackupConfig): void {
    this.wallet.configureVssBackup(
      config.serverUrl,
      config.storeId,
      config.signingKey
    );
  }

  disableVssAutoBackup(): void {
    this.wallet.disableVssBackup();
  }

  async vssBackup(_config: VssBackupConfig): Promise<number> {
    const raw = parseJson<{ version?: number }>(
      await this.wallet.vssBackupJson()
    );
    return raw.version ?? 0;
  }

  async vssBackupInfo(_config: VssBackupConfig): Promise<VssBackupInfo> {
    const raw = parseJson<{
      backup_exists?: boolean;
      server_version?: number;
      backup_required?: boolean;
    }>(await this.wallet.vssBackupInfoJson());
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
    const raw = parseJson<{ swap_string?: string; swapString?: string }>(
      await this.sdk.makerInitJson(params.requestJson)
    );
    return { swapString: raw.swap_string ?? raw.swapString ?? '' };
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
    const raw = parseJson<
      Array<{ swap_string?: string; swapString?: string; status?: string }>
    >(await this.sdk.listSwapsJson());
    return raw.map((s) => ({
      swapString: s.swap_string ?? s.swapString ?? '',
      status: s.status ?? '',
    }));
  }

  getLightningNode(): IRlnNodeBinding | null {
    // Lazily attach the wallet to the node the first time the LN node is
    // accessed (after on-chain wallet setup), avoiding the RefCell conflict.
    this.ensureNodeAttached();
    return this.rlnNode;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _transportEndpoint(): string {
    // The endpoint configured at create() (also registered SDK-wide via
    // setDefaultRgbProxyTransport); localhost is a dev-only last resort.
    // rgb-lib transport endpoints must use the rpc:// / rpcs:// scheme
    // (RgbTransport::JsonRpc) — configured values are http(s) URLs
    // (DEFAULT_RLN_URLS), so normalize the scheme here.
    const ep = this.configuredTransportEndpoint;
    if (!ep) return 'rpc://localhost:3000/json-rpc';
    return ep
      .replace(/^https:\/\//i, 'rpcs://')
      .replace(/^http:\/\//i, 'rpc://');
  }
}
