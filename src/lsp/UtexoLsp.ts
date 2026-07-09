import type { UTEXOWallet } from '../utexo/utexo-wallet';
import { UtexoLSPClient } from './UtexoLSPClient';
import type { IUtexoLSPClient } from './IUtexoLSPClient';
import type { LightningSendRequest } from '@utexo/rgb-sdk-core';
import type { LightningChannel, ApayNewResponse } from '../rln';
import {
  type LspPeer,
  type ChannelReadyInfo,
  type LspOnchainSendResponse,
  type LspLnParams,
  type ReceiveSettlementOutcome,
  normalizeReceiveStatus,
} from './lsp-types';
import {
  LspChannelTimeoutError,
  LspLiquidityTimeoutError,
  LspSettlementError,
} from './LspErrors';

// ── Shared wait options ───────────────────────────────────────────────────────

export interface WaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
  /** Called at the start of each poll iteration (e.g. mine a regtest block). */
  onEachPoll?: () => Promise<void>;
}

// ── receiveAsset ──────────────────────────────────────────────────────────────

export interface ReceiveAssetOptions {
  assetId: string;
  amountSats: number;
  amountRgb: number;
  /** Applied to both LN + RGB invoices (kept in sync). Default 3600. */
  expirySeconds?: number;
}

export interface ReceiveAssetResult {
  lnInvoice: string;
  rgbInvoice: string;
  mappingId: string;
}

// ── sendAsset ─────────────────────────────────────────────────────────────────

export interface SendAssetOptions {
  /** Recipient's on-chain RGB invoice */
  rgbInvoice: string;
  ln?: LspLnParams;
}

export interface SendAssetResult extends LspOnchainSendResponse {
  sendResult: LightningSendRequest;
}

// ── payAddress ────────────────────────────────────────────────────────────────

export interface PayAddressOptions {
  /** Lightning Address, e.g. alice@lsp.utexo.com */
  address: string;
  amtMsat: number;
  asset?: { assetId: string; assetAmount: number };
}

// ── enableLightningAddress ────────────────────────────────────────────────────

export interface LightningAddressInfo {
  username: string;
  domain: string;
  /** Convenience: username@domain */
  address: string;
  unusedHashes?: number;
  nextIndexExpected?: number;
  refillBatchSize?: number;
}

// ── claimPendingPayments ──────────────────────────────────────────────────────

export interface ClaimResult {
  paymentHash: string;
  claimed: boolean;
  error?: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CHANNEL_TIMEOUT_MS = 120_000;
const DEFAULT_SETTLEMENT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

// ── UtexoLsp ──────────────────────────────────────────────────────────────────

export class UtexoLsp {
  /** Direct access to the HTTP client for one-off LSP calls. */
  readonly http: IUtexoLSPClient;

  constructor(
    private readonly wallet: UTEXOWallet,
    readonly peer: LspPeer
  ) {
    this.http = new UtexoLSPClient({
      baseUrl: peer.baseUrl,
      bearerToken: peer.bearerToken,
      timeoutMs: peer.timeoutMs,
    });
  }

  // ── 1. Connection ─────────────────────────────────────────────────────────────

  /** Connect to the LSP peer over Lightning P2P. Idempotent. */
  async connect(): Promise<void> {
    try {
      await this.wallet.connectPeer(
        `${this.peer.peerHost}:${this.peer.peerPort}`,
        this.peer.peerPubkey
      );
    } catch (err) {
      if (
        !String((err as Error)?.message ?? '')
          .toLowerCase()
          .includes('already')
      )
        throw err;
    }
  }

  // ── 2. Channel readiness ──────────────────────────────────────────────────────

  /** Poll listChannels until a usable RGB channel for `assetId` exists. */
  async waitForChannel(
    assetId: string,
    opts: WaitOptions = {}
  ): Promise<ChannelReadyInfo> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_CHANNEL_TIMEOUT_MS;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      this.checkAbort(opts.signal);
      if (opts.onEachPoll) await opts.onEachPoll();

      await this.wallet.syncWallet();
      const channels = await this.wallet.listChannels();
      const match = channels.find((c) => this.isUsableRgbChannel(c, assetId));

      opts.onProgress?.(
        `channels: ${channels.length} — RGB usable: ${match ? 'yes' : 'no'}`
      );

      if (match) return this.toChannelReadyInfo(match);

      await this.sleep(pollIntervalMs, opts.signal);
    }

    throw new LspChannelTimeoutError(assetId, timeoutMs);
  }

  // ── 3. Receive RGB over Lightning (POST /lightning_receive) ───────────────────

  /**
   * Lightning → RGB bridge: create a LN invoice, register with the LSP (→ RGB
   * invoice), return both. Share rgbInvoice with the on-chain sender; the LSP
   * pays lnInvoice once the RGB transfer settles.
   */
  async receiveAsset(opts: ReceiveAssetOptions): Promise<ReceiveAssetResult> {
    const expirySeconds = opts.expirySeconds ?? 3600;

    const createdAtMs = Date.now();
    const { lnInvoice } = await this.wallet.createLightningInvoice({
      amountSats: opts.amountSats,
      expirySeconds,
      asset: { assetId: opts.assetId, amount: opts.amountRgb },
    });

    // LSP validates durationSeconds against the LN invoice's *remaining* lifetime
    // (EXPIRY_MATCH_TOLERANCE_SEC). Send the remaining lifetime, not the full expiry.
    const elapsedSeconds = Math.round((Date.now() - createdAtMs) / 1000);
    const durationSeconds = Math.max(1, expirySeconds - elapsedSeconds);

    const lr = await this.http.lightningReceive({
      lnInvoice,
      rgb: { assetId: opts.assetId, durationSeconds },
    });

    return { lnInvoice, rgbInvoice: lr.rgbInvoice, mappingId: lr.mappingId };
  }

  // ── 4. Settlement polling ─────────────────────────────────────────────────────

  /**
   * Poll wallet.getLightningReceiveRequest until terminal.
   * @returns 'settled' on Succeeded; 'timed_out' on timeout.
   * @throws LspSettlementError on Failed/Expired.
   */
  async awaitReceiveSettlement(
    lnInvoice: string,
    opts: WaitOptions = {}
  ): Promise<ReceiveSettlementOutcome> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_SETTLEMENT_TIMEOUT_MS;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      this.checkAbort(opts.signal);

      await this.wallet.syncWallet();
      const raw = await this.wallet.getLightningReceiveRequest(lnInvoice);
      const status = normalizeReceiveStatus(raw as string | null | undefined);

      opts.onProgress?.(status);

      if (status === 'Succeeded') return 'settled';
      if (status === 'Failed' || status === 'Expired') {
        throw new LspSettlementError('ln_invoice', status);
      }

      await this.sleep(pollIntervalMs, opts.signal);
    }

    opts.onProgress?.('timeout');
    return 'timed_out';
  }

  // ── 5. Outbound liquidity wait ────────────────────────────────────────────────

  /** @throws LspLiquidityTimeoutError when `timeoutMs` elapses first. */
  async waitForOutboundLiquidity(
    minMsat: number,
    opts: WaitOptions = {}
  ): Promise<void> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_CHANNEL_TIMEOUT_MS;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const started = Date.now();
    const deadline = started + timeoutMs;
    let lastOutbound = 0;

    while (Date.now() < deadline) {
      this.checkAbort(opts.signal);

      await this.wallet.syncWallet();
      const channels = await this.wallet.listChannels();
      const lspChan = channels.find(
        (c) =>
          c.peerPubkey === this.peer.peerPubkey && (c.isUsable ?? c.isActive)
      );
      const outbound = Number(
        lspChan?.outboundBalanceMsat ?? lspChan?.localBalanceMsat ?? 0
      );
      lastOutbound = outbound;

      opts.onProgress?.(`outbound: ${outbound} msat (need ${minMsat})`);

      if (outbound >= minMsat) return;

      await this.sleep(pollIntervalMs, opts.signal);
    }

    throw new LspLiquidityTimeoutError(
      minMsat,
      lastOutbound,
      Date.now() - started
    );
  }

  // ── 6. Send RGB via LSP (POST /onchain_send) ──────────────────────────────────

  /**
   * RGB → Lightning bridge: submit recipient's RGB invoice → LSP returns a LN
   * invoice → pay it. LSP executes sendrgb to the recipient once LN settles.
   */
  async sendAsset(opts: SendAssetOptions): Promise<SendAssetResult> {
    const issued = await this.http.onchainSend({
      rgbInvoice: opts.rgbInvoice,
      ln: opts.ln,
    });
    const sendResult = await this.wallet.payLightningInvoice({
      lnInvoice: issued.lnInvoice,
    });
    return { ...issued, sendResult };
  }

  // ── 7. Pay a Lightning Address ────────────────────────────────────────────────

  async payAddress(
    opts: PayAddressOptions
  ): Promise<{ invoice: string; sendResult: LightningSendRequest }> {
    const [username, domain] = opts.address.split('@');
    if (!username || !domain)
      throw new Error(`Invalid Lightning Address: "${opts.address}"`);

    let invoice: string | undefined;

    // LNURL resolution is an idempotent GET; a freshly (re)started LSP can 404
    // for a beat while its cron provisions the address account. Retry before
    // falling back.
    let resolveErr: unknown;
    for (let attempt = 1; attempt <= 3 && !invoice; attempt++) {
      try {
        const cb = await this.http.resolveAddress(
          username,
          opts.amtMsat,
          opts.asset?.assetId,
          opts.asset?.assetAmount
        );
        invoice = cb.pr;
      } catch (err) {
        resolveErr = err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!invoice) {
      if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(domain)) {
        throw resolveErr instanceof Error
          ? resolveErr
          : new Error(String(resolveErr));
      }
      const meta = (await fetch(
        `https://${domain}/.well-known/lnurlp/${encodeURIComponent(username)}`
      ).then((r) => r.json())) as { callback: string };
      if (!meta?.callback)
        throw new Error('Missing callback in LNURL response');

      let url = `${meta.callback}${meta.callback.includes('?') ? '&' : '?'}amount=${opts.amtMsat}`;
      if (opts.asset?.assetId)
        url += `&asset_id=${encodeURIComponent(opts.asset.assetId)}`;
      if (opts.asset?.assetAmount !== undefined)
        url += `&asset_amount=${opts.asset.assetAmount}`;

      const cb = (await fetch(url).then((r) => r.json())) as { pr: string };
      invoice = cb.pr;
    }

    if (!invoice) throw new Error('No invoice returned for Lightning Address');
    const sendResult = await this.wallet.payLightningInvoice({
      lnInvoice: invoice,
    });
    return { invoice, sendResult };
  }

  // ── 8. Async / offline receive (APay) ─────────────────────────────────────────

  /**
   * Register the async-payment hash pool with this LSP and return the
   * auto-generated Lightning Address for this wallet's pubkey. Call once after
   * first unlock to enable offline receive.
   */
  async enableLightningAddress(): Promise<LightningAddressInfo> {
    const nodeInfo = await this.wallet.getNodeInfo();
    const pubkey = String(nodeInfo?.pubkey ?? '');
    if (!pubkey) throw new Error('enableLightningAddress: wallet not unlocked');

    const lspInfo = await this.http.getInfo();
    const addr = await this.resolveLightningAddress(pubkey);
    const pool = await this.wallet.apayNewWithAddress(
      lspInfo.pubkey,
      addr.username,
      addr.domain
    );

    return {
      username: addr.username,
      domain: addr.domain,
      address: `${addr.username}@${addr.domain}`,
      unusedHashes: pool.unusedHashes,
      nextIndexExpected: pool.nextIndexExpected,
      refillBatchSize: pool.refillBatchSize,
    };
  }

  /** Resolve this wallet's LSP-assigned address, retrying while the LSP cron provisions it. */
  private async resolveLightningAddress(
    pubkey: string,
    attempts = 8,
    delayMs = 2000
  ): Promise<{ username: string; domain: string }> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const addr = await this.http.getLightningAddressByPubkey(pubkey);
        if (addr?.username && addr?.domain) return addr;
      } catch (e) {
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error(
      `enableLightningAddress: LSP did not provision an address for ${pubkey} ` +
        `(ensure the wallet is connected to the LSP). Last error: ${String(lastErr)}`
    );
  }

  /** Top up the async-payment hash pool with a fresh signed batch. */
  async refillHashPool(): Promise<ApayNewResponse> {
    const nodeInfo = await this.wallet.getNodeInfo();
    const pubkey = String(nodeInfo?.pubkey ?? '');
    if (!pubkey) throw new Error('refillHashPool: wallet not unlocked');

    const lspInfo = await this.http.getInfo();
    const addr = await this.http.getLightningAddressByPubkey(pubkey);

    return this.wallet.apayNewWithAddress(
      lspInfo.pubkey,
      addr.username,
      addr.domain
    );
  }

  // ── 9. Claim pending HODL payments ────────────────────────────────────────────

  /** Find all CLAIMABLE/CLAIMING inbound payments and claim each via claimHodlInvoice. */
  async claimPendingPayments(): Promise<ClaimResult[]> {
    const payments = await this.wallet.listPaymentsRaw();
    const claimable = (payments as Array<Record<string, unknown>>).filter(
      (p) => {
        const s = String(p.status ?? '').toUpperCase();
        return s === 'CLAIMABLE' || s === 'CLAIMING';
      }
    );

    const results: ClaimResult[] = [];
    for (const p of claimable) {
      const hash = String(p.paymentHash ?? p.payment_hash ?? '');
      const preimage = String(p.paymentPreimage ?? p.payment_preimage ?? '');
      try {
        await this.wallet.claimHodlInvoice(hash, preimage);
        results.push({ paymentHash: hash, claimed: true });
      } catch (err) {
        results.push({
          paymentHash: hash,
          claimed: false,
          error: (err as Error)?.message,
        });
      }
    }
    return results;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private isUsableRgbChannel(c: LightningChannel, assetId: string): boolean {
    return c.assetId === assetId && Boolean(c.isUsable ?? c.isActive);
  }

  private toChannelReadyInfo(c: LightningChannel): ChannelReadyInfo {
    return {
      channelId: c.channelId,
      peerPubkey: this.peer.peerPubkey,
      capacitySat: c.capacitySat,
      outboundBalanceMsat: Number(
        c.outboundBalanceMsat ?? c.localBalanceMsat ?? 0
      ),
      inboundBalanceMsat: Number(
        c.inboundBalanceMsat ?? c.remoteBalanceMsat ?? 0
      ),
    };
  }

  private checkAbort(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('UtexoLsp: operation aborted');
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new Error('UtexoLsp: aborted'));
        },
        { once: true }
      );
    });
  }
}
