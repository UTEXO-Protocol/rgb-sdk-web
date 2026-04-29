/**
 * RlnNodeBinding — IRlnNodeBinding implementation using RlnWasmSdkNodeHandle.
 *
 * All methods delegate to nodeHandle.*Json() / *Value() and normalize output
 * to the canonical rln-model.ts types.
 */

import type { RlnWasmSdkNodeHandle } from 'rln-wasm-sdk';
import type { IRlnNodeBinding } from '@utexo/rgb-sdk-core';
import type { AssetNIA, AssetCFA } from '@utexo/rgb-sdk-core';
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
} from '@utexo/rgb-sdk-core';
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
    localBalanceMsat: Number(raw.local_balance_msat ?? raw.localBalanceMsat ?? 0),
    remoteBalanceMsat: Number(raw.remote_balance_msat ?? raw.remoteBalanceMsat ?? 0),
    isPublic: Boolean(raw.is_public ?? raw.isPublic ?? raw.public),
    isActive: Boolean(raw.is_active ?? raw.isActive ?? raw.ready),
    assetId: (raw.asset_id ?? raw.assetId ?? undefined) as string | undefined,
    assetLocalAmount: raw.asset_local_amount != null
      ? Number(raw.asset_local_amount ?? raw.assetLocalAmount)
      : undefined,
  };
}

function normalizePayment(raw: RlnRawPayment): LightningPayment {
  return {
    paymentHash: String(raw.payment_hash ?? raw.paymentHash ?? ''),
    amtMsat: raw.amt_msat != null ? BigInt(raw.amt_msat as number) : undefined,
    status: (raw.status ?? 'Pending') as LightningPaymentStatus,
    assetId: (raw.asset_id ?? raw.assetId ?? undefined) as string | undefined,
    assetAmount: raw.asset_amount != null ? BigInt(raw.asset_amount as number) : undefined,
    invoice: (raw.invoice ?? undefined) as string | undefined,
    inbound: Boolean(raw.inbound),
  };
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

// ─── Main class ───────────────────────────────────────────────────────────────

export class RlnNodeBinding implements IRlnNodeBinding {
  private readonly nodeHandle: RlnWasmSdkNodeHandle;

  constructor(nodeHandle: RlnWasmSdkNodeHandle) {
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

  async listChannels(): Promise<LightningChannel[]> {
    const raw = parseJson<RlnRawChannel[]>(this.nodeHandle.listChannelsJson());
    return raw.map(normalizeChannel);
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  async createLnInvoice(params: CreateLnInvoiceParams): Promise<LightningInvoice> {
    const raw = parseJson<RlnRawInvoice>(
      this.nodeHandle.createLnInvoiceJson(
        params.amtMsat ?? null,
        params.expirySec,
        params.assetId ?? null,
        params.assetAmount ?? null
      )
    );
    return normalizeInvoice(raw);
  }

  async sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
    const raw = parseJson<RlnRawPayment>(
      this.nodeHandle.sendPaymentJson(
        params.invoice,
        params.amtMsat ?? null,
        params.assetId ?? null,
        params.assetAmount ?? null
      )
    );
    return normalizePayment(raw);
  }

  async keysend(params: KeysendParams): Promise<SendPaymentResult> {
    const raw = parseJson<RlnRawPayment>(
      this.nodeHandle.keysendJson(
        params.destPubkey,
        params.amtMsat,
        params.assetId ?? null,
        params.assetAmount ?? null
      )
    );
    return normalizePayment(raw);
  }

  async listPayments(): Promise<LightningPayment[]> {
    const raw = parseJson<RlnRawPayment[]>(this.nodeHandle.listPaymentsJson());
    return raw.map(normalizePayment);
  }

  async getPayment(paymentHash: string): Promise<LightningPayment | null> {
    try {
      const raw = parseJson<RlnRawPayment>(this.nodeHandle.getPaymentJson(paymentHash));
      return normalizePayment(raw);
    } catch {
      return null;
    }
  }

  async invoiceStatus(invoice: string): Promise<InvoiceStatus> {
    const raw = parseJson<{ status?: string }>(this.nodeHandle.invoiceStatusJson(invoice));
    return (raw.status ?? 'Pending') as InvoiceStatus;
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
    return normalizeNodeInfo(raw);
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
}
