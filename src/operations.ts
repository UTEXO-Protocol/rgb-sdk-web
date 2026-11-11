/**
 * The public operations (ADR-0002 step 4), each in two parts:
 *
 * - `prepare`: pure. Validates the owned params, applies the input rules and
 *   builds the WASM arguments in the wire form beta.4 takes (BigInt for u64
 *   amounts and fee rates; decimal strings for `WitnessData`). It runs before
 *   admission: no network, no WASM call, no queue.
 * - `execute`: one queued task. Calls the WASM wallet through the session,
 *   applies the rules that need runtime values (the invoice in `send`),
 *   decodes the result with the codec and projects it to the core type.
 *
 * Neither part enqueues work or connects: the backend does that, before the
 * task enters the queue. A synchronous WASM mutation is reported only after
 * `session.persisted()` has flushed it.
 *
 * Also here: the input rules shared by the operations (`skipSync`, receive
 * assignments, asset schema filter, amounts, wire helpers).
 *
 * Called by: `backend.ts`. Depends on: `runtime/session.ts` (the wallet),
 * `runtime/codec.ts` (results), `config.ts` (`integer()`), `errors.ts`.
 */
import { ValidationError } from '@utexo/rgb-sdk-core';
import type {
  FailTransfersRequest,
  InflateAssetIfaRequestModel,
  IssueAssetIfaRequestModel,
  IssueAssetNiaRequestModel,
  ListAssetsOptions,
  OnchainSendRequestModel,
  ReceiveAssignmentKind,
  ReceiveParams,
  SendBtcBeginRequestModel,
} from '@utexo/rgb-sdk-core';
import * as codec from './runtime/codec.js';
import { integer } from './config.js';
import { RgbLibWebError } from './errors.js';
import type { WasmSession } from './runtime/session.js';

/** What `execute` needs from the backend's connection. */
export interface OnlineContext {
  proxyEndpoint: string;
}

/**
 * Types `execute`'s prepared value from `prepare`'s result, so neither has to
 * name the other.
 */
function operation<A extends unknown[], V, X extends unknown[], R>(op: {
  prepare: (...args: A) => V;
  execute: (s: WasmSession, v: V, ...rest: X) => R;
}) {
  return op;
}

function fail(message: string): never {
  throw new RgbLibWebError('INVALID_PARAMS', message);
}

// ── input amounts ───────────────────────────────────────────────────────────
// Ported from `@utexo/rgb-lib-rn` (`rgb-lib/amounts.ts`). They return checked
// decimal strings; the wire helpers below turn them into BigInt (or keep the
// string for WitnessData). No u64 is ever rounded. Output numbers are decoded
// in `runtime/codec.ts`.

const U64_MAX = 0xffffffffffffffffn;

function u64(
  value: number | bigint | string,
  field: string,
  positive = false
): string {
  if (
    (typeof value === 'number' &&
      (!Number.isSafeInteger(value) || value < 0)) ||
    (typeof value !== 'number' &&
      typeof value !== 'bigint' &&
      typeof value !== 'string') ||
    !/^(0|[1-9]\d{0,19})$/.test(String(value))
  ) {
    throw new RgbLibWebError(
      'INVALID_AMOUNT',
      `${field} must be an exact unsigned integer`
    );
  }
  const n = BigInt(value);
  if (n > U64_MAX || (positive && n === 0n)) {
    throw new RgbLibWebError(
      'INVALID_AMOUNT',
      `${field} is outside the supported u64 range`
    );
  }
  return n.toString();
}

/**
 * Converts issuance allocations and checks, before any WASM call, that the
 * supply (and max supply including inflation) fits the numeric public asset
 * model. Balances never exceed the max supply, so this bounds them too.
 */
function issuanceAmounts(
  amounts: readonly (number | bigint | string)[],
  inflationAmounts: readonly (number | bigint | string)[] = []
): { amounts: string[]; inflationAmounts: string[] } {
  const exact = amounts.map((n) => u64(n, 'amount', true));
  const inflation = inflationAmounts.map((n) =>
    u64(n, 'inflationAmount', true)
  );
  const total = [...exact, ...inflation].reduce(
    (sum, n) => sum + BigInt(n),
    0n
  );
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RgbLibWebError(
      'AMOUNT_OVERFLOW',
      'Total issued and inflatable supply cannot be represented by the numeric SDK fields'
    );
  }
  return { amounts: exact, inflationAmounts: inflation };
}

/** A positive integer sat/vB, as a decimal string. */
function feeRate(value: number = 2): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RgbLibWebError(
      'FEE_RATE_UNSUPPORTED',
      'RGB Lib requires a positive integer feeRate in sat/vB'
    );
  }
  return String(value);
}

// ── shared input rules ──────────────────────────────────────────────────────

/** Omitted or null is `false`; anything but a boolean is INVALID_PARAMS. */
export function skipSyncOf(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean')
    throw new ValidationError('skipSync must be a boolean', 'skipSync');
  return value;
}

/** Reads that sync first need a connection; `skipSync: true` reads work offline. */
export const syncs = (options: { skipSync?: boolean } | null | undefined) =>
  !skipSyncOf(options?.skipSync);

const RECEIVE_KINDS: Record<ReceiveAssignmentKind, 'amount' | 'none'> = {
  Fungible: 'amount',
  InflationRight: 'amount',
  NonFungible: 'none',
  MintRight: 'none',
  Any: 'none',
};

/** The invoice assignment for a receive; the same rules as React Native. */
function resolveReceiveAssignment(
  kind: ReceiveAssignmentKind | undefined,
  amount: number | undefined
): ReceiveAssignmentKind {
  const resolved = kind ?? (amount === undefined ? 'Any' : 'Fungible');
  // Own keys only: "constructor" or "toString" are not kinds.
  const rule = Object.hasOwn(RECEIVE_KINDS, resolved)
    ? RECEIVE_KINDS[resolved]
    : undefined;
  if (rule === undefined)
    throw new ValidationError(
      `Unknown assignmentKind: ${String(kind)}`,
      'assignmentKind'
    );
  if (rule === 'amount' && amount === undefined)
    throw new ValidationError(`${resolved} receive requires amount`, 'amount');
  if (rule === 'none' && amount !== undefined)
    throw new ValidationError(`${resolved} receive takes no amount`, 'amount');
  return resolved;
}

/** rgb-lib-wasm has NIA, IFA and BFA; CFA and UDA filters are unsupported input. */
const WASM_SCHEMAS = ['Nia', 'Ifa', 'Bfa'];
function validateAssetSchemas(schemas: unknown): string[] {
  if (schemas === undefined) return [];
  if (!Array.isArray(schemas))
    throw new ValidationError(
      'filterAssetSchemas must be an array',
      'filterAssetSchemas'
    );
  for (const schema of schemas) {
    if (schema === 'Cfa' || schema === 'Uda')
      throw new RgbLibWebError(
        'UNSUPPORTED_CAPABILITY',
        `listAssets: the ${schema} schema is not supported by the rgb-lib-wasm engine`,
        'listAssets'
      );
    if (!WASM_SCHEMAS.includes(schema))
      throw new ValidationError(
        `Unknown asset schema: ${String(schema)}`,
        'filterAssetSchemas'
      );
  }
  return [...schemas];
}

/** A u64 input, checked (INVALID_AMOUNT), as the BigInt the runtime takes. */
function wireU64(
  value: number | bigint | string,
  field: string,
  positive = false
): bigint {
  return BigInt(u64(value, field, positive));
}
function wireFeeRate(value: number | undefined): bigint {
  return BigInt(feeRate(value));
}
function minConfirmations(
  value: number | undefined,
  fallback: number,
  min: number
) {
  return integer(value ?? fallback, 'minConfirmations', min, 255);
}

// ── bitcoin ─────────────────────────────────────────────────────────────────

export const getAddress = {
  /** A new address is a synchronous mutation: flushed before it is returned. */
  execute: (s: WasmSession) =>
    s.persisted(codec.str(s.wallet.getAddress(), 'address')),
};

export const getBtcBalance = {
  async execute(s: WasmSession, skipSync: boolean) {
    await s.syncFirst(skipSync);
    return codec.publicBtcBalance(
      codec.decodeBtcBalance(s.wallet.getBtcBalance())
    );
  },
};

export const listUnspents = {
  async execute(s: WasmSession, skipSync: boolean) {
    await s.syncFirst(skipSync);
    return codec
      .decodeUnspents(s.wallet.listUnspents(false))
      .map(codec.publicUnspent);
  },
};

type CreateUtxosParams = {
  upTo?: boolean;
  num?: number;
  size?: number;
  feeRate?: number;
  skipSync?: boolean;
};

export const createUtxos = operation({
  prepare: (p: CreateUtxosParams) => ({
    upTo: p.upTo ?? true,
    num: p.num === undefined ? null : integer(p.num, 'num', 1, 255),
    size: p.size === undefined ? null : integer(p.size, 'size', 1, 0xffffffff),
    feeRate: wireFeeRate(p.feeRate),
    skipSync: skipSyncOf(p.skipSync),
  }),
  /** Begin, sign with the wallet keys, end. */
  async execute(s: WasmSession, v) {
    const online = s.connected();
    const psbt = await s.wallet.createUtxosBegin(
      online,
      v.upTo,
      v.num,
      v.size,
      v.feeRate,
      v.skipSync
    );
    const signed = s.sign(psbt);
    return codec.int(
      await s.wallet.createUtxosEnd(online, signed, v.skipSync),
      'created UTXOs',
      'u8'
    );
  },
});

export const sendBtc = operation({
  prepare: (p: SendBtcBeginRequestModel) => ({
    address: p.address,
    amount: wireU64(p.amount, 'amount', true),
    feeRate: wireFeeRate(p.feeRate),
    skipSync: skipSyncOf(p.skipSync),
  }),
  async execute(s: WasmSession, v) {
    const online = s.connected();
    const psbt = await s.wallet.sendBtcBegin(
      online,
      v.address,
      v.amount,
      v.feeRate,
      v.skipSync
    );
    const signed = s.sign(psbt);
    return codec.str(
      await s.wallet.sendBtcEnd(online, signed, v.skipSync),
      'txid'
    );
  },
});

export const estimateFeeRate = {
  prepare: (blocks: number) => integer(blocks, 'blocks', 1, 0xffff),
  async execute(s: WasmSession, blocks: number) {
    return codec.publicFeeEstimate(
      codec.decodeFeeEstimate(
        await s.wallet.getFeeEstimation(s.connected(), blocks)
      )
    );
  },
};

// ── rgb assets ──────────────────────────────────────────────────────────────

export const listAssets = {
  execute(s: WasmSession, options: ListAssetsOptions | undefined) {
    // Validated in the queue, as on React Native; nothing has run yet.
    const schemas = validateAssetSchemas(options?.filterAssetSchemas);
    return codec.publicAssets(codec.decodeAssets(s.wallet.listAssets(schemas)));
  },
};

export const getAssetBalance = {
  execute: (s: WasmSession, assetId: string) =>
    codec.publicBalance(codec.decodeBalance(s.wallet.getAssetBalance(assetId))),
};

export const issueAssetNia = operation({
  prepare: (p: IssueAssetNiaRequestModel) => ({
    ticker: p.ticker,
    name: p.name,
    amounts: issuanceAmounts(p.amounts).amounts.map((n) => BigInt(n)),
    precision: integer(p.precision, 'precision', 0, 18),
  }),
  async execute(s: WasmSession, v) {
    const asset = await s.persisted(
      codec.decodeNia(
        s.wallet.issueAssetNia(v.ticker, v.name, v.precision, v.amounts)
      )
    );
    return codec.publicNia(asset);
  },
});

export const issueAssetIfa = operation({
  prepare: (p: IssueAssetIfaRequestModel) => {
    const exact = issuanceAmounts(p.amounts, p.inflationAmounts);
    return {
      ticker: p.ticker,
      name: p.name,
      amounts: exact.amounts.map((n) => BigInt(n)),
      inflationAmounts: exact.inflationAmounts.map((n) => BigInt(n)),
      precision: integer(p.precision, 'precision', 0, 18),
      rejectListUrl: p.rejectListUrl ?? null,
    };
  },
  async execute(s: WasmSession, v) {
    const asset = await s.persisted(
      codec.decodeIfa(
        s.wallet.issueAssetIfa(
          v.ticker,
          v.name,
          v.precision,
          v.amounts,
          v.inflationAmounts,
          v.rejectListUrl,
          // As on React Native: no link right, not linked from a contract.
          false,
          null
        )
      )
    );
    return codec.publicIfa(asset);
  },
});

export const inflate = operation({
  prepare: (p: InflateAssetIfaRequestModel) => ({
    assetId: p.assetId,
    amounts: p.inflationAmounts.map((n) => wireU64(n, 'inflationAmount', true)),
    feeRate: wireFeeRate(p.feeRate),
    minConfirmations: minConfirmations(p.minConfirmations, 1, 1),
  }),
  async execute(s: WasmSession, v) {
    const online = s.connected();
    const psbt = await s.wallet.inflateBegin(
      online,
      v.assetId,
      v.amounts,
      v.feeRate,
      v.minConfirmations
    );
    const signed = s.sign(psbt);
    return codec.publicOperation(
      codec.decodeOperation(await s.wallet.inflateEnd(online, signed))
    );
  },
});

// ── receive and send ────────────────────────────────────────────────────────

export const receive = operation({
  prepare: (p: ReceiveParams & { witness?: boolean }, witness?: boolean) => {
    // The same check order as before the split: the first error is the same.
    const useWitness = witness ?? p.witness ?? true;
    const duration = integer(
      p.durationSeconds ?? 86400,
      'durationSeconds',
      1,
      0xffffffff
    );
    const kind = resolveReceiveAssignment(p.assignmentKind, p.amount);
    const amount =
      p.amount === undefined ? null : wireU64(p.amount, 'amount', true);
    return {
      witness: useWitness,
      assetId: p.assetId ?? null,
      duration,
      // An Assignment: { Fungible: n } and { InflationRight: n } carry the
      // amount; the other kinds are unit variants.
      assignment: amount === null ? kind : { [kind]: amount },
      minConfirmations: minConfirmations(p.minConfirmations, 0, 0),
    };
  },
  async execute(s: WasmSession, v, online: OnlineContext) {
    // The expiry starts when the invoice is made.
    const expiry = wireU64(
      Math.floor(Date.now() / 1000) + v.duration,
      'expirationTimestamp'
    );
    const args = [
      s.connected(),
      v.assetId,
      v.assignment,
      expiry,
      [online.proxyEndpoint],
      v.minConfirmations,
      null,
    ] as const;
    return codec.publicReceive(
      codec.decodeReceive(
        await (v.witness
          ? s.wallet.witnessReceive(...args)
          : s.wallet.blindReceive(...args))
      )
    );
  },
});

export const decodeRGBInvoice = {
  prepare(params: { invoice: string }) {
    if (typeof params !== 'object' || params === null)
      throw new ValidationError(
        'decodeRGBInvoice needs a params object',
        'params'
      );
    const { invoice } = params;
    if (typeof invoice !== 'string' || invoice.length === 0)
      throw new ValidationError(
        'invoice must be a non-empty string',
        'invoice'
      );
    return invoice;
  },
  execute: (s: WasmSession, invoice: string) =>
    codec.publicInvoice(codec.decodeInvoice(s.invoiceData(invoice)), invoice),
};

/** rgb-lib's own default: invoices without `exp` get one hour. */
const DEFAULT_SEND_EXPIRY_SECONDS = 3600n;
/** Time left to detect the ACK and broadcast before the invoice expires. */
const SEND_EXPIRY_MARGIN_SECONDS = 600n;

export const onchainSend = operation({
  prepare: (p: OnchainSendRequestModel) => {
    // The send always syncs; skipSync: true is refused, not ignored.
    if (p.skipSync === true)
      throw new RgbLibWebError(
        'UNSUPPORTED_CAPABILITY',
        'onchainSend always syncs on RGB_L1; skipSync: true is not supported',
        'onchainSend'
      );
    const amount =
      p.amount === undefined ? null : wireU64(p.amount, 'amount', true);
    // WitnessData: amountSat and blinding are decimal strings; the runtime's
    // from_str_or_number deserializers take no BigInt.
    const witnessData = p.witnessData
      ? {
          amountSat: u64(p.witnessData.amountSat, 'witness amount', true),
          blinding:
            p.witnessData.blinding === undefined
              ? null
              : u64(p.witnessData.blinding, 'blinding'),
        }
      : null;
    return {
      invoice: p.invoice,
      assetId: p.assetId ?? null,
      amount,
      witnessData,
      donation: p.donation ?? false,
      feeRate: wireFeeRate(p.feeRate),
      minConfirmations: minConfirmations(p.minConfirmations, 1, 1),
    };
  },
  /** The Kotlin bridge's `send()`: invoice checks, then begin, sign, end. */
  async execute(s: WasmSession, v, online: OnlineContext) {
    const handle = s.connected();
    const invoice = codec.decodeInvoice(s.invoiceData(v.invoice));
    if (invoice.wasmNetwork !== s.wasmNetwork)
      fail('Invoice network does not match wallet');
    if (
      v.assetId !== null &&
      invoice.assetId !== null &&
      v.assetId !== invoice.assetId
    )
      fail('Asset override does not match invoice');
    const asset = invoice.assetId ?? v.assetId ?? fail('Asset ID is required');
    const n = v.amount;
    let assignment: unknown;
    if (invoice.assignment.type === 'Any') {
      if (n === null || n === 0n) fail('Amount is required');
      assignment = { Fungible: n };
    } else if (invoice.assignment.type === 'Fungible') {
      if (n !== null && n !== invoice.assignment.amount)
        fail('Amount override does not match invoice');
      assignment = codec.encodeAssignment(invoice.assignment);
    } else {
      if (n !== null) fail('Amount override is incompatible with invoice');
      assignment = codec.encodeAssignment(invoice.assignment);
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    const invoiceExpiry = invoice.expirationTimestamp;
    let expiry: bigint;
    if (invoiceExpiry === null) expiry = now + DEFAULT_SEND_EXPIRY_SECONDS;
    else if (invoiceExpiry <= now + SEND_EXPIRY_MARGIN_SECONDS)
      fail('Invoice expires too soon');
    else expiry = invoiceExpiry - SEND_EXPIRY_MARGIN_SECONDS;
    const recipient = {
      recipientId: invoice.recipientId,
      witnessData: v.witnessData,
      assignment,
      transportEndpoints: invoice.transportEndpoints,
      publicKey: invoice.publicKey,
      encryption: invoice.encryption,
      expirationTimestamp: invoiceExpiry,
    };
    const begun = codec.record(
      await s.wallet.sendBegin(
        handle,
        { [asset]: [recipient] },
        v.donation,
        v.feeRate,
        v.minConfirmations,
        expiry,
        online.proxyEndpoint,
        null,
        false
      ),
      'send begin result'
    );
    const signed = s.sign(codec.str(begun.psbt, 'PSBT'));
    return codec.publicOperation(
      codec.decodeOperation(await s.wallet.sendEnd(handle, signed, false))
    );
  },
});

export const failTransfers = operation({
  prepare: (p: FailTransfersRequest) => ({
    batchTransferIdx:
      p.batchTransferIdx === undefined
        ? null
        : integer(p.batchTransferIdx, 'batchTransferIdx', 1, 0x7fffffff),
    noAssetOnly: p.noAssetOnly ?? false,
    skipSync: skipSyncOf(p.skipSync),
  }),
  async execute(s: WasmSession, v) {
    return codec.bool(
      await s.wallet.failTransfers(
        s.connected(),
        v.batchTransferIdx,
        v.noAssetOnly,
        v.skipSync
      ),
      'fail transfers result'
    );
  },
});

// ── history ─────────────────────────────────────────────────────────────────

export const listTransfers = {
  prepare(assetId: string | undefined) {
    if (assetId !== undefined && typeof assetId !== 'string')
      throw new ValidationError('assetId must be a string', 'assetId');
    // AssetFilter is camelCase in this build: "any" or { id }.
    return assetId === undefined ? 'any' : { id: assetId };
  },
  execute: (s: WasmSession, filter: unknown) =>
    codec
      .decodeTransfers(s.wallet.listTransfers(filter, null))
      .map(codec.publicTransfer),
};

export const listTransactions = {
  async execute(s: WasmSession, skipSync: boolean) {
    await s.syncFirst(skipSync);
    return codec
      .decodeTransactions(s.wallet.listTransactions())
      .map(codec.publicTransaction);
  },
};

export const refresh = {
  async execute(s: WasmSession, skipSync: boolean) {
    return codec.publicRefresh(
      codec.decodeRefresh(
        await s.wallet.refresh(s.connected(), null, [], skipSync)
      )
    );
  },
};
