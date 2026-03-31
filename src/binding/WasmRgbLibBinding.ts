/**
 * WasmRgbLibBinding — browser WASM implementation of IRgbLibBinding.
 *
 * Wraps @utexo/rgb-lib-wasm (WasmWallet), translates between the canonical
 * wallet-model.ts types and the WASM binding's JS interface.
 */

import {
  WasmWallet,
  WasmInvoice,
  generate_keys,
  restore_keys,
} from '@utexo/rgb-lib-wasm';
import { initWasm } from '../wasm/init';
import {
  DEFAULT_TRANSPORT_ENDPOINTS,
  DEFAULT_INDEXER_URLS,
  normalizeNetwork,
  ValidationError,
  WalletError,
  logger,
} from '@utexo/rgb-sdk-core';
import type { IRgbLibBinding } from '@utexo/rgb-sdk-core';
import type { Network } from '../crypto/types';
import type {
  BtcBalance,
  Unspent,
  ListAssets,
  AssetBalance,
  AssetNIA,
  AssetIfa,
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
  AssignmentType,
  Assignment,
  AssetSchema,
  BitcoinNetwork,
} from '@utexo/rgb-sdk-core';
import type {
  Online as WasmOnline,
  Recipient as WasmRecipient,
  RecipientMap as WasmRecipientMap,
  WalletData as WasmWalletData,
  InvoiceData as WasmInvoiceDataJson,
} from './WasmTypes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** rgb-lib WASM expects serde snake_case `Recipient` objects (see WasmTypes). */
function batchRecipientToWasm(r: BatchRecipient): WasmRecipient {
  const wd = r.witnessData;
  const witness: WasmRecipient['witness_data'] =
    wd == null
      ? null
      : {
          amount_sat:
            typeof wd.amountSat === 'string'
              ? Number(wd.amountSat)
              : Number(wd.amountSat),
          blinding: wd.blinding ?? null,
        };

  return {
    recipient_id: r.recipientId,
    witness_data: witness,
    assignment: { Fungible: r.assignment.Fungible },
    transport_endpoints: r.transportEndpoints,
  };
}

function sdkRecipientMapToWasm(map: RecipientMap): WasmRecipientMap {
  const out: WasmRecipientMap = {};
  for (const [assetId, list] of Object.entries(map)) {
    out[assetId] = list.map(batchRecipientToWasm);
  }
  return out;
}

function normalizeReceiveData(raw: unknown): InvoiceReceiveData {
  const r = raw as Record<string, unknown>;
  return {
    invoice: String(r.invoice ?? ''),
    recipientId: String(r.recipient_id ?? r.recipientId ?? ''),
    expirationTimestamp: (r.expiration_timestamp ??
      r.expirationTimestamp ??
      null) as number | null,
    batchTransferIdx: Number(r.batch_transfer_idx ?? r.batchTransferIdx ?? 0),
  };
}

function parseWasmAssignment(raw: any): Assignment {
  if (typeof raw === 'string') {
    return { type: raw as AssignmentType };
  }
  if (typeof raw === 'object' && raw !== null) {
    if ('Fungible' in raw)
      return { type: 'Fungible', amount: Number(raw.Fungible) };
    if ('InflationRight' in raw)
      return { type: 'InflationRight', amount: Number(raw.InflationRight) };
    if ('NonFungible' in raw) return { type: 'NonFungible' };
    if ('ReplaceRight' in raw) return { type: 'ReplaceRight' };
  }
  return { type: 'Any' };
}

function normalizeBalanceFields(b: Record<string, unknown> | undefined): {
  settled: number;
  future: number;
  spendable: number;
} {
  if (!b) {
    return { settled: 0, future: 0, spendable: 0 };
  }
  return {
    settled: Number(b.settled ?? 0),
    future: Number(b.future ?? 0),
    spendable: Number(b.spendable ?? 0),
  };
}

function normalizeAssetMedia(m: unknown): AssetNIA['media'] {
  if (m == null) return m;
  const r = m as Record<string, unknown>;
  return {
    filePath: (r.file_path ?? r.filePath) as string | undefined,
    mime: r.mime != null ? String(r.mime) : undefined,
  };
}

function normalizeAssetNia(a: Record<string, unknown>): AssetNIA {
  const b = (a.balance ?? {}) as Record<string, unknown>;
  return {
    assetId: String(a.asset_id ?? a.assetId),
    ticker: String(a.ticker ?? ''),
    name: String(a.name ?? ''),
    details: (a.details ?? null) as string | null,
    precision: Number(a.precision ?? 0),
    issuedSupply: Number(a.issued_supply ?? a.issuedSupply ?? 0),
    timestamp: Number(a.timestamp ?? 0),
    addedAt: Number(a.added_at ?? a.addedAt ?? 0),
    balance: normalizeBalanceFields(b),
    media: normalizeAssetMedia(a.media),
  };
}

function normalizeAssetIfa(a: Record<string, unknown>): AssetIfa {
  const b = (a.balance ?? {}) as Record<string, unknown>;
  return {
    assetId: String(a.asset_id ?? a.assetId),
    ticker: String(a.ticker ?? ''),
    name: String(a.name ?? ''),
    details: (a.details ?? undefined) as string | undefined,
    precision: Number(a.precision ?? 0),
    initialSupply: Number(a.initial_supply ?? a.initialSupply ?? 0),
    maxSupply: Number(a.max_supply ?? a.maxSupply ?? 0),
    knownCirculatingSupply: Number(
      a.known_circulating_supply ?? a.knownCirculatingSupply ?? 0
    ),
    timestamp: Number(a.timestamp ?? 0),
    addedAt: Number(a.added_at ?? a.addedAt ?? 0),
    balance: normalizeBalanceFields(b),
    media: normalizeAssetMedia(a.media) ?? undefined,
    rejectListUrl: (a.reject_list_url ?? a.rejectListUrl ?? undefined) as
      | string
      | undefined,
  };
}

function normalizeListAssets(raw: unknown): ListAssets {
  const r = raw as Record<string, unknown>;
  const nia = (r.nia ?? []) as unknown[];
  const ifa = (r.ifa ?? []) as unknown[];
  return {
    nia: nia.map((x) => normalizeAssetNia(x as Record<string, unknown>)),
    ifa: ifa.map((x) => normalizeAssetIfa(x as Record<string, unknown>)),
    uda: [],
    cfa: [],
  };
}

function normalizeTransaction(raw: Record<string, unknown>): Transaction {
  const ct = (raw.confirmation_time ?? raw.confirmationTime) as
    | Record<string, unknown>
    | null
    | undefined;
  return {
    transactionType: (raw.transaction_type ??
      raw.transactionType) as Transaction['transactionType'],
    txid: String(raw.txid ?? ''),
    received: Number(raw.received ?? 0),
    sent: Number(raw.sent ?? 0),
    fee: Number(raw.fee ?? 0),
    confirmationTime: ct
      ? {
          height: Number(ct.height ?? 0),
          timestamp: Number(ct.timestamp ?? 0),
        }
      : undefined,
  };
}

function normalizeTransfer(raw: Record<string, unknown>): Transfer {
  const eps = (raw.transport_endpoints ??
    raw.transportEndpoints ??
    []) as Record<string, unknown>[];
  const req = raw.requested_assignment ?? raw.requestedAssignment;

  return {
    idx: Number(raw.idx ?? 0),
    batchTransferIdx: Number(
      raw.batch_transfer_idx ?? raw.batchTransferIdx ?? 0
    ),
    createdAt: Number(raw.created_at ?? raw.createdAt ?? 0),
    updatedAt: Number(raw.updated_at ?? raw.updatedAt ?? 0),
    status: raw.status as Transfer['status'],
    requestedAssignment: req != null ? parseWasmAssignment(req) : undefined,
    assignments: ((raw.assignments ?? []) as unknown[]).map((a) =>
      parseWasmAssignment(a)
    ),
    kind: raw.kind as Transfer['kind'],
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
    consignmentPath: (raw.consignment_path ??
      raw.consignmentPath ??
      undefined) as string | undefined,
  };
}

function normalizeBatchTxResult(raw: unknown): SendResult & OperationResult {
  const r = raw as Record<string, unknown>;
  return {
    txid: String(r.txid ?? ''),
    batchTransferIdx: Number(r.batch_transfer_idx ?? r.batchTransferIdx ?? 0),
  };
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export interface RgbLibGeneratedKeys {
  mnemonic: string;
  xpub: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
}

export const generateKeys = async (
  network: string = 'regtest'
): Promise<RgbLibGeneratedKeys> => {
  await initWasm();
  return generate_keys(mapNetwork(network)) as RgbLibGeneratedKeys;
};

export const restoreKeys = async (
  network: string = 'regtest',
  mnemonic: string
): Promise<RgbLibGeneratedKeys> => {
  await initWasm();
  return restore_keys(mapNetwork(network), mnemonic) as RgbLibGeneratedKeys;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapNetwork(network: string): string {
  const map: Record<string, string> = {
    mainnet: 'Mainnet',
    testnet: 'Testnet',
    testnet4: 'Testnet4',
    signet: 'Signet',
    regtest: 'Regtest',
  };
  return map[String(network).toLowerCase()] ?? 'Regtest';
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class WasmRgbLibBinding implements IRgbLibBinding {
  private wallet: WasmWallet;
  private online: WasmOnline | null = null;
  private readonly network: Network;
  private readonly originalNetwork: string;
  private readonly transportEndpoint: string;
  private readonly indexerUrl: string;
  private lastBackupBytes: Uint8Array | null = null;

  private constructor(
    wallet: WasmWallet,
    params: {
      network: string;
      transportEndpoint?: string;
      indexerUrl?: string;
    }
  ) {
    this.wallet = wallet;
    this.originalNetwork = params.network;
    this.network = normalizeNetwork(params.network);

    this.transportEndpoint =
      params.transportEndpoint ||
      DEFAULT_TRANSPORT_ENDPOINTS[this.network] ||
      DEFAULT_TRANSPORT_ENDPOINTS.signet;

    this.indexerUrl =
      params.indexerUrl ||
      DEFAULT_INDEXER_URLS[this.network] ||
      DEFAULT_INDEXER_URLS.signet;
  }

  /**
   * Async factory — initialises WASM, builds WalletData and creates the wallet
   * with IndexedDB state restoration.
   */
  static async create(params: {
    xpubVan: string;
    xpubCol: string;
    masterFingerprint: string;
    mnemonic?: string;
    network?: string | number;
    transportEndpoint?: string;
    indexerUrl?: string;
  }): Promise<WasmRgbLibBinding> {
    if (!params.mnemonic) {
      throw new ValidationError(
        'mnemonic is required for WASM wallet — the WASM binding uses it for built-in PSBT signing',
        'mnemonic'
      );
    }

    await initWasm();

    const network = String(params.network ?? 'regtest');

    const walletData: WasmWalletData = {
      data_dir: `:memory:/${network}`,
      bitcoin_network: mapNetwork(network),
      database_type: 'Sqlite',
      max_allocations_per_utxo: 5,
      account_xpub_vanilla: params.xpubVan,
      account_xpub_colored: params.xpubCol,
      mnemonic: params.mnemonic,
      master_fingerprint: params.masterFingerprint,
      vanilla_keychain: 0,
      supported_schemas: ['Nia', 'Ifa'],
    };

    let wallet: WasmWallet;
    try {
      wallet = await WasmWallet.create(JSON.stringify(walletData));
    } catch (error) {
      throw new WalletError(
        'Failed to initialize WASM wallet',
        undefined,
        error as Error
      );
    }

    return new WasmRgbLibBinding(wallet, {
      network,
      transportEndpoint: params.transportEndpoint,
      indexerUrl: params.indexerUrl,
    });
  }

  // ─── Online management ──────────────────────────────────────────────────────

  private async ensureOnline(): Promise<WasmOnline> {
    if (this.online) return this.online;
    try {
      this.online = (await this.wallet.go_online(
        false,
        this.indexerUrl
      )) as WasmOnline;
    } catch (error) {
      throw new WalletError(
        'Failed to establish online connection',
        undefined,
        error as Error
      );
    }
    return this.online;
  }

  /** IRgbLibBinding: fire-and-forget online connection. */
  getOnline(): void {
    this.ensureOnline().catch((e) =>
      logger.warn('WasmRgbLibBinding: go_online failed:', e)
    );
  }

  /** Awaitable connection — use this instead of getOnline() when you need to know it succeeded. */
  async connect(): Promise<void> {
    await this.ensureOnline();
  }

  dropWallet(): void {
    this.online = null;
    try {
      this.wallet.free();
    } catch {
      // already freed
    }
  }

  registerWallet(): { address: string; btcBalance: BtcBalance } {
    const address = this.wallet.get_address();
    const btcBalance = this.wallet.get_btc_balance() as BtcBalance;
    return { address, btcBalance };
  }

  // ─── Balance & address ──────────────────────────────────────────────────────

  async getBtcBalance(): Promise<BtcBalance> {
    return this.wallet.get_btc_balance() as BtcBalance;
  }

  async getAddress(): Promise<string> {
    return this.wallet.get_address();
  }

  // ─── Unspents ───────────────────────────────────────────────────────────────

  async listUnspents(): Promise<Unspent[]> {
    const raw: any[] = this.wallet.list_unspents(false) as any[];
    return raw.map((unspent) => {
      const rgbAllocs = unspent.rgb_allocations ?? unspent.rgbAllocations ?? [];
      return {
        utxo: {
          outpoint: unspent.utxo.outpoint,
          btcAmount: Number(
            unspent.utxo.btc_amount ?? unspent.utxo.btcAmount ?? 0
          ),
          colorable: Boolean(unspent.utxo.colorable),
          exists: unspent.utxo?.exists ?? true,
        },
        rgbAllocations: rgbAllocs.map((allocation: any) => {
          const keys = Object.keys(allocation.assignment ?? {});
          const assignmentType = keys[0] as AssignmentType | undefined;
          const assignment: Assignment = {
            type: assignmentType ?? 'Any',
            amount:
              assignmentType && allocation.assignment[assignmentType]
                ? Number(allocation.assignment[assignmentType])
                : undefined,
          };
          return {
            assetId: allocation.asset_id ?? allocation.assetId,
            assignment,
            settled: allocation.settled,
          };
        }),
        pendingBlinded: Number(
          unspent.pending_blinded ?? unspent.pendingBlinded ?? 0
        ),
      };
    });
  }

  // ─── UTXO creation ──────────────────────────────────────────────────────────

  async createUtxosBegin(
    params: CreateUtxosBeginRequestModel
  ): Promise<string> {
    const online = await this.ensureOnline();
    return this.wallet.create_utxos_begin(
      online,
      params.upTo ?? false,
      params.num ?? undefined,
      params.size ?? undefined,
      BigInt(Math.round(params.feeRate ?? 1)),
      false
    );
  }

  async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
    const online = await this.ensureOnline();
    return this.wallet.create_utxos_end(
      online,
      params.signedPsbt,
      params.skipSync ?? false
    );
  }

  // ─── Send assets ────────────────────────────────────────────────────────────

  async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
    const wasmInvoice = new WasmInvoice(params.invoice);
    const raw = wasmInvoice.invoiceData() as Partial<WasmInvoiceDataJson> &
      Record<string, unknown>;
    wasmInvoice.free();

    const assetId = (raw.asset_id ?? raw.assetId ?? params.assetId) as
      | string
      | undefined;
    if (!assetId) {
      throw new ValidationError(
        'assetId is required — either encode it in the invoice or pass it as params.assetId',
        'assetId'
      );
    }

    const rawAssignment = raw.assignment;
    let amount: number;
    if (
      typeof rawAssignment === 'object' &&
      rawAssignment !== null &&
      'Fungible' in rawAssignment
    ) {
      const invoiceAmount = Number(
        (rawAssignment as { Fungible: number }).Fungible
      );
      amount = invoiceAmount > 0 ? invoiceAmount : (params.amount ?? 0);
    } else {
      amount = params.amount ?? 0;
    }

    const transportEndpoints = (raw.transport_endpoints ??
      raw.transportEndpoints) as string[] | undefined;

    const witnessData: WasmRecipient['witness_data'] =
      params.witnessData != null
        ? {
            amount_sat: String(params.witnessData.amountSat),
            blinding: params.witnessData.blinding ?? null,
          }
        : null;

    const recipient: WasmRecipient = {
      recipient_id: String(raw.recipient_id ?? raw.recipientId ?? ''),
      witness_data: witnessData,
      assignment: { Fungible: amount },
      transport_endpoints: transportEndpoints ?? [],
    };

    const online = await this.ensureOnline();
    console.log('recipient', recipient);
    const r = this.wallet.send_begin(
      online,
      { [assetId]: [recipient] } as WasmRecipientMap,
      params.donation ?? true,
      BigInt(Math.round(params.feeRate ?? 1)),
      params.minConfirmations ?? 1
    );
    console.log('r', r);
    return r;
  }

  async sendBeginBatch(params: {
    recipientMap: RecipientMap;
    feeRate?: number;
    minConfirmations?: number;
    donation?: boolean;
  }): Promise<string> {
    const online = await this.ensureOnline();

    if (!params.recipientMap || Object.keys(params.recipientMap).length === 0) {
      throw new ValidationError(
        'recipientMap must contain at least one asset id',
        'recipientMap'
      );
    }

    return this.wallet.send_begin(
      online,
      sdkRecipientMapToWasm(params.recipientMap),
      params.donation ?? true,
      BigInt(Math.round(params.feeRate ?? 1)),
      params.minConfirmations ?? 1
    );
  }

  async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
    const online = await this.ensureOnline();
    const raw = await this.wallet.send_end(
      online,
      params.signedPsbt,
      params.skipSync ?? false
    );
    return normalizeBatchTxResult(raw);
  }

  // ─── Send BTC ───────────────────────────────────────────────────────────────

  async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
    const online = await this.ensureOnline();
    return this.wallet.send_btc_begin(
      online,
      params.address,
      BigInt(Math.round(params.amount)),
      BigInt(Math.round(params.feeRate)),
      params.skipSync ?? false
    );
  }

  async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
    const online = await this.ensureOnline();
    return this.wallet.send_btc_end(
      online,
      params.signedPsbt,
      params.skipSync ?? false
    );
  }

  // ─── Receive ────────────────────────────────────────────────────────────────

  async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    const assignment =
      params.amount != null ? { Fungible: params.amount } : 'Any';

    const raw: unknown = this.wallet.blind_receive(
      params.assetId ?? null,
      assignment,
      params.durationSeconds ?? null,
      [this.transportEndpoint],
      params.minConfirmations ?? 1
    );
    return normalizeReceiveData(raw);
  }

  async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
    const assignment =
      params.amount != null ? { Fungible: params.amount } : 'Any';

    const raw: unknown = this.wallet.witness_receive(
      params.assetId ?? null,
      assignment,
      params.durationSeconds ?? null,
      [this.transportEndpoint],
      params.minConfirmations ?? 1
    );
    return normalizeReceiveData(raw);
  }

  async decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
    const wasmInvoice = new WasmInvoice(params.invoice);
    const raw = wasmInvoice.invoiceData() as Partial<WasmInvoiceDataJson> &
      Record<string, unknown>;
    wasmInvoice.free();
    return {
      invoice: params.invoice,
      recipientId: String(raw.recipient_id ?? raw.recipientId ?? ''),
      assetSchema: (raw.asset_schema ?? raw.assetSchema) as
        | AssetSchema
        | undefined,
      assetId: (raw.asset_id ?? raw.assetId) as string | undefined,
      network: raw.network as BitcoinNetwork,
      assignment: parseWasmAssignment(raw.assignment),
      assignmentName: (raw.assignment_name ?? raw.assignmentName) as
        | string
        | undefined,
      expirationTimestamp: (raw.expiration_timestamp ??
        raw.expirationTimestamp ??
        null) as number | null,
      transportEndpoints: (raw.transport_endpoints ??
        raw.transportEndpoints ??
        []) as string[],
    };
  }

  // ─── Assets ─────────────────────────────────────────────────────────────────

  async listAssets(): Promise<ListAssets> {
    const raw = this.wallet.list_assets([]);
    return normalizeListAssets(raw);
  }

  async getAssetBalance(assetId: string): Promise<AssetBalance> {
    const balance: Record<string, unknown> = this.wallet.get_asset_balance(
      assetId
    ) as Record<string, unknown>;
    return {
      settled: Number(balance.settled ?? 0),
      future: Number(balance.future ?? 0),
      spendable: Number(balance.spendable ?? 0),
      offchainOutbound: Number(
        balance.offchain_outbound ?? balance.offchainOutbound ?? 0
      ),
      offchainInbound: Number(
        balance.offchain_inbound ?? balance.offchainInbound ?? 0
      ),
    };
  }

  async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
    const raw = this.wallet.issue_asset_nia(
      params.ticker,
      params.name,
      params.precision,
      params.amounts
    ) as Record<string, unknown>;
    return normalizeAssetNia(raw);
  }

  async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<AssetIfa> {
    const raw = this.wallet.issue_asset_ifa(
      params.ticker,
      params.name,
      params.precision,
      params.amounts,
      params.inflationAmounts,
      params.replaceRightsNum,
      params.rejectListUrl ?? null
    ) as Record<string, unknown>;
    return normalizeAssetIfa(raw);
  }

  // ─── Inflate ────────────────────────────────────────────────────────────────

  async inflateBegin(params: InflateAssetIfaRequestModel): Promise<string> {
    const online = await this.ensureOnline();
    return this.wallet.inflate_begin(
      online,
      params.assetId,
      params.inflationAmounts,
      BigInt(Math.round(params.feeRate ?? 1)),
      params.minConfirmations ?? 1
    );
  }

  async inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
    const online = await this.ensureOnline();
    const raw = await this.wallet.inflate_end(online, params.signedPsbt);
    return normalizeBatchTxResult(raw);
  }

  // ─── Transfers & transactions ────────────────────────────────────────────────

  async listTransactions(): Promise<Transaction[]> {
    const raw = this.wallet.list_transactions() as Record<string, unknown>[];
    return raw.map((t) => normalizeTransaction(t));
  }

  async listTransfers(assetId?: string): Promise<Transfer[]> {
    const raw = this.wallet.list_transfers(assetId ?? null) as Record<
      string,
      unknown
    >[];
    return raw.map((t) => normalizeTransfer(t));
  }

  async failTransfers(params: FailTransfersRequest): Promise<boolean> {
    const online = await this.ensureOnline();
    return this.wallet.fail_transfers(
      online,
      params.batchTransferIdx ?? null,
      params.noAssetOnly ?? false,
      params.skipSync ?? false
    );
  }

  deleteTransfers(params: {
    batchTransferIdx?: number;
    noAssetOnly?: boolean;
  }): boolean {
    return this.wallet.delete_transfers(
      params.batchTransferIdx ?? null,
      params.noAssetOnly ?? false
    );
  }

  // ─── Refresh / sync ─────────────────────────────────────────────────────────

  async refreshWallet(): Promise<void> {
    const online = await this.ensureOnline();
    const r = await this.wallet.refresh(online, null, [], false);
    console.log('r', r);
  }

  async syncWallet(): Promise<void> {
    const online = await this.ensureOnline();
    await this.wallet.sync(online);
  }

  // ─── Fee estimation ─────────────────────────────────────────────────────────

  async getFeeEstimation(params: {
    blocks: number;
  }): Promise<GetFeeEstimationResponse> {
    const online = await this.ensureOnline();
    try {
      return await this.wallet.get_fee_estimation(online, params.blocks);
    } catch {
      logger.warn(
        'WasmRgbLibBinding: fee estimation unavailable, using default 2'
      );
      return 2 as GetFeeEstimationResponse;
    }
  }

  // ─── Backup ─────────────────────────────────────────────────────────────────

  /**
   * IRgbLibBinding.createBackup — the `backupPath` param is ignored in WASM
   * (no filesystem). Backup bytes are returned via `getLastBackupBytes()`.
   */
  async createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse> {
    if (!params.password) {
      throw new ValidationError('password is required', 'password');
    }
    this.lastBackupBytes = this.wallet.backup(params.password);
    return {
      message: 'Backup created successfully',
      backupPath: ':memory:',
    };
  }

  /**
   * WASM-specific: return the raw backup bytes from the last createBackup call.
   */
  getLastBackupBytes(): Uint8Array | null {
    return this.lastBackupBytes;
  }

  /**
   * WASM-specific: restore wallet state from raw backup bytes.
   */
  restoreFromBackupBytes(bytes: Uint8Array, password: string): void {
    this.wallet.restore_backup(bytes, password);
  }

  // ─── VSS backup ─────────────────────────────────────────────────────────────

  configureVssBackup(config: VssBackupConfig): void {
    this.wallet.configure_vss_backup(
      config.serverUrl,
      config.storeId,
      config.signingKey
    );
  }

  disableVssAutoBackup(): void {
    this.wallet.disable_vss_backup();
  }

  async vssBackup(_config: VssBackupConfig): Promise<number> {
    // Config must already be set via configureVssBackup before calling.
    const version = await this.wallet.vss_backup();
    return Number(version);
  }

  async vssBackupInfo(_config: VssBackupConfig): Promise<VssBackupInfo> {
    const info: any = await this.wallet.vss_backup_info();
    return {
      backupExists: Boolean(info.backup_exists ?? info.backupExists),
      serverVersion: info.server_version ?? info.serverVersion ?? null,
      backupRequired: Boolean(info.backup_required ?? info.backupRequired),
    };
  }

  async vssRestoreBackup(): Promise<void> {
    await this.wallet.vss_restore_backup();
  }

  // ─── PSBT signing (built-in) ─────────────────────────────────────────────────

  /**
   * Sign an unsigned PSBT using the wallet's built-in mnemonic-based signer.
   * Called by WasmSigner.signPsbtWithMnemonic (Phase 3).
   */
  signPsbt(unsignedPsbt: string): string {
    return this.wallet.sign_psbt(unsignedPsbt);
  }

  finalizePsbt(signedPsbt: string): string {
    return this.wallet.finalize_psbt(signedPsbt);
  }
}
