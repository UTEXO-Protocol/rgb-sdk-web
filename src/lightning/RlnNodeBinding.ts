/**
 * RlnNodeBinding — IRlnNodeBinding implementation using RlnWasmNode.
 *
 * All methods delegate to nodeHandle.*Json() / *Value() and normalize output
 * to the canonical rln-model.ts types.
 */

import type { RlnWasmNode } from 'rln-wasm-sdk';
import type { AssetNIA, AssetCFA } from '@utexo/rgb-sdk-core';
import type { IRlnNodeBinding } from '../rln';
import type {
  IssueAssetNiaRequest,
  IssueAssetCfaRequest,
  LightningChannel,
  OpenChannelParams,
  LightningInvoice,
  CreateLnInvoiceParams,
  CreateHodlLnInvoiceParams,
  LightningPayment,
  LightningPaymentStatus,
  SendPaymentParams,
  SendPaymentResult,
  KeysendParams,
  LightningPeer,
  LightningNodeInfo,
  LdkRuntimeStatus,
  LightningNetworkInfo,
  InvoiceStatus,
  DecodedLnInvoice,
  HodlInvoiceResult,
  PaymentStatusUpdate,
  ListRuntimeEventsResult,
  ApayNewResponse,
  ApayHashEntry,
} from '../rln';
import type {
  RlnRawAssetNia,
  RlnRawAssetCfa,
  RlnRawChannel,
  RlnRawPayment,
  RlnRawInvoice,
  RlnRawPeer,
  RlnRawNodeInfo,
  RlnRawNetworkInfo,
} from '../binding/RlnWasmTypes';

// ─── Normalizers ──────────────────────────────────────────────────────────────

function parseJson<T>(jsonStr: string): T {
  return JSON.parse(jsonStr) as T;
}

function normalizeAssetNia(raw: RlnRawAssetNia): AssetNIA {
  return {
    assetId: String(raw.asset_id ?? raw.assetId ?? ''),
    ticker: String(raw.ticker ?? ''),
    name: String(raw.name ?? ''),
    details: (raw.details ?? null) as string | null,
    precision: Number(raw.precision ?? 0),
    issuedSupply: Number(raw.issued_supply ?? raw.issuedSupply ?? 0),
    timestamp: Number(raw.timestamp ?? 0),
    addedAt: Number(raw.added_at ?? raw.addedAt ?? 0),
    balance: {
      settled: Number(raw.balance?.settled ?? 0),
      future: Number(raw.balance?.future ?? 0),
      spendable: Number(raw.balance?.spendable ?? 0),
    },
  };
}

function normalizeAssetCfa(raw: RlnRawAssetCfa): AssetCFA {
  return {
    assetId: String(raw.asset_id ?? raw.assetId ?? ''),
    name: String(raw.name ?? ''),
    details: (raw.details ?? undefined) as string | undefined,
    precision: Number(raw.precision ?? 0),
    issuedSupply: Number(raw.issued_supply ?? raw.issuedSupply ?? 0),
    timestamp: Number(raw.timestamp ?? 0),
    addedAt: Number(raw.added_at ?? raw.addedAt ?? 0),
    balance: {
      settled: Number(raw.balance?.settled ?? 0),
      future: Number(raw.balance?.future ?? 0),
      spendable: Number(raw.balance?.spendable ?? 0),
    },
  };
}

function normalizeChannel(raw: RlnRawChannel): LightningChannel {
  return {
    channelId: String(raw.channel_id ?? raw.channelId ?? ''),
    peerPubkey: String(raw.peer_pubkey ?? raw.peerPubkey ?? ''),
    capacitySat: Number(raw.capacity_sat ?? raw.capacitySat ?? 0),
    // The current wasm channel view (RlnWasmNodeChannelData) has no
    // local/remote balance fields — only outbound_msat (spendable outbound).
    // Fall back to it so balances don't read 0 forever
    // (waitForOutboundLiquidity polls outboundBalanceMsat).
    localBalanceMsat: Number(
      raw.local_balance_msat ?? raw.localBalanceMsat ?? raw.outbound_msat ?? 0
    ),
    remoteBalanceMsat: Number(raw.remote_balance_msat ?? raw.remoteBalanceMsat ?? 0),
    isPublic: Boolean(raw.is_public ?? raw.isPublic ?? raw.public),
    isActive: Boolean(raw.is_active ?? raw.isActive ?? raw.ready),
    isUsable: Boolean(raw.is_usable ?? raw.isUsable ?? raw.is_active ?? raw.isActive ?? raw.ready),
    outboundBalanceMsat: Number(
      raw.outbound_msat ?? raw.outbound_balance_msat ?? raw.outboundBalanceMsat ?? raw.local_balance_msat ?? raw.localBalanceMsat ?? 0
    ),
    inboundBalanceMsat: Number(
      raw.inbound_balance_msat ?? raw.inboundBalanceMsat ?? raw.remote_balance_msat ?? raw.remoteBalanceMsat ?? 0
    ),
    assetId: (raw.asset_id ?? raw.assetId ?? undefined) as string | undefined,
    assetLocalAmount: raw.asset_local_amount != null
      ? Number(raw.asset_local_amount ?? raw.assetLocalAmount)
      : undefined,
  };
}

/** Fold wasm payment statuses (lowercase live-ledger values like "succeeded",
 *  "claimable" — or scaffold strings) into the LightningPaymentStatus union. */
function foldPaymentStatus(raw: unknown): LightningPaymentStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'succeeded' || s === 'settled' || s === 'paid') return 'Succeeded';
  if (s === 'failed' || s === 'expired') return 'Failed';
  return 'Pending'; // pending / claimable / claiming / unknown
}

function normalizePayment(raw: RlnRawPayment): LightningPayment {
  return {
    paymentHash: String(raw.payment_hash ?? raw.paymentHash ?? ''),
    amtMsat: raw.amt_msat != null ? BigInt(raw.amt_msat as number) : undefined,
    status: foldPaymentStatus(raw.status),
    assetId: (raw.asset_id ?? raw.assetId ?? undefined) as string | undefined,
    assetAmount: raw.asset_amount != null ? BigInt(raw.asset_amount as number) : undefined,
    invoice: (raw.invoice ?? undefined) as string | undefined,
    inbound: Boolean(raw.inbound),
  };
}

/** Shape of the wasm live event-stream payment record (livePaymentValue). */
type LiveRawPayment = {
  payment_hash?: string;
  status?: string;
  amt_msat?: number;
  asset_id?: string | null;
  asset_amount?: number | null;
  inbound?: boolean;
  preimage?: string | null;
  expires_at?: number | null;
};

/** Fold a wasm status string into the InvoiceStatus union. */
function foldInvoiceStatus(raw: unknown, expiresAt?: number | null): InvoiceStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'succeeded' || s === 'settled' || s === 'paid') return 'Paid';
  if (s === 'expired' || s === 'failed') return 'Expired';
  if (expiresAt && Date.now() / 1000 > expiresAt) return 'Expired';
  return 'Pending';
}

function normalizeInvoice(raw: RlnRawInvoice): LightningInvoice {
  return {
    invoice: String(raw.invoice ?? ''),
    paymentHash: String(raw.payment_hash ?? raw.paymentHash ?? ''),
    expirySeconds: Number(raw.expiry_sec ?? raw.expirySec ?? 0),
    amtMsat: raw.amt_msat != null ? BigInt(raw.amt_msat as number) : undefined,
    assetId: (raw.asset_id ?? raw.assetId ?? undefined) as string | undefined,
    assetAmount: raw.asset_amount != null ? BigInt(raw.asset_amount as number) : undefined,
  };
}

function normalizePeer(raw: RlnRawPeer): LightningPeer {
  return {
    pubkey: String(raw.pubkey ?? ''),
    address: (raw.address ?? undefined) as string | undefined,
  };
}

function normalizeNodeInfo(raw: RlnRawNodeInfo): LightningNodeInfo {
  return {
    pubkey: String(raw.pubkey ?? ''),
    numChannels: Number(raw.num_channels ?? raw.numChannels ?? 0),
    numUsableChannels: Number(raw.num_usable_channels ?? raw.numUsableChannels ?? 0),
    localBalanceMsat: Number(raw.local_balance_msat ?? raw.localBalanceMsat ?? 0),
  };
}

function normalizeNetworkInfo(raw: RlnRawNetworkInfo): LightningNetworkInfo {
  return {
    network: String(raw.network ?? ''),
    blockHeight: Number(raw.block_height ?? raw.blockHeight ?? 0),
  };
}

/** node.apayNewValue returns snake_case keys (serde) — normalize to ApayNewResponse. */
function normalizeApayResponse(raw: unknown): ApayNewResponse {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = (camel: string, snake: string): unknown => r[camel] ?? r[snake];
  const hashes = (pick('hashes', 'hashes') ?? []) as Array<Record<string, unknown>>;
  return {
    requestId: String(pick('requestId', 'request_id') ?? ''),
    hostNodeId: String(pick('hostNodeId', 'host_node_id') ?? ''),
    protocolVersion: Number(pick('protocolVersion', 'protocol_version') ?? 0),
    orderId: String(pick('orderId', 'order_id') ?? ''),
    status: String(r.status ?? ''),
    acceptedThroughIndex: Number(pick('acceptedThroughIndex', 'accepted_through_index') ?? 0),
    nextIndexExpected: Number(pick('nextIndexExpected', 'next_index_expected') ?? 0),
    unusedHashes: Number(pick('unusedHashes', 'unused_hashes') ?? 0),
    refillBatchSize: Number(pick('refillBatchSize', 'refill_batch_size') ?? 0),
    firstHashIndex: Number(pick('firstHashIndex', 'first_hash_index') ?? 0),
    lastHashIndex: Number(pick('lastHashIndex', 'last_hash_index') ?? 0),
    hashes: hashes.map(
      (h): ApayHashEntry => ({
        hashIndex: Number(h.hashIndex ?? h.hash_index ?? 0),
        paymentHash: String(h.paymentHash ?? h.payment_hash ?? ''),
      })
    ),
  };
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class RlnNodeBinding implements IRlnNodeBinding {
  private readonly nodeHandle: RlnWasmNode;

  constructor(nodeHandle: RlnWasmNode) {
    this.nodeHandle = nodeHandle;
  }

  // ── Asset Issuance ─────────────────────────────────────────────────────────

  async issueAssetNia(params: IssueAssetNiaRequest): Promise<AssetNIA> {
    const raw = this.nodeHandle.issueAssetNiaValue({
      ticker: params.ticker,
      name: params.name,
      precision: params.precision,
      amounts: params.amounts,
    });
    return normalizeAssetNia(raw as RlnRawAssetNia);
  }

  async issueAssetCfa(params: IssueAssetCfaRequest): Promise<AssetCFA> {
    const raw = this.nodeHandle.issueAssetCfaValue({
      name: params.name,
      precision: params.precision,
      amounts: params.amounts,
      description: params.description,
    });
    return normalizeAssetCfa(raw as RlnRawAssetCfa);
  }

  // ── Channels ───────────────────────────────────────────────────────────────

  async openChannel(params: OpenChannelParams): Promise<string> {
    const raw = parseJson<{ channel_id?: string; channelId?: string }>(
      this.nodeHandle.openChannelJson(
        params.peerPubkey,
        params.capacitySat,
        params.isPublic,
        params.assetId ?? null,
        params.assetLocalAmount ?? null
      )
    );
    return String(raw.channel_id ?? raw.channelId ?? '');
  }

  closeChannel(channelId: string, peerPubkey?: string, force?: boolean): void {
    if (peerPubkey != null || force != null) {
      this.nodeHandle.closeChannelWithOptions(channelId, peerPubkey ?? null, force ?? false);
    } else {
      this.nodeHandle.closeChannel(channelId);
    }
  }

  /**
   * Drive the node's queued RGB work: funding-consignment validation for
   * inbound/LSP-opened colored channels, funding PSBT completion for outbound
   * ones, and pending RGB transaction fascia for in-flight HTLCs (commitment /
   * HTLC coloring). The wasm node has no background executor — the interop
   * reference flows call driveRgbFundingWork() inside their wait loops — so the
   * SDK's polling read paths (listChannels, invoiceStatus, getPayment) double
   * as the drive beat. Without it an inbound RGB channel stalls at
   * RgbFundingValidationRequired and RGB payments stay Pending forever.
   */
  private async driveRgbWorkBestEffort(): Promise<void> {
    try {
      // Refresh the LDK best-block from the indexer and flush pending peer
      // frames (the interop reference drives this in every wait loop). A stale
      // height makes peers reject our HTLCs with expiry_too_soon. Requires the
      // dormant chain-sync session started on wallet attach; errors are benign.
      await this.nodeHandle.chainSyncTickValue();
    } catch {
      /* no active sync session yet, or transient indexer error */
    }
    try {
      await this.nodeHandle.driveRgbFundingWork();
    } catch {
      // Transient (indexer catch-up, proxy hiccup); the work item is re-queued
      // internally and retried on the next poll.
    }
  }

  async listChannels(): Promise<LightningChannel[]> {
    await this.driveRgbWorkBestEffort();
    const raw = parseJson<RlnRawChannel[]>(this.nodeHandle.listChannelsJson());
    return raw.map(normalizeChannel);
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  async createLnInvoice(params: CreateLnInvoiceParams): Promise<LightningInvoice> {
    // Use the LIVE ChannelManager invoice API (createLnInvoiceLiveJson — same as the
    // wasm-interop e2e reference), NOT the scaffold createLnInvoiceJson builder. The
    // live invoice (a) registers the payment secret/preimage with the ChannelManager
    // so the inbound HTLC auto-claims, and (b) embeds private-channel route hints —
    // required for multi-hop payments routed through the LSP. The scaffold invoice
    // has neither, so an LSP-routed payment finds no route and sticks at Pending.
    const raw = parseJson<{ invoice?: string }>(
      this.nodeHandle.createLnInvoiceLiveJson(
        params.amtMsat ?? null,
        params.expirySec,
        params.assetId ?? null,
        params.assetAmount ?? null
      )
    );
    const invoice = String(raw.invoice ?? '');
    const decoded = await this.decodeLnInvoice(invoice).catch(() => null);
    return {
      invoice,
      paymentHash: decoded?.paymentHash ?? '',
      expirySeconds: decoded?.expirySeconds || params.expirySec,
      amtMsat: decoded?.amtMsat ?? (params.amtMsat != null ? BigInt(params.amtMsat) : undefined),
      assetId: params.assetId ?? undefined,
      assetAmount: params.assetAmount != null ? BigInt(params.assetAmount) : undefined,
    };
  }

  async sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
    // sendPaymentLiveJson, NOT sendPaymentJson: the scaffold path only *records* a
    // parity-model payment and never constructs an HTLC — nothing reaches the wire
    // (verified: zero HTLC traffic at the LSP). The live path routes a real HTLC
    // via the ChannelManager, same as the wasm-interop reference flows.
    const raw = parseJson<{ payment_hash?: string; status?: string }>(
      this.nodeHandle.sendPaymentLiveJson(
        params.invoice,
        params.amtMsat ?? null,
        params.assetId ?? null,
        params.assetAmount ?? null
      )
    );
    return normalizePayment({
      payment_hash: raw.payment_hash,
      status: raw.status,
      amt_msat: params.amtMsat ?? undefined,
      asset_id: params.assetId ?? undefined,
      asset_amount: params.assetAmount ?? undefined,
      invoice: params.invoice,
      inbound: false,
    } as RlnRawPayment);
  }

  async keysend(params: KeysendParams): Promise<SendPaymentResult> {
    // keysendLiveJson for the same reason as sendPayment above.
    const raw = parseJson<RlnRawPayment>(
      this.nodeHandle.keysendLiveJson(
        params.destPubkey,
        params.amtMsat,
        params.assetId ?? null,
        params.assetAmount ?? null
      )
    );
    return normalizePayment(raw);
  }

  /**
   * The wasm node keeps two payment ledgers that don't see each other (see
   * WASM_LIVE_INVOICE_STATUS_GAP.md): scaffold maps (read by getPaymentJson /
   * invoiceStatusJson / listPaymentsJson) and the live event-stream ledger fed by
   * real LDK events (read by livePaymentValue / livePaymentsValue). Live-API
   * invoices (createLnInvoiceLiveJson) and real HTLC sends exist only in the
   * latter — the intended consumption pattern per the wasm-interop reference
   * flows — so the read paths below consult the live ledger too.
   */
  private livePayment(paymentHash: string): LiveRawPayment | null {
    try {
      const v = this.nodeHandle.livePaymentValue(paymentHash) as LiveRawPayment | null;
      return v && typeof v === 'object' ? v : null;
    } catch {
      return null;
    }
  }

  private mergedRawPayments(): RlnRawPayment[] {
    const scaffold = parseJson<RlnRawPayment[]>(this.nodeHandle.listPaymentsJson());
    const seen = new Set(scaffold.map((p) => String(p.payment_hash ?? p.paymentHash ?? '')));
    try {
      const live = (this.nodeHandle.livePaymentsValue() as RlnRawPayment[] | null) ?? [];
      for (const p of live) {
        const hash = String(p.payment_hash ?? '');
        if (hash && !seen.has(hash)) scaffold.push(p);
      }
    } catch {
      // live ledger unavailable (runtime not started yet) — scaffold list stands
    }
    return scaffold;
  }

  async listPayments(): Promise<LightningPayment[]> {
    await this.driveRgbWorkBestEffort();
    return this.mergedRawPayments().map(normalizePayment);
  }

  async listPaymentsRaw(): Promise<unknown[]> {
    await this.driveRgbWorkBestEffort();
    return this.mergedRawPayments();
  }

  async getPayment(paymentHash: string): Promise<LightningPayment | null> {
    await this.driveRgbWorkBestEffort();
    try {
      const raw = parseJson<RlnRawPayment>(this.nodeHandle.getPaymentJson(paymentHash));
      return normalizePayment(raw);
    } catch {
      const live = this.livePayment(paymentHash);
      return live ? normalizePayment(live as RlnRawPayment) : null;
    }
  }

  async invoiceStatus(invoice: string): Promise<InvoiceStatus> {
    await this.driveRgbWorkBestEffort();
    // Live-API invoices resolve via payment hash in the live ledger; the scaffold
    // invoiceStatusJson errors "unknown LN invoice" for them.
    try {
      const { paymentHash } = await this.decodeLnInvoice(invoice);
      const live = paymentHash ? this.livePayment(paymentHash) : null;
      if (live) return foldInvoiceStatus(live.status, live.expires_at);
    } catch {
      // fall through to the scaffold reader
    }
    const raw = parseJson<{ status?: string }>(this.nodeHandle.invoiceStatusJson(invoice));
    return foldInvoiceStatus(raw.status);
  }

  async failPendingPayments(): Promise<void> {
    this.nodeHandle.failPendingPayments();
  }

  async updatePaymentStatus(params: PaymentStatusUpdate): Promise<void> {
    if (params.invoice) {
      this.nodeHandle.updatePaymentStatusByInvoice(params.invoice, params.status);
    } else if (params.paymentHash) {
      this.nodeHandle.updatePaymentStatus(params.paymentHash, params.status);
    }
  }

  // ── HODL invoices ──────────────────────────────────────────────────────────

  async createHodlLnInvoice(params: CreateHodlLnInvoiceParams): Promise<LightningInvoice> {
    const raw = parseJson<RlnRawInvoice>(
      this.nodeHandle.createHodlLnInvoiceJson(
        params.amtMsat ?? null,
        params.expirySec,
        params.assetId ?? null,
        params.assetAmount ?? null,
        params.paymentHash
      )
    );
    return normalizeInvoice(raw);
  }

  async cancelHodlInvoice(paymentHash: string): Promise<HodlInvoiceResult> {
    const raw = parseJson<{ payment_hash?: string; status?: string }>(
      this.nodeHandle.cancelHodlInvoiceJson(paymentHash)
    );
    return {
      paymentHash: String(raw.payment_hash ?? paymentHash),
      status: String(raw.status ?? ''),
    };
  }

  async claimHodlInvoice(paymentHash: string, preimage: string): Promise<HodlInvoiceResult> {
    const raw = parseJson<{ payment_hash?: string; status?: string }>(
      this.nodeHandle.claimHodlInvoiceJson(paymentHash, preimage)
    );
    return {
      paymentHash: String(raw.payment_hash ?? paymentHash),
      status: String(raw.status ?? ''),
    };
  }

  // ── Peers ──────────────────────────────────────────────────────────────────

  async connectPeer(peerAddr: string, peerPubkey: string): Promise<void> {
    console.log(peerAddr, peerPubkey)
    await this.nodeHandle.connectPeer(peerAddr, peerPubkey);
  }

  async disconnectPeer(peerPubkey: string): Promise<void> {
    await this.nodeHandle.disconnectPeer(peerPubkey);
  }

  async listPeers(): Promise<LightningPeer[]> {
    const raw = parseJson<RlnRawPeer[]>(this.nodeHandle.listPeersJson());
    return raw.map(normalizePeer);
  }

  // ── Info & Status ──────────────────────────────────────────────────────────

  nodePubkey(): string {
    const jsonStr = this.nodeHandle.nodePubkeyJson();
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'string') return parsed.trim();
      if (parsed && typeof parsed === 'object') {
        const candidate = (parsed as Record<string, unknown>).pubkey ?? (parsed as Record<string, unknown>).node_pubkey;
        if (typeof candidate === 'string') return candidate.trim();
      }
    } catch {
      if (typeof jsonStr === 'string') return jsonStr.trim();
    }
    return '';
  }

  async nodeInfo(): Promise<LightningNodeInfo> {
    const raw = parseJson<RlnRawNodeInfo>(this.nodeHandle.nodeInfoJson());
    const info = normalizeNodeInfo(raw);
    // wasm nodeInfoJson carries runtime/channel counters but no pubkey — fill
    // it from the dedicated nodePubkeyJson getter so consumers relying on
    // getNodeInfo().pubkey (enableLightningAddress, refillHashPool) work.
    if (!info.pubkey) info.pubkey = this.nodePubkey();
    return info;
  }

  async networkInfo(): Promise<LightningNetworkInfo> {
    const raw = parseJson<RlnRawNetworkInfo>(this.nodeHandle.networkInfoJson());
    return normalizeNetworkInfo(raw);
  }

  async ldkRuntimeStatus(): Promise<LdkRuntimeStatus> {
    const raw = parseJson<{ is_running?: boolean; isRunning?: boolean }>(
      this.nodeHandle.ldkRuntimeStatusJson()
    );
    return { isRunning: Boolean(raw.is_running ?? raw.isRunning) };
  }

  async listRuntimeEvents(): Promise<ListRuntimeEventsResult> {
    const raw = parseJson<unknown[]>(this.nodeHandle.listRuntimeEventsJson());
    return { events: raw };
  }

  // ── Decoding ───────────────────────────────────────────────────────────────

  async decodeLnInvoice(invoice: string): Promise<DecodedLnInvoice> {
    const raw = parseJson<{
      payment_hash?: string;
      paymentHash?: string;
      amt_msat?: number | bigint | null;
      amtMsat?: number | bigint | null;
      description?: string | null;
      expiry?: number;
      payee?: string | null;
    }>(this.nodeHandle.decodeLnInvoiceJson(invoice));
    return {
      paymentHash: String(raw.payment_hash ?? raw.paymentHash ?? ''),
      amtMsat: raw.amt_msat != null ? BigInt(raw.amt_msat as number) : undefined,
      description: (raw.description ?? undefined) as string | undefined,
      expirySeconds: Number(raw.expiry ?? 0),
      payee: (raw.payee ?? undefined) as string | undefined,
    };
  }

  async decodeRgbInvoice(invoice: string): Promise<unknown> {
    return parseJson<unknown>(this.nodeHandle.decodeRgbInvoiceJson(invoice));
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async signMessage(message: string): Promise<string> {
    const raw = parseJson<{ signature?: string }>(this.nodeHandle.signMessageJson(message));
    return String(raw.signature ?? '');
  }

  // ── Async payments (APay) ────────────────────────────────────────────────────

  async apayNew(hostNodeId: string): Promise<ApayNewResponse> {
    return normalizeApayResponse(await this.nodeHandle.apayNewValue(hostNodeId));
  }

  async apayNewWithAddress(
    hostNodeId: string,
    username: string,
    domain: string
  ): Promise<ApayNewResponse> {
    // TEMP debug logging — remove after APay wasm verification.
    console.debug('[rgb-sdk-web][apay:tmp] apayNewWithAddress →', {
      hostNodeId,
      username,
      domain,
    });
    const raw = await this.nodeHandle.apayNewWithAddressValue(
      hostNodeId,
      username,
      domain
    );
    console.debug('[rgb-sdk-web][apay:tmp] apayNewWithAddress ← raw', raw);
    return normalizeApayResponse(raw);
  }
}
