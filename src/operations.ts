/**
 * The public operations (ADR-0002 step 4), each in two parts:
 *
 * - `prepare`: pure. Validates the owned params, applies the input rules and
 *   builds the WASM arguments in the wire form beta.5 takes (BigInt for u64
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
import {
  ValidationError,
  deriveVssSigningKeyFromMnemonic,
  validateBurnParams,
  validateConsignmentLookup,
  getBackupStoreId,
} from '@utexo/rgb-sdk-core';
import type {
  BurnParams,
  BurnResult,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  EstimateFeeResult,
  FailTransfersRequest,
  IndexerUrlInfo,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  IssueAssetIfaRequestModel,
  IssueAssetNiaRequestModel,
  ListAssetsOptions,
  OnchainSendRequestModel,
  ReceiveAssignmentKind,
  ReceiveParams,
  SendAssetEndRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
} from '@utexo/rgb-sdk-core';
import * as codec from './runtime/codec.js';
import { integer } from './config.js';
import type { VssSetting } from './config.js';
import { RgbLibWebError, isCannotEndTransfer } from './errors.js';
import { summarizePsbt } from './runtime/psbt.js';
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
// Ported from `@utexo/rgb-sdk-rn` (`rgb-lib/amounts.ts`). They return checked
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

/** The runtime syncs first unless `skipSync`, as on React Native. */
export const getBtcBalance = {
  async execute(s: WasmSession, skipSync: boolean) {
    return codec.publicBtcBalance(
      codec.decodeBtcBalance(
        await s.wallet.getBtcBalance(s.readHandle(skipSync), skipSync)
      )
    );
  },
};

export const listUnspents = {
  async execute(s: WasmSession, skipSync: boolean) {
    return codec
      .decodeUnspents(
        await s.wallet.listUnspents(s.readHandle(skipSync), false, skipSync)
      )
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
  /**
   * Begin, sign with the wallet keys, end. The signal can stop the begin;
   * once the PSBT is signed the end runs to its result.
   */
  async execute(s: WasmSession, v) {
    const online = s.connected();
    const signed = s.sign(await beginCreateUtxos(s, v));
    return codec.int(
      await s.wallet.createUtxosEnd(online, signed),
      'created UTXOs',
      'u8'
    );
  },
});

function beginCreateUtxos(
  s: WasmSession,
  v: ReturnType<typeof createUtxos.prepare>
): Promise<string> {
  return s.wallet.createUtxosBegin(
    s.connected(),
    v.upTo,
    // Not exact: up to `num` UTXOs as funds allow, as on React Native.
    false,
    v.num,
    v.size,
    v.feeRate,
    v.skipSync,
    false,
    s.signal
  );
}

export const sendBtc = operation({
  prepare: (p: SendBtcBeginRequestModel) => ({
    address: p.address,
    amount: wireU64(p.amount, 'amount', true),
    feeRate: wireFeeRate(p.feeRate),
    skipSync: skipSyncOf(p.skipSync),
  }),
  async execute(s: WasmSession, v) {
    const online = s.connected();
    const signed = s.sign(await beginSendBtc(s, v));
    return codec.str(await s.wallet.sendBtcEnd(online, signed), 'txid');
  },
});

function beginSendBtc(
  s: WasmSession,
  v: ReturnType<typeof sendBtc.prepare>
): Promise<string> {
  return s.wallet.sendBtcBegin(
    s.connected(),
    v.address,
    v.amount,
    v.feeRate,
    v.skipSync,
    false,
    s.signal
  );
}

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

/** `AssetMetadataApi.getAssetMetadata`; an unknown asset is ASSET_NOT_FOUND. */
export const getAssetMetadata = {
  prepare(assetId: unknown): string {
    if (typeof assetId !== 'string' || assetId.length === 0)
      throw new ValidationError(
        'assetId must be a non-empty string',
        'assetId'
      );
    return assetId;
  },
  execute: (s: WasmSession, assetId: string) =>
    codec.decodeAssetMetadata(s.wallet.getAssetMetadata(assetId)),
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
          null,
          false
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
    const signed = s.sign(await beginInflate(s, v));
    return codec.publicOperation(
      codec.decodeOperation(await s.wallet.inflateEnd(online, signed))
    );
  },
});

/** `inflateBegin` returns an `InflateBeginResult`; the PSBT is what is signed. */
async function beginInflate(
  s: WasmSession,
  v: ReturnType<typeof inflate.prepare>
): Promise<string> {
  const begun = codec.record(
    await s.wallet.inflateBegin(
      s.connected(),
      v.assetId,
      v.amounts,
      v.feeRate,
      v.minConfirmations,
      false,
      s.signal
    ),
    'inflate begin result'
  );
  return codec.str(begun.psbt, 'PSBT');
}

/**
 * Burns `amount` of an asset (`burnBegin`, sign, `burnEnd`). The params
 * are checked by core's `validateBurnParams`, as on React Native;
 * `burnRecipient` is the runtime's `burnReason`, 32 bytes as hex.
 */
export const burn = operation({
  prepare: (p: BurnParams) => {
    validateBurnParams(p);
    return {
      assetId: p.assetId,
      amount: wireU64(p.amount, 'amount', true),
      burnReason: p.burnRecipient ?? null,
      feeRate: wireFeeRate(p.feeRate),
      minConfirmations: minConfirmations(p.minConfirmations, 1, 1),
    };
  },
  async execute(s: WasmSession, v) {
    const online = s.connected();
    const begun = codec.record(
      await s.wallet.burnBegin(
        online,
        v.assetId,
        v.amount,
        v.burnReason,
        v.feeRate,
        v.minConfirmations,
        false,
        s.signal
      ),
      'burn begin result'
    );
    const signed = s.sign(codec.str(begun.psbt, 'PSBT'));
    return codec.publicOperation(
      codec.decodeOperation(await s.wallet.burnEnd(online, signed))
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

function prepareSend(p: OnchainSendRequestModel) {
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
}

/** The Kotlin bridge's `send()` up to signing: invoice checks, then begin. */
async function beginSend(
  s: WasmSession,
  v: ReturnType<typeof prepareSend>,
  online: OnlineContext
): Promise<string> {
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
      false,
      s.signal
    ),
    'send begin result'
  );
  return codec.str(begun.psbt, 'PSBT');
}

export const onchainSend = operation({
  prepare: prepareSend,
  async execute(s: WasmSession, v, online: OnlineContext) {
    const signed = s.sign(await beginSend(s, v, online));
    return codec.publicOperation(
      codec.decodeOperation(await s.wallet.sendEnd(s.connected(), signed))
    );
  },
});

// ── externally approved flows (begin, sign elsewhere, end) ──────────────────

/** What `burnBegin` shows before approval, and what recovery needs. */
export interface BurnBeginResult extends EstimateFeeResult {
  /** The unsigned PSBT (base64) to show and sign. */
  psbt: string;
  txid: string;
  /** For `failTransfers` if the burn is not approved. */
  batchTransferIdx: number;
}

function signedPsbtOf(p: { signedPsbt: string }): string {
  if (typeof p.signedPsbt !== 'string' || p.signedPsbt.length === 0)
    throw new ValidationError(
      'signedPsbt must be a non-empty string',
      'signedPsbt'
    );
  return p.signedPsbt;
}

/** A transfer that left `Initiated` for good: its TX is out. */
const SUBMITTED = new Set([
  'WaitingBroadcast',
  'WaitingConfirmations',
  'Settled',
]);

/**
 * Ends an operation so the same signed PSBT can be submitted again after an
 * interruption. The runtime refuses to end a transfer that already moved on;
 * if the history shows this very operation as submitted, that is its result.
 */
async function endOnce(
  s: WasmSession,
  signedPsbt: string,
  kind: 'Send' | 'Burn' | 'Inflation',
  end: () => Promise<unknown>
) {
  try {
    return codec.publicOperation(codec.decodeOperation(await end()));
  } catch (error) {
    if (!isCannotEndTransfer(error)) throw error;
    const { txid } = summarizePsbt(signedPsbt);
    const submitted = codec
      .decodeTransfers(s.wallet.listTransfers('AnyOrNone', { Txid: txid }))
      .find(
        (t) => t.txid === txid && t.kind === kind && SUBMITTED.has(t.status)
      );
    if (!submitted) throw error;
    return { txid, batchTransferIdx: submitted.batchTransferIdx };
  }
}

export const createUtxosBegin = operation({
  prepare: createUtxos.prepare as (
    p: CreateUtxosBeginRequestModel
  ) => ReturnType<typeof createUtxos.prepare>,
  execute: beginCreateUtxos,
});

/**
 * The ends take no `skipSync` in beta.5: the flag of the core model is still
 * checked, and has no effect, as on React Native.
 */
export const createUtxosEnd = operation({
  prepare: (p: CreateUtxosEndRequestModel) => ({
    signedPsbt: signedPsbtOf(p),
    skipSync: skipSyncOf(p.skipSync),
  }),
  async execute(s: WasmSession, v) {
    return codec.int(
      await s.wallet.createUtxosEnd(s.connected(), v.signedPsbt),
      'created UTXOs',
      'u8'
    );
  },
});

export const sendBtcBegin = operation({
  prepare: sendBtc.prepare,
  execute: beginSendBtc,
});

export const sendBtcEnd = operation({
  prepare: (p: SendBtcEndRequestModel) => ({
    signedPsbt: signedPsbtOf(p),
    skipSync: skipSyncOf(p.skipSync),
  }),
  async execute(s: WasmSession, v) {
    return codec.str(
      await s.wallet.sendBtcEnd(s.connected(), v.signedPsbt),
      'txid'
    );
  },
});

export const onchainSendBegin = operation({
  prepare: prepareSend,
  execute: beginSend,
});

export const onchainSendEnd = operation({
  prepare: (p: SendAssetEndRequestModel) => ({
    signedPsbt: signedPsbtOf(p),
    skipSync: skipSyncOf(p.skipSync),
  }),
  execute: (s: WasmSession, v) =>
    endOnce(s, v.signedPsbt, 'Send', () =>
      s.wallet.sendEnd(s.connected(), v.signedPsbt)
    ),
});

export const inflateBegin = operation({
  prepare: inflate.prepare,
  execute: beginInflate,
});

export const inflateEnd = operation({
  prepare: (p: InflateEndRequestModel) => signedPsbtOf(p),
  execute: (s: WasmSession, signedPsbt) =>
    endOnce(s, signedPsbt, 'Inflation', () =>
      s.wallet.inflateEnd(s.connected(), signedPsbt)
    ),
});

export const burnBegin = operation({
  prepare: burn.prepare,
  async execute(s: WasmSession, v): Promise<BurnBeginResult> {
    const begun = codec.record(
      await s.wallet.burnBegin(
        s.connected(),
        v.assetId,
        v.amount,
        v.burnReason,
        v.feeRate,
        v.minConfirmations,
        false,
        s.signal
      ),
      'burn begin result'
    );
    const psbt = codec.str(begun.psbt, 'PSBT');
    return {
      psbt,
      batchTransferIdx: codec.int(
        begun.batchTransferIdx,
        'batch transfer idx',
        'i32'
      ),
      ...summarizePsbt(psbt),
    };
  },
});

export const burnEnd = operation({
  prepare: (p: { signedPsbt: string }) => signedPsbtOf(p),
  execute: (s: WasmSession, signedPsbt): Promise<BurnResult> =>
    endOnce(s, signedPsbt, 'Burn', () =>
      s.wallet.burnEnd(s.connected(), signedPsbt)
    ),
});

/**
 * `ConsignmentApi.getConsignment`: the consignment of an ended burn, which
 * proves it with its history, as base64 (as on React Native). This runtime
 * exports burn consignments only: another transfer is `UnknownTransfer`.
 */
export const getConsignment = {
  prepare(assetId: unknown, txid: unknown) {
    validateConsignmentLookup(assetId as string, txid as string);
    return { assetId: assetId as string, txid: (txid as string).toLowerCase() };
  },
  execute(s: WasmSession, v: { assetId: string; txid: string }): string {
    return codec.encodeBase64(
      codec.decodeConsignmentBytes(
        s.wallet.getBurnConsignment(v.assetId, v.txid)
      )
    );
  },
};

/** `IndexerCheckApi.checkIndexerUrl`: Esplora only in the browser. */
export const checkIndexerUrl = {
  prepare(url: unknown): string {
    if (typeof url !== 'string' || url.length === 0)
      throw new ValidationError('url must be a non-empty string', 'url');
    if (/^(ssl|tcp):\/\//.test(url))
      throw new RgbLibWebError(
        'UNSUPPORTED_CAPABILITY',
        'checkIndexerUrl: the electrum indexer is not available in the browser; use an Esplora URL',
        'checkIndexerUrl'
      );
    return url;
  },
  async execute(s: WasmSession, url: string): Promise<IndexerUrlInfo> {
    return {
      indexerProtocol: codec.decodeIndexerProtocol(
        await s.checkIndexerUrl(url)
      ),
    };
  },
};

export const signPsbt = {
  prepare(psbt: unknown, mnemonic?: unknown): string {
    if (mnemonic !== undefined)
      throw new ValidationError(
        'signPsbt signs with the keys of this wallet and takes no mnemonic',
        'mnemonic'
      );
    summarizePsbt(psbt);
    return psbt as string;
  },
  execute: (s: WasmSession, psbt: string) => s.sign(psbt),
};

export const estimateFee = (psbt: unknown): EstimateFeeResult => {
  const { fee, vbytes, feeRate } = summarizePsbt(psbt);
  return { fee, vbytes, feeRate };
};

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
    // AssetFilter: "AnyOrNone" (also transfers with no asset yet) or { Id }.
    return assetId === undefined ? 'AnyOrNone' : { Id: assetId };
  },
  execute: (s: WasmSession, filter: unknown) =>
    codec
      .decodeTransfers(s.wallet.listTransfers(filter, 'All'))
      .map(codec.publicTransfer),
};

export const listTransactions = {
  async execute(s: WasmSession, skipSync: boolean) {
    return codec
      .decodeTransactions(
        await s.wallet.listTransactions(s.readHandle(skipSync), skipSync)
      )
      .map(codec.publicTransaction);
  },
};

/** Pending incoming transfers only: no send or burn is progressed. */
const INCOMING_REFRESH = [
  'WaitingCounterparty',
  'WaitingSafeHeight',
  'WaitingBroadcast',
  'WaitingConfirmations',
].map((status) => ({ status, incoming: true }));

export const getReceivedMint = {
  prepare(recipientId: unknown): string {
    if (
      typeof recipientId !== 'string' ||
      recipientId.length === 0 ||
      recipientId.length > 1024
    )
      throw new ValidationError(
        'recipientId must be a non-empty string',
        'recipientId'
      );
    return recipientId;
  },
  async execute(s: WasmSession, recipientId: string, refreshIncoming: boolean) {
    if (refreshIncoming) {
      const refreshed = codec.decodeRefresh(
        await s.wallet.refresh(
          s.connected(),
          null,
          INCOMING_REFRESH,
          false,
          s.signal
        )
      );
      // Refresh reports a per-transfer failure in its result, not as an error:
      // a failed check of this receive must reject, not read as a pending mint.
      const batches = new Set(
        codec
          .decodeTransfers(s.wallet.listTransfers('AnyOrNone', 'All'))
          .filter((t) => t.recipientId === recipientId)
          .map((t) => t.batchTransferIdx)
      );
      const failure = refreshed.find(
        (item) => item.failure && batches.has(item.batchTransferIdx)
      )?.failure;
      if (failure)
        throw new RgbLibWebError(
          'NATIVE_ERROR',
          `${failure.name}: ${failure.message}`,
          'getReceivedMint'
        );
    }
    return codec.decodeReceivedMint(s.wallet.getReceivedMint(recipientId));
  },
};

export const refresh = {
  async execute(s: WasmSession, skipSync: boolean) {
    return codec.publicRefresh(
      codec.decodeRefresh(
        await s.wallet.refresh(s.connected(), null, [], skipSync, s.signal)
      )
    );
  },
};

// ── VSS backup (ADR-0003) ───────────────────────────────────────────────────

/**
 * Configures VSS on the opened wallet, inside the open task. The derived
 * signing key goes straight to the runtime and is not kept here. Returns
 * whether VSS is on: a derived identity needs the mnemonic, so a watch-only
 * wallet stays off unless it has an explicit `vss` config.
 */
export function configureVss(
  s: WasmSession,
  setting: VssSetting,
  mnemonic: string | null
): boolean {
  if (setting.kind === 'off') return false;
  if (setting.kind === 'explicit') {
    const c = setting.config;
    s.wallet.configureVssBackup(c.serverUrl, c.storeId, c.signingKey);
    return true;
  }
  if (mnemonic === null) return false;
  s.wallet.configureVssBackup(
    setting.serverUrl,
    getBackupStoreId(s.masterFingerprint),
    deriveVssSigningKeyFromMnemonic(mnemonic)
  );
  return true;
}

export const backupToVss = {
  /** Uploads now; the new server version. */
  execute: async (s: WasmSession) =>
    codec.decodeVssVersion(await s.wallet.vssBackup()),
};

export const autoBackup = {
  /** Uploads only when the wallet changed since the last backup. */
  async execute(s: WasmSession): Promise<number | null> {
    const version = await s.wallet.ensureInitialBackup();
    return version === null ? null : codec.decodeVssVersion(version);
  },
};

/** Options of `restoreFromVss`, checked before admission. */
export const restoreFromVss = {
  prepare(options: unknown): { overwrite: boolean } {
    if (options === undefined) return { overwrite: false };
    if (typeof options !== 'object' || options === null)
      throw new ValidationError(
        'restoreFromVss options must be an object',
        'options'
      );
    const { overwrite } = options as { overwrite?: unknown };
    if (overwrite !== undefined && typeof overwrite !== 'boolean')
      throw new ValidationError('overwrite must be a boolean', 'overwrite');
    return { overwrite: overwrite === true };
  },
  /**
   * Replaces the local state with the server copy. Unless `overwrite`, a
   * wallet with local data is refused, so a restore never wipes newer local
   * state by accident. The runtime flushes the restored state to IndexedDB
   * before it resolves.
   */
  async execute(s: WasmSession, prepared: { overwrite: boolean }) {
    await refuseLocalData(s, prepared.overwrite, 'restoreFromVss');
    await s.wallet.vssRestoreBackup();
  },
};

/**
 * True when the local wallet has anything a restore would replace: assets,
 * transfers, UTXOs or transactions. Reads local state only, no sync.
 */
export async function hasLocalData(s: WasmSession): Promise<boolean> {
  const assets = codec.decodeAssets(s.wallet.listAssets([]));
  if (
    assets.nia.length + assets.ifa.length + assets.bfa.length > 0 ||
    codec.decodeTransfers(s.wallet.listTransfers('AnyOrNone', 'All')).length > 0
  )
    return true;
  // Offline reads: no online handle, no sync.
  if (
    codec.decodeUnspents(await s.wallet.listUnspents(null, false, true)).length
  )
    return true;
  return (
    codec.decodeTransactions(await s.wallet.listTransactions(null, true))
      .length > 0
  );
}

/** What the server holds for this wallet. */
export const vssBackupInfo = {
  execute: async (s: WasmSession) =>
    codec.decodeVssBackupInfo(await s.wallet.vssBackupInfo()),
};

/** RN parity: a backup without a nonempty password is INVALID_CONFIG. */
function backupPassword(params: unknown, operation: string): string {
  const password = (params as { password?: unknown }).password;
  if (typeof password !== 'string' || password.length === 0)
    throw new RgbLibWebError(
      'INVALID_CONFIG',
      `${operation} requires a nonempty password`,
      operation
    );
  return password;
}

function backupParams(params: unknown, operation: string): object {
  if (typeof params !== 'object' || params === null)
    throw new RgbLibWebError(
      'INVALID_CONFIG',
      `${operation} needs a params object`,
      operation
    );
  return params;
}

/** `BackupExportApi.exportBackup`: the encrypted backup, as an owned copy. */
export const exportBackup = {
  prepare(params: unknown): { password: string } {
    return {
      password: backupPassword(
        backupParams(params, 'exportBackup'),
        'exportBackup'
      ),
    };
  },
  async execute(s: WasmSession, prepared: { password: string }) {
    const bytes = codec.decodeBackupBytes(s.wallet.backup(prepared.password));
    // backup() records the backup time and queues a save: flush it first.
    return s.persisted(bytes);
  },
};

/** `BackupRestoreApi.restoreBackup`, between init() and the first connection. */
export const restoreBackup = {
  prepare(params: unknown): {
    bytes: Uint8Array;
    password: string;
    overwrite: boolean;
  } {
    const owned = backupParams(params, 'restoreBackup') as {
      bytes?: unknown;
      overwrite?: unknown;
    };
    const { bytes, overwrite } = owned;
    if (!(bytes instanceof Uint8Array) || bytes.length === 0)
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        'restoreBackup requires bytes: a nonempty Uint8Array',
        'restoreBackup'
      );
    const password = backupPassword(owned, 'restoreBackup');
    if (overwrite !== undefined && typeof overwrite !== 'boolean')
      throw new ValidationError('overwrite must be a boolean', 'overwrite');
    // An owned copy: the caller's buffer may change before the task runs.
    return { bytes: bytes.slice(), password, overwrite: overwrite === true };
  },
  async execute(
    s: WasmSession,
    prepared: { bytes: Uint8Array; password: string; overwrite: boolean }
  ) {
    await refuseLocalData(s, prepared.overwrite, 'restoreBackup');
    s.wallet.restoreBackup(prepared.bytes, prepared.password);
    // The runtime only queues the save of the restored state.
    await s.persisted(undefined);
  },
};

async function refuseLocalData(
  s: WasmSession,
  overwrite: boolean,
  operation: string
) {
  if (!overwrite && (await hasLocalData(s)))
    throw new RgbLibWebError(
      'WALLET_INVALID_STATE',
      'This wallet already has local data; pass { overwrite: true } to replace it with the backup',
      operation
    );
}
