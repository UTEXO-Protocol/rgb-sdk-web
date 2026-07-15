/**
 * RlnNodeBinding — IRlnNodeBinding implementation using RlnWasmNode.
 *
 * All methods delegate to nodeHandle.*Json() / *Value() and normalize output
 * to the canonical rln-model.ts types.
 */

import type { RlnWasmNode } from '@utexo/rln-wasm';
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
  LdkVssBackupInfo,
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

// rgb-lib serializes assets snake_case: the wasm build does not enable its
// `camel_case` feature (CI: `wasm-pack build --target web`, no --features).
function normalizeAssetNia(raw: RlnRawAssetNia): AssetNIA {
  return {
    assetId: String(raw.asset_id ?? ''),
    ticker: String(raw.ticker ?? ''),
    name: String(raw.name ?? ''),
    details: (raw.details ?? null) as string | null,
    precision: Number(raw.precision ?? 0),
    issuedSupply: Number(raw.issued_supply ?? 0),
    timestamp: Number(raw.timestamp ?? 0),
    addedAt: Number(raw.added_at ?? 0),
    balance: {
      settled: Number(raw.balance?.settled ?? 0),
      future: Number(raw.balance?.future ?? 0),
      spendable: Number(raw.balance?.spendable ?? 0),
    },
  };
}

function normalizeAssetCfa(raw: RlnRawAssetCfa): AssetCFA {
  return {
    assetId: String(raw.asset_id ?? ''),
    name: String(raw.name ?? ''),
    details: (raw.details ?? undefined) as string | undefined,
    precision: Number(raw.precision ?? 0),
    issuedSupply: Number(raw.issued_supply ?? 0),
    timestamp: Number(raw.timestamp ?? 0),
    addedAt: Number(raw.added_at ?? 0),
    balance: {
      settled: Number(raw.balance?.settled ?? 0),
      future: Number(raw.balance?.future ?? 0),
      spendable: Number(raw.balance?.spendable ?? 0),
    },
  };
}

function normalizeChannel(raw: RlnRawChannel): LightningChannel {
  // RlnWasmNodeChannelData exposes only outbound_msat (this node's spendable
  // outbound); there is no inbound/remote balance field, so those read 0.
  const outboundMsat = Number(raw.outbound_msat ?? 0);
  return {
    channelId: String(raw.channel_id ?? ''),
    peerPubkey: String(raw.peer_pubkey ?? ''),
    capacitySat: Number(raw.capacity_sat ?? 0),
    localBalanceMsat: outboundMsat,
    remoteBalanceMsat: 0,
    isPublic: Boolean(raw.public),
    isActive: Boolean(raw.ready),
    isUsable: Boolean(raw.is_usable),
    outboundBalanceMsat: outboundMsat,
    inboundBalanceMsat: 0,
    assetId: raw.asset_id ?? undefined,
    assetLocalAmount:
      raw.asset_local_amount != null
        ? Number(raw.asset_local_amount)
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
    paymentHash: String(raw.payment_hash ?? ''),
    amtMsat: raw.amt_msat != null ? BigInt(raw.amt_msat as number) : undefined,
    status: foldPaymentStatus(raw.status),
    rawStatus: raw.status != null ? String(raw.status) : undefined,
    assetId: (raw.asset_id ?? undefined) as string | undefined,
    assetAmount:
      raw.asset_amount != null ? BigInt(raw.asset_amount as number) : undefined,
    // `invoice` is not part of RlnWasmNodePaymentData; it is only set by the
    // synthetic record sendPayment() builds from its own request.
    invoice: (raw.invoice ?? undefined) as string | undefined,
    inbound: Boolean(raw.inbound),
    preimage: (raw.preimage ?? raw.payment_preimage ?? undefined) as
      | string
      | undefined,
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
function foldInvoiceStatus(
  raw: unknown,
  expiresAt?: number | null
): InvoiceStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'succeeded' || s === 'settled' || s === 'paid') return 'Paid';
  if (s === 'expired' || s === 'failed') return 'Expired';
  if (expiresAt && Date.now() / 1000 > expiresAt) return 'Expired';
  return 'Pending';
}

function normalizeInvoice(raw: RlnRawInvoice): LightningInvoice {
  return {
    invoice: String(raw.invoice ?? ''),
    paymentHash: String(raw.payment_hash ?? ''),
    expirySeconds: Number(raw.expiry_sec ?? 0),
    amtMsat: raw.amt_msat != null ? BigInt(raw.amt_msat as number) : undefined,
    assetId: (raw.asset_id ?? undefined) as string | undefined,
    assetAmount:
      raw.asset_amount != null ? BigInt(raw.asset_amount as number) : undefined,
  };
}

function normalizePeer(raw: RlnRawPeer): LightningPeer {
  return {
    pubkey: String(raw.pubkey ?? ''),
    address: (raw.peer_addr ?? undefined) as string | undefined,
    isConnected: Boolean(raw.started),
  };
}

function normalizeNodeInfo(raw: RlnRawNodeInfo): LightningNodeInfo {
  // RlnWasmNodeInfoData carries counters only (no pubkey — filled separately via
  // nodePubkey() — and no balance field).
  return {
    pubkey: String(raw.pubkey ?? ''),
    numChannels: Number(raw.num_channels ?? 0),
    numUsableChannels: Number(raw.num_usable_channels ?? 0),
  };
}

function normalizeNetworkInfo(raw: RlnRawNetworkInfo): LightningNetworkInfo {
  return {
    network: String(raw.network ?? ''),
    blockHeight: Number(raw.height ?? 0),
  };
}

/** Normalize apayNewValue's `AsyncOrderNewResponse` (snake_case serde) to ApayNewResponse. */
function normalizeApayResponse(raw: unknown): ApayNewResponse {
  const r = (raw ?? {}) as Record<string, unknown>;
  const hashes = (r.hashes ?? []) as Array<Record<string, unknown>>;
  return {
    requestId: String(r.request_id ?? ''),
    hostNodeId: String(r.host_node_id ?? ''),
    protocolVersion: Number(r.protocol_version ?? 0),
    orderId: String(r.order_id ?? ''),
    status: String(r.status ?? ''),
    acceptedThroughIndex: Number(r.accepted_through_index ?? 0),
    nextIndexExpected: Number(r.next_index_expected ?? 0),
    unusedHashes: Number(r.unused_hashes ?? 0),
    refillBatchSize: Number(r.refill_batch_size ?? 0),
    firstHashIndex: Number(r.first_hash_index ?? 0),
    lastHashIndex: Number(r.last_hash_index ?? 0),
    hashes: hashes.map(
      (h): ApayHashEntry => ({
        hashIndex: Number(h.hash_index ?? 0),
        paymentHash: String(h.payment_hash ?? ''),
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
    const raw = parseJson<{ channel_id?: string }>(
      this.nodeHandle.openChannelJson(
        params.peerPubkey,
        params.capacitySat,
        params.isPublic,
        params.assetId ?? null,
        params.assetLocalAmount ?? null
      )
    );
    return String(raw.channel_id ?? '');
  }

  closeChannel(channelId: string, peerPubkey?: string, force?: boolean): void {
    if (peerPubkey != null || force != null) {
      this.nodeHandle.closeChannelWithOptions(
        channelId,
        peerPubkey ?? null,
        force ?? false
      );
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

  async createLnInvoice(
    params: CreateLnInvoiceParams
  ): Promise<LightningInvoice> {
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
      amtMsat:
        decoded?.amtMsat ??
        (params.amtMsat != null ? BigInt(params.amtMsat) : undefined),
      assetId: params.assetId ?? undefined,
      assetAmount:
        params.assetAmount != null ? BigInt(params.assetAmount) : undefined,
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
   * The wasm node keeps two payment ledgers that don't see each other:
   * scaffold maps (read by getPaymentJson /
   * invoiceStatusJson / listPaymentsJson) and the live event-stream ledger fed by
   * real LDK events (read by livePaymentValue / livePaymentsValue). Live-API
   * invoices (createLnInvoiceLiveJson) and real HTLC sends exist only in the
   * latter — the intended consumption pattern per the wasm-interop reference
   * flows — so the read paths below consult the live ledger too.
   */
  private livePayment(paymentHash: string): LiveRawPayment | null {
    try {
      const v = this.nodeHandle.livePaymentValue(
        paymentHash
      ) as LiveRawPayment | null;
      return v && typeof v === 'object' ? v : null;
    } catch {
      return null;
    }
  }

  private mergedRawPayments(): RlnRawPayment[] {
    const scaffold = parseJson<RlnRawPayment[]>(
      this.nodeHandle.listPaymentsJson()
    );
    const byHash = new Map(
      scaffold.map((p) => [String(p.payment_hash ?? ''), p])
    );
    try {
      const live =
        (this.nodeHandle.livePaymentsValue() as RlnRawPayment[] | null) ?? [];
      for (const p of live) {
        const hash = String(p.payment_hash ?? '');
        if (!hash) continue;
        const existing = byHash.get(hash);
        if (!existing) scaffold.push(p);
        // scaffold records win the dedupe but don't carry the preimage
        else if (existing.preimage == null && p.preimage != null)
          existing.preimage = p.preimage;
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

  async getPayment(paymentHash: string): Promise<LightningPayment | null> {
    await this.driveRgbWorkBestEffort();
    try {
      const raw = parseJson<RlnRawPayment>(
        this.nodeHandle.getPaymentJson(paymentHash)
      );
      if (raw.preimage == null && raw.payment_preimage == null) {
        // scaffold record — the preimage lives only in the live ledger
        raw.preimage = this.livePayment(paymentHash)?.preimage;
      }
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
    const raw = parseJson<{ status?: string }>(
      this.nodeHandle.invoiceStatusJson(invoice)
    );
    return foldInvoiceStatus(raw.status);
  }

  async failPendingPayments(): Promise<void> {
    this.nodeHandle.failPendingPayments();
  }

  async updatePaymentStatus(params: PaymentStatusUpdate): Promise<void> {
    if (params.invoice) {
      this.nodeHandle.updatePaymentStatusByInvoice(
        params.invoice,
        params.status
      );
    } else if (params.paymentHash) {
      this.nodeHandle.updatePaymentStatus(params.paymentHash, params.status);
    }
  }

  // ── HODL invoices ──────────────────────────────────────────────────────────

  async createHodlLnInvoice(
    params: CreateHodlLnInvoiceParams
  ): Promise<LightningInvoice> {
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

  async claimHodlInvoice(
    paymentHash: string,
    preimage: string
  ): Promise<HodlInvoiceResult> {
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
        const candidate =
          (parsed as Record<string, unknown>).pubkey ??
          (parsed as Record<string, unknown>).node_pubkey;
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
    // LdkRuntimeStatusData exposes `ready` (no is_running field).
    const raw = parseJson<{ ready?: boolean }>(
      this.nodeHandle.ldkRuntimeStatusJson()
    );
    return { isRunning: Boolean(raw.ready) };
  }

  async listRuntimeEvents(): Promise<ListRuntimeEventsResult> {
    const raw = parseJson<unknown[]>(this.nodeHandle.listRuntimeEventsJson());
    return { events: raw };
  }

  // ── VSS (LDK/channel-state replication) ────────────────────────────────────

  configureLdkVssReplication(
    serverUrl: string,
    storeId: string,
    signingKeyHex: string
  ): Promise<number> {
    return this.nodeHandle.configureLdkVssReplication(
      serverUrl,
      storeId,
      signingKeyHex
    );
  }

  disableLdkVssReplication(): void {
    this.nodeHandle.disableLdkVssReplication();
  }

  ldkVssBackupInfo(): LdkVssBackupInfo {
    return parseJson<LdkVssBackupInfo>(this.nodeHandle.ldkVssBackupInfoJson());
  }

  clearLdkVssFence(
    serverUrl: string,
    storeId: string,
    signingKeyHex: string
  ): Promise<void> {
    return this.nodeHandle.clearLdkVssFence(serverUrl, storeId, signingKeyHex);
  }

  // ── Decoding ───────────────────────────────────────────────────────────────

  async decodeLnInvoice(invoice: string): Promise<DecodedLnInvoice> {
    // RlnWasmNodeDecodeLnInvoiceData: payment_hash, amt_msat, expiry_sec,
    // payee_pubkey (no description field).
    const raw = parseJson<{
      payment_hash?: string;
      amt_msat?: number | bigint | null;
      expiry_sec?: number;
      payee_pubkey?: string | null;
    }>(this.nodeHandle.decodeLnInvoiceJson(invoice));
    return {
      paymentHash: String(raw.payment_hash ?? ''),
      amtMsat:
        raw.amt_msat != null ? BigInt(raw.amt_msat as number) : undefined,
      description: undefined,
      expirySeconds: Number(raw.expiry_sec ?? 0),
      payee: (raw.payee_pubkey ?? undefined) as string | undefined,
    };
  }

  async decodeRgbInvoice(invoice: string): Promise<unknown> {
    return parseJson<unknown>(this.nodeHandle.decodeRgbInvoiceJson(invoice));
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async signMessage(message: string): Promise<string> {
    const raw = parseJson<{ signature?: string }>(
      this.nodeHandle.signMessageJson(message)
    );
    return String(raw.signature ?? '');
  }

  // ── Async payments (APay) ────────────────────────────────────────────────────

  async apayNew(hostNodeId: string): Promise<ApayNewResponse> {
    return normalizeApayResponse(
      await this.nodeHandle.apayNewValue(hostNodeId)
    );
  }

  async apayNewWithAddress(
    hostNodeId: string,
    username: string,
    domain: string
  ): Promise<ApayNewResponse> {
    const raw = await this.nodeHandle.apayNewWithAddressValue(
      hostNodeId,
      username,
      domain
    );
    return normalizeApayResponse(raw);
  }
}
