/**
 * Decoding of rgb-lib-wasm 1.0.0-beta.4 results (ADR-0002, "Rules for
 * codec.ts"). Pure functions, in two stages:
 *
 * - `decode*`: raw `unknown` → an internal value with exact numbers (u64 and
 *   i64 stay BigInt). Checks containers, types, Rust ranges and enum
 *   variants; fails with INVALID_NATIVE_RESPONSE.
 * - `public*`: an internal value → the core type. Converts BigInt to
 *   `number` and fails with AMOUNT_OVERFLOW when it does not fit.
 *
 * `FIELDS` classifies every field of every runtime struct. The decoders read
 * only the fields it marks `mapped` or `internal`; other keys are ignored,
 * so an additive runtime release keeps working. Tests use `unknownFields()`
 * to fail on a field the table does not know.
 *
 * `operations.ts` calls both stages on every WasmWallet result, inside the
 * queued task. `encodeAssignment` is the one encoder: it turns a decoded
 * invoice assignment back into a WASM argument.
 *
 * Called by: `operations.ts` and `session.ts`. Depends on: the generated
 * error table (`rgb-lib-messages.generated.ts`), `errors.ts`.
 */
import { AssetSchema } from '@utexo/rgb-sdk-core';
import type {
  AssetBfa,
  AssetIfa,
  AssetNIA,
  BitcoinNetwork,
  RefreshTransfersResult,
  Transaction,
  TransactionType,
  TransferStatus,
  WalletAssignment,
  WalletInvoiceData,
  WalletListAssets,
  WalletTransfer,
  WalletUnspent,
} from '@utexo/rgb-sdk-core';
import { RgbLibWebError } from '../errors.js';
import { RGB_LIB_ERROR_VARIANTS } from './rgb-lib-messages.generated.js';

// ── field tables ────────────────────────────────────────────────────────────

/**
 * - `mapped`: becomes a public field;
 * - `internal`: decoded and used by the adapter, not public;
 * - a string: dropped, and why. Dropped fields are not read.
 */
export type FieldUse = 'mapped' | 'internal' | string;

export interface StructTable {
  /** Where the Rust type is defined, at the pinned commit. */
  readonly rust: string;
  readonly fields: Readonly<Record<string, FieldUse>>;
  /**
   * Fields that hold another struct (or a list, Option or Map of it), by its
   * name in FIELDS.
   */
  readonly nested?: Readonly<Record<string, string>>;
}

const NOT_IN_CORE = 'core has no field for it';

export const FIELDS = {
  Balance: {
    rust: 'src/wallet/offline.rs Balance',
    fields: { settled: 'mapped', future: 'mapped', spendable: 'mapped' },
  },
  BtcBalance: {
    rust: 'src/wallet/offline.rs BtcBalance',
    fields: { vanilla: 'mapped', colored: 'mapped' },
    nested: { vanilla: 'Balance', colored: 'Balance' },
  },
  Outpoint: {
    rust: 'src/wallet/offline.rs Outpoint',
    fields: { txid: 'mapped', vout: 'mapped' },
  },
  Utxo: {
    rust: 'src/wallet/offline.rs Utxo',
    fields: {
      outpoint: 'mapped',
      btcAmount: 'mapped',
      colorable: 'mapped',
      exists: 'mapped',
    },
    nested: { outpoint: 'Outpoint' },
  },
  RgbAllocation: {
    rust: 'src/wallet/offline.rs RgbAllocation',
    fields: { assetId: 'mapped', assignment: 'mapped', settled: 'mapped' },
  },
  Unspent: {
    rust: 'src/wallet/offline.rs Unspent',
    fields: {
      utxo: 'mapped',
      rgbAllocations: 'mapped',
      pendingBlinded: 'mapped',
    },
    nested: { utxo: 'Utxo', rgbAllocations: 'RgbAllocation' },
  },
  BlockTime: {
    rust: 'src/wallet/offline.rs BlockTime',
    fields: { height: 'mapped', timestamp: 'mapped' },
  },
  Transaction: {
    rust: 'src/wallet/offline.rs Transaction',
    fields: {
      transactionType: 'mapped',
      txid: 'mapped',
      received: 'mapped',
      sent: 'mapped',
      fee: 'mapped',
      confirmationTime: 'mapped',
      pending: NOT_IN_CORE,
    },
    nested: { confirmationTime: 'BlockTime' },
  },
  Media: {
    rust: 'src/wallet/offline.rs Media',
    fields: { filePath: 'mapped', digest: 'mapped', mime: 'mapped' },
  },
  AssetNIA: {
    rust: 'src/wallet/offline.rs AssetNIA',
    fields: {
      assetId: 'mapped',
      ticker: 'mapped',
      name: 'mapped',
      details: 'mapped',
      precision: 'mapped',
      issuedSupply: 'mapped',
      timestamp: 'mapped',
      addedAt: 'mapped',
      balance: 'mapped',
      media: 'mapped',
    },
    nested: { balance: 'Balance', media: 'Media' },
  },
  AssetIFA: {
    rust: 'src/wallet/offline.rs AssetIFA',
    fields: {
      assetId: 'mapped',
      ticker: 'mapped',
      name: 'mapped',
      details: 'mapped',
      precision: 'mapped',
      initialSupply: 'mapped',
      maxSupply: 'mapped',
      knownCirculatingSupply: 'mapped',
      timestamp: 'mapped',
      addedAt: 'mapped',
      balance: 'mapped',
      media: 'mapped',
      rejectListUrl: 'mapped',
    },
    nested: { balance: 'Balance', media: 'Media' },
  },
  AssetBFA: {
    rust: 'src/wallet/offline.rs AssetBFA',
    fields: {
      assetId: 'mapped',
      ticker: 'mapped',
      name: 'mapped',
      details: 'mapped',
      precision: 'mapped',
      initialSupply: 'mapped',
      timestamp: 'mapped',
      addedAt: 'mapped',
      balance: 'mapped',
      media: 'mapped',
      rejectListUrl: 'mapped',
    },
    nested: { balance: 'Balance', media: 'Media' },
  },
  Assets: {
    rust: 'src/wallet/offline.rs Assets',
    fields: { nia: 'mapped', ifa: 'mapped', bfa: 'mapped' },
    nested: { nia: 'AssetNIA', ifa: 'AssetIFA', bfa: 'AssetBFA' },
  },
  TransferTransportEndpoint: {
    rust: 'src/wallet/offline.rs TransferTransportEndpoint',
    fields: { endpoint: 'mapped', transportType: 'mapped', used: 'mapped' },
  },
  Transfer: {
    rust: 'src/wallet/offline.rs Transfer',
    fields: {
      idx: 'mapped',
      batchTransferIdx: 'mapped',
      createdAt: 'mapped',
      updatedAt: 'mapped',
      status: 'mapped',
      requestedAssignment: 'mapped',
      assignments: 'mapped',
      kind: 'mapped',
      txid: 'mapped',
      recipientId: 'mapped',
      receiveUtxo: 'mapped',
      changeUtxo: 'mapped',
      expirationTimestamp: 'mapped',
      transportEndpoints: 'mapped',
      senderTransportEndpoint: NOT_IN_CORE,
      invoiceString: 'mapped',
      consignmentPath: 'mapped',
      burnReason: NOT_IN_CORE,
    },
    nested: {
      receiveUtxo: 'Outpoint',
      changeUtxo: 'Outpoint',
      transportEndpoints: 'TransferTransportEndpoint',
    },
  },
  ReceiveData: {
    rust: 'src/wallet/offline.rs ReceiveData',
    fields: {
      invoice: 'mapped',
      recipientId: 'mapped',
      expirationTimestamp: 'mapped',
      batchTransferIdx: 'mapped',
      publicKey: 'mapped',
    },
  },
  InvoiceData: {
    rust: 'src/wallet/offline.rs InvoiceData',
    fields: {
      recipientId: 'mapped',
      assetSchema: 'mapped',
      assetId: 'mapped',
      assignment: 'mapped',
      assignmentName: 'mapped',
      network: 'mapped',
      expirationTimestamp: 'mapped',
      transportEndpoints: 'mapped',
      publicKey: 'mapped',
      encryption: 'mapped',
      unknownQueryParams: 'mapped',
    },
  },
  OperationResult: {
    rust: 'src/wallet/online.rs OperationResult',
    fields: {
      txid: 'mapped',
      batchTransferIdx: 'mapped',
      entropy: NOT_IN_CORE,
    },
  },
  SendBeginResult: {
    rust: 'src/wallet/online.rs SendBeginResult',
    fields: {
      psbt: 'internal',
      batchTransferIdx: 'sendEnd returns it',
      details: 'sendEnd returns what the adapter needs',
    },
  },
  RefreshedTransfer: {
    rust: 'src/wallet/online.rs RefreshedTransfer',
    // `failure` is an `Error`: its variants and their fields come from
    // RGB_LIB_ERROR_VARIANTS (generated from src/error.rs).
    fields: { updatedStatus: 'mapped', failure: 'mapped' },
  },
  AssignmentsCollection: {
    // No rename_all: snake_case. Only inside the InsufficientAssignments error.
    rust: 'src/wallet/online.rs AssignmentsCollection',
    fields: {
      fungible: 'mapped',
      non_fungible: 'mapped',
      inflation: 'mapped',
      link: 'mapped',
      mint: 'mapped',
    },
  },
} as const satisfies Record<string, StructTable>;

export type StructName = keyof typeof FIELDS;

/** The struct each WasmWallet result holds (alone, in a list, or as Map values). */
export const RESULTS: Readonly<Record<string, StructName | null>> = {
  getAddress: null,
  getBtcBalance: 'BtcBalance',
  getAssetBalance: 'Balance',
  getFeeEstimation: null,
  listAssets: 'Assets',
  listUnspents: 'Unspent',
  listTransactions: 'Transaction',
  listTransfers: 'Transfer',
  blindReceive: 'ReceiveData',
  witnessReceive: 'ReceiveData',
  invoiceData: 'InvoiceData',
  issueAssetNia: 'AssetNIA',
  issueAssetIfa: 'AssetIFA',
  createUtxosBegin: null,
  createUtxosEnd: null,
  sendBtcBegin: null,
  sendBtcEnd: null,
  sendBegin: 'SendBeginResult',
  sendEnd: 'OperationResult',
  inflateBegin: null,
  inflateEnd: 'OperationResult',
  failTransfers: null,
  refresh: 'RefreshedTransfer',
};

/**
 * Paths of the keys in `value` that the table of `struct` does not list,
 * through nested structs, lists, Options and Map values. For tests.
 */
export function unknownFields(
  struct: StructName,
  value: unknown,
  path = '$'
): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value))
    return value.flatMap((v, i) => unknownFields(struct, v, `${path}[${i}]`));
  if (value instanceof Map)
    return [...value.values()].flatMap((v, i) =>
      unknownFields(struct, v, `${path}{${i}}`)
    );
  if (typeof value !== 'object') return [];
  const table: StructTable = FIELDS[struct];
  const out: string[] = [];
  for (const [key, item] of Object.entries(value)) {
    const at = `${path}.${key}`;
    if (!Object.hasOwn(table.fields, key)) {
      out.push(at);
      continue;
    }
    if (struct === 'RefreshedTransfer' && key === 'failure') {
      out.push(...unknownErrorFields(item, at));
      continue;
    }
    const child = table.nested?.[key] as StructName | undefined;
    if (child) out.push(...unknownFields(child, item, at));
  }
  return out;
}

/** The same for an `Error` value: an unknown variant or field. */
function unknownErrorFields(value: unknown, path: string): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string')
    return Object.hasOwn(RGB_LIB_ERROR_VARIANTS, value)
      ? []
      : [`${path}.${value}`];
  if (typeof value !== 'object') return [];
  const out: string[] = [];
  for (const [variant, fields] of Object.entries(value)) {
    const at = `${path}.${variant}`;
    if (!Object.hasOwn(RGB_LIB_ERROR_VARIANTS, variant)) {
      out.push(at);
      continue;
    }
    const known = RGB_LIB_ERROR_VARIANTS[variant] ?? {};
    if (fields === null || typeof fields !== 'object') continue;
    for (const [key, item] of Object.entries(fields)) {
      if (!Object.hasOwn(known, key)) out.push(`${at}.${key}`);
      else if (known[key] === 'AssignmentsCollection')
        out.push(
          ...unknownFields('AssignmentsCollection', item, `${at}.${key}`)
        );
    }
  }
  return out;
}

// ── scalar decoders ─────────────────────────────────────────────────────────

const U64_MAX = 2n ** 64n - 1n;
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function invalid(field: string): never {
  throw new RgbLibWebError(
    'INVALID_NATIVE_RESPONSE',
    `Invalid rgb-lib-wasm ${field}`
  );
}
/** The same code with a message of its own (kept from the earlier mappers). */
function rejected(message: string): never {
  throw new RgbLibWebError('INVALID_NATIVE_RESPONSE', message);
}

/** A plain object (a Rust struct); a `Map` or an array is not one. */
export function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object') invalid(field);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) invalid(field);
  return value as Record<string, unknown>;
}
function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field);
  return value;
}
function absent(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}
export function str(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(field);
  return value;
}
function optStr(value: unknown, field: string): string | null {
  return absent(value) ? null : str(value, field);
}
/** A `String` field that the old readers took as optional. */
function needStr(value: unknown, field: string, missing: string): string {
  if (absent(value)) rejected(`Missing ${missing}`);
  return str(value, field);
}
export function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(field);
  return value;
}

const INT_RANGES = {
  u8: [0, 0xff],
  u32: [0, 0xffff_ffff],
  i32: [-0x8000_0000, 0x7fff_ffff],
} as const;

/** u8 / u32 / i32: a number within the Rust type's range. */
export function int(
  value: unknown,
  field: string,
  type: keyof typeof INT_RANGES
): number {
  const [min, max] = INT_RANGES[type];
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    invalid(field);
  return value;
}

/** u64 / i64: a BigInt (or a safe integer number) within the Rust range. */
function big(value: unknown, field: string, signed = false): bigint {
  const [min, max] = signed ? [I64_MIN, I64_MAX] : [0n, U64_MAX];
  if (typeof value === 'bigint') {
    if (value < min || value > max) invalid(field);
    return value;
  }
  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    (signed || value >= 0)
  )
    return BigInt(value);
  return invalid(field);
}
function optBig(value: unknown, field: string): bigint | null {
  return absent(value) ? null : big(value, field);
}

function known<T extends string>(
  value: string,
  values: readonly T[],
  field: string
): T {
  if (!values.includes(value as T)) rejected(`Unknown rgb-lib-wasm ${field}`);
  return value as T;
}

// ── public number projection ────────────────────────────────────────────────

/** An exact integer as a core `number`, or AMOUNT_OVERFLOW. */
export function toNumber(value: bigint, field: string): number {
  if (value > SAFE || value < -SAFE)
    throw new RgbLibWebError(
      'AMOUNT_OVERFLOW',
      `${field} cannot be represented by the numeric SDK field`
    );
  return Number(value);
}

// ── assignments ─────────────────────────────────────────────────────────────

const ASSIGNMENT_TYPES = [
  'Fungible',
  'NonFungible',
  'InflationRight',
  'MintRight',
  'LinkRight',
  'Any',
] as const;
type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

/** `Assignment`, externally tagged: `"Any"` or `{ Fungible: 10n }`. */
export interface Assignment {
  type: AssignmentType;
  /** For Fungible and InflationRight; null for the others. */
  amount: bigint | null;
}

export function decodeAssignment(value: unknown): Assignment {
  let type: string;
  let amount: bigint | null = null;
  if (typeof value === 'string') {
    type = value;
  } else {
    const entries = Object.entries(record(value, 'assignment'));
    if (entries.length !== 1) invalid('assignment');
    const [tag, inner] = entries[0]!;
    type = tag;
    amount = big(inner, 'assignment amount');
  }
  const known_ = known(type, ASSIGNMENT_TYPES, 'assignment');
  const amounted = known_ === 'Fungible' || known_ === 'InflationRight';
  if (amounted && amount === null) rejected('Missing assignment amount');
  if (!amounted && amount !== null) rejected('Unexpected assignment amount');
  return { type: known_, amount };
}
function optAssignment(value: unknown): Assignment | null {
  return absent(value) ? null : decodeAssignment(value);
}

/** An `Assignment` in the wire form the runtime takes: `"Any"` or `{ Fungible: 10n }`. */
export function encodeAssignment(value: Assignment): unknown {
  return value.amount === null ? value.type : { [value.type]: value.amount };
}

/** `amountBaseUnits` is exact; `amount` only when it fits a `number`. */
function amountFields(total: bigint) {
  return {
    amountBaseUnits: total.toString(),
    ...(total <= SAFE && { amount: Number(total) }),
  };
}

export function publicAssignment(value: Assignment): WalletAssignment {
  if (value.amount === null) return { type: value.type };
  return { type: value.type, ...amountFields(value.amount) };
}

// ── balances, unspents, transactions ────────────────────────────────────────

export interface Balance {
  settled: bigint;
  future: bigint;
  spendable: bigint;
}

export function decodeBalance(value: unknown): Balance {
  const v = record(value, 'balance');
  return {
    settled: big(v.settled, 'settled balance'),
    future: big(v.future, 'future balance'),
    spendable: big(v.spendable, 'spendable balance'),
  };
}
export function publicBalance(value: Balance) {
  return {
    settled: toNumber(value.settled, 'settled'),
    future: toNumber(value.future, 'future'),
    spendable: toNumber(value.spendable, 'spendable'),
  };
}

export interface BtcBalance {
  vanilla: Balance;
  colored: Balance;
}
export function decodeBtcBalance(value: unknown): BtcBalance {
  const v = record(value, 'BTC balance');
  return {
    vanilla: decodeBalance(v.vanilla),
    colored: decodeBalance(v.colored),
  };
}
export function publicBtcBalance(value: BtcBalance) {
  return {
    vanilla: publicBalance(value.vanilla),
    colored: publicBalance(value.colored),
  };
}

export interface Outpoint {
  txid: string;
  vout: number;
}
function decodeOutpoint(value: unknown): Outpoint {
  const v = record(value, 'outpoint');
  return {
    txid: str(v.txid, 'outpoint txid'),
    vout: int(v.vout, 'vout', 'u32'),
  };
}
function optOutpoint(value: unknown): Outpoint | null {
  return absent(value) ? null : decodeOutpoint(value);
}

export interface Unspent {
  utxo: {
    outpoint: Outpoint;
    btcAmount: bigint;
    colorable: boolean;
    exists: boolean;
  };
  rgbAllocations: {
    assetId: string | null;
    assignment: Assignment;
    settled: boolean;
  }[];
  pendingBlinded: number;
}

export function decodeUnspents(value: unknown): Unspent[] {
  return list(value, 'unspents').map((item) => {
    const v = record(item, 'unspent');
    const utxo = record(v.utxo, 'utxo');
    return {
      utxo: {
        outpoint: decodeOutpoint(utxo.outpoint),
        btcAmount: big(utxo.btcAmount, 'btcAmount'),
        colorable: bool(utxo.colorable, 'colorable'),
        exists: bool(utxo.exists, 'exists'),
      },
      rgbAllocations: list(v.rgbAllocations, 'allocations').map((a) => {
        const r = record(a, 'allocation');
        return {
          assetId: optStr(r.assetId, 'allocation asset ID'),
          assignment: decodeAssignment(r.assignment),
          settled: bool(r.settled, 'settled'),
        };
      }),
      pendingBlinded: int(v.pendingBlinded, 'pending blinded', 'u32'),
    };
  });
}
export function publicUnspent(value: Unspent): WalletUnspent {
  return {
    utxo: {
      ...value.utxo,
      btcAmount: toNumber(value.utxo.btcAmount, 'btcAmount'),
    },
    pendingBlinded: value.pendingBlinded,
    rgbAllocations: value.rgbAllocations.map((a) => ({
      assetId: a.assetId ?? undefined,
      assignment: publicAssignment(a.assignment),
      settled: a.settled,
    })),
  };
}

const TRANSACTION_TYPES: readonly TransactionType[] = [
  'RgbSend',
  'Drain',
  'CreateUtxos',
  'SendBtc',
  'Incoming',
];

export interface WalletTransaction {
  transactionType: TransactionType;
  txid: string;
  received: bigint;
  sent: bigint;
  fee: bigint;
  confirmationTime: { height: number; timestamp: bigint } | null;
}

export function decodeTransactions(value: unknown): WalletTransaction[] {
  return list(value, 'transactions').map((item) => {
    const v = record(item, 'transaction');
    const time = absent(v.confirmationTime)
      ? null
      : record(v.confirmationTime, 'confirmation time');
    const type = str(v.transactionType, 'transaction type');
    return {
      txid: str(v.txid, 'txid'),
      received: big(v.received, 'received'),
      sent: big(v.sent, 'sent'),
      fee: big(v.fee, 'fee'),
      confirmationTime: time && {
        height: int(time.height, 'height', 'u32'),
        timestamp: big(time.timestamp, 'confirmation timestamp'),
      },
      transactionType: known(type, TRANSACTION_TYPES, 'transaction type'),
    };
  });
}
export function publicTransaction(value: WalletTransaction): Transaction {
  return {
    txid: value.txid,
    transactionType: value.transactionType,
    received: toNumber(value.received, 'received'),
    sent: toNumber(value.sent, 'sent'),
    fee: toNumber(value.fee, 'fee'),
    confirmationTime: value.confirmationTime
      ? {
          height: value.confirmationTime.height,
          timestamp: toNumber(
            value.confirmationTime.timestamp,
            'confirmation timestamp'
          ),
        }
      : undefined,
  };
}

// ── assets ──────────────────────────────────────────────────────────────────

export interface Media {
  filePath: string;
  digest: string;
  mime: string;
}
interface AssetBase {
  assetId: string;
  ticker: string;
  name: string;
  details: string | null;
  precision: number;
  timestamp: bigint;
  addedAt: bigint;
  balance: Balance;
  media: Media | null;
}
export interface AssetNia extends AssetBase {
  issuedSupply: bigint;
}
export interface AssetIfaExact extends AssetBase {
  initialSupply: bigint;
  maxSupply: bigint;
  knownCirculatingSupply: bigint;
  rejectListUrl: string | null;
}
export interface AssetBfaExact extends AssetBase {
  initialSupply: bigint;
  rejectListUrl: string | null;
}
export interface Assets {
  nia: AssetNia[];
  ifa: AssetIfaExact[];
  bfa: AssetBfaExact[];
}

function decodeMedia(value: unknown): Media | null {
  if (absent(value)) return null;
  const m = record(value, 'media');
  return {
    filePath: str(m.filePath, 'media path'),
    digest: str(m.digest, 'media digest'),
    mime: str(m.mime, 'media mime'),
  };
}
function decodeBase(v: Record<string, unknown>) {
  return {
    assetId: str(v.assetId, 'asset ID'),
    name: str(v.name, 'asset name'),
    details: optStr(v.details, 'details'),
    precision: int(v.precision, 'precision', 'u8'),
    timestamp: big(v.timestamp, 'timestamp', true),
    addedAt: big(v.addedAt, 'addedAt', true),
    balance: decodeBalance(v.balance),
    media: decodeMedia(v.media),
  };
}
/** A supply that is a `u64` in Rust; the old readers took it as optional. */
function supply(value: unknown, field: string, name: string): bigint {
  if (absent(value)) rejected(`Missing ${name}`);
  return big(value, field);
}

export function decodeNia(value: unknown): AssetNia {
  const v = record(value, 'asset');
  const base = decodeBase(v);
  return {
    ...base,
    ticker: needStr(v.ticker, 'ticker', 'ticker'),
    issuedSupply: supply(v.issuedSupply, 'issued supply', 'issuedSupply'),
  };
}
export function decodeIfa(value: unknown): AssetIfaExact {
  const v = record(value, 'asset');
  const base = decodeBase(v);
  const rejectListUrl = optStr(v.rejectListUrl, 'reject list URL');
  return {
    ...base,
    ticker: needStr(v.ticker, 'ticker', 'ticker'),
    initialSupply: supply(v.initialSupply, 'initial supply', 'initialSupply'),
    maxSupply: supply(v.maxSupply, 'max supply', 'maxSupply'),
    knownCirculatingSupply: supply(
      v.knownCirculatingSupply,
      'circulating supply',
      'knownCirculatingSupply'
    ),
    rejectListUrl,
  };
}
export function decodeBfa(value: unknown): AssetBfaExact {
  const v = record(value, 'asset');
  const base = decodeBase(v);
  const rejectListUrl = optStr(v.rejectListUrl, 'reject list URL');
  return {
    ...base,
    ticker: needStr(v.ticker, 'ticker', 'ticker'),
    initialSupply: supply(v.initialSupply, 'initial supply', 'initialSupply'),
    rejectListUrl,
  };
}

/** `Assets`: each bucket is `Option<Vec<…>>`; an absent one is empty. */
export function decodeAssets(value: unknown): Assets {
  const v = record(value, 'assets');
  const bucket = <T>(items: unknown, decode: (x: unknown) => T): T[] =>
    absent(items) ? [] : list(items, 'assets').map(decode);
  return {
    nia: bucket(v.nia, decodeNia),
    ifa: bucket(v.ifa, decodeIfa),
    bfa: bucket(v.bfa, decodeBfa),
  };
}

function publicBase(value: AssetBase) {
  return {
    assetId: value.assetId,
    name: value.name,
    details: value.details ?? undefined,
    precision: value.precision,
    timestamp: toNumber(value.timestamp, 'timestamp'),
    addedAt: toNumber(value.addedAt, 'addedAt'),
    balance: publicBalance(value.balance),
    media: value.media ?? undefined,
  };
}
export function publicNia(value: AssetNia): AssetNIA {
  return {
    ...publicBase(value),
    ticker: value.ticker,
    issuedSupply: toNumber(value.issuedSupply, 'issuedSupply'),
  };
}
export function publicIfa(value: AssetIfaExact): AssetIfa {
  return {
    ...publicBase(value),
    ticker: value.ticker,
    initialSupply: toNumber(value.initialSupply, 'initialSupply'),
    maxSupply: toNumber(value.maxSupply, 'maxSupply'),
    knownCirculatingSupply: toNumber(
      value.knownCirculatingSupply,
      'knownCirculatingSupply'
    ),
    rejectListUrl: value.rejectListUrl ?? undefined,
  };
}
export function publicBfa(value: AssetBfaExact): AssetBfa {
  return {
    ...publicBase(value),
    ticker: value.ticker,
    initialSupply: toNumber(value.initialSupply, 'initialSupply'),
    rejectListUrl: value.rejectListUrl ?? undefined,
  };
}
/** rgb-lib-wasm has no CFA or UDA schema: those lists stay empty. */
export function publicAssets(value: Assets): WalletListAssets {
  return {
    nia: value.nia.map(publicNia),
    ifa: value.ifa.map(publicIfa),
    cfa: [],
    uda: [],
    bfa: value.bfa.map(publicBfa),
  };
}

// ── transfers ───────────────────────────────────────────────────────────────

const TRANSFER_STATUSES: readonly TransferStatus[] = [
  'Initiated',
  'WaitingCounterparty',
  'WaitingSafeHeight',
  'WaitingBroadcast',
  'WaitingConfirmations',
  'Settled',
  'Failed',
];
const TRANSFER_KINDS = [
  'Issuance',
  'ReceiveBlind',
  'ReceiveWitness',
  'Send',
  'Inflation',
  'Burn',
  'Mint',
  'Link',
] as const;

export interface Transfer {
  idx: number;
  batchTransferIdx: number;
  createdAt: bigint;
  updatedAt: bigint;
  status: TransferStatus;
  requestedAssignment: Assignment | null;
  assignments: Assignment[];
  kind: (typeof TRANSFER_KINDS)[number];
  txid: string | null;
  recipientId: string | null;
  receiveUtxo: Outpoint | null;
  /** This rgb-lib reports at most one change UTXO. */
  changeUtxo: Outpoint | null;
  expiration: bigint | null;
  transportEndpoints: {
    endpoint: string;
    transportType: (typeof TRANSPORT_TYPES)[number];
    used: boolean;
  }[];
  invoiceString: string | null;
  consignmentPath: string | null;
}

export function decodeTransferStatus(value: unknown, field: string) {
  return known(str(value, field), TRANSFER_STATUSES, 'transfer status');
}

export function decodeTransfers(value: unknown): Transfer[] {
  return list(value, 'transfers').map((item) => {
    const v = record(item, 'transfer');
    const transfer = {
      idx: int(v.idx, 'transfer idx', 'i32'),
      batchTransferIdx: int(v.batchTransferIdx, 'batch transfer idx', 'i32'),
      createdAt: big(v.createdAt, 'createdAt', true),
      updatedAt: big(v.updatedAt, 'updatedAt', true),
      status: str(v.status, 'transfer status'),
      requestedAssignment: optAssignment(v.requestedAssignment),
      assignments: list(v.assignments, 'assignments').map(decodeAssignment),
      kind: str(v.kind, 'transfer kind'),
      txid: optStr(v.txid, 'txid'),
      recipientId: optStr(v.recipientId, 'recipient ID'),
      receiveUtxo: optOutpoint(v.receiveUtxo),
      changeUtxo: optOutpoint(v.changeUtxo),
      expiration: optBig(v.expirationTimestamp, 'expiration'),
      transportEndpoints: list(v.transportEndpoints, 'transport endpoints').map(
        (x) => {
          const e = record(x, 'transport endpoint');
          return {
            endpoint: str(e.endpoint, 'endpoint'),
            transportType: known(
              str(e.transportType, 'transport type'),
              TRANSPORT_TYPES,
              'transport type'
            ),
            used: bool(e.used, 'endpoint used'),
          };
        }
      ),
      invoiceString: optStr(v.invoiceString, 'invoice string'),
      consignmentPath: optStr(v.consignmentPath, 'consignment path'),
    };
    return {
      ...transfer,
      status: known(transfer.status, TRANSFER_STATUSES, 'transfer status'),
      kind: known(transfer.kind, TRANSFER_KINDS, 'transfer kind'),
    };
  });
}

export function publicTransfer(value: Transfer): WalletTransfer {
  const fungible = value.assignments
    .filter((a) => a.type === 'Fungible')
    .map((a) => a.amount!);
  const total = fungible.length
    ? fungible.reduce((sum, n) => sum + n, 0n)
    : value.requestedAssignment?.type === 'Fungible'
      ? value.requestedAssignment.amount!
      : undefined;
  const changeUtxos = value.changeUtxo ? [value.changeUtxo] : [];
  return {
    idx: value.idx,
    batchTransferIdx: value.batchTransferIdx,
    createdAt: toNumber(value.createdAt, 'createdAt'),
    updatedAt: toNumber(value.updatedAt, 'updatedAt'),
    status: value.status,
    kind: value.kind,
    requestedAssignment: value.requestedAssignment
      ? publicAssignment(value.requestedAssignment)
      : undefined,
    assignments: value.assignments.map(publicAssignment),
    ...(total !== undefined && amountFields(total)),
    txid: value.txid ?? undefined,
    recipientId: value.recipientId ?? undefined,
    receiveUtxo: value.receiveUtxo ?? undefined,
    changeUtxos,
    changeUtxo: changeUtxos[0],
    expiration:
      value.expiration === null
        ? undefined
        : toNumber(value.expiration, 'expiration'),
    transportEndpoints: value.transportEndpoints,
    invoiceString: value.invoiceString ?? undefined,
    consignmentPath: value.consignmentPath ?? undefined,
  };
}

// ── receive, invoice, operations ────────────────────────────────────────────

export interface ReceiveData {
  invoice: string;
  recipientId: string;
  expirationTimestamp: bigint;
  batchTransferIdx: number;
  publicKey: string;
}
export function decodeReceive(value: unknown): ReceiveData {
  const v = record(value, 'receive data');
  return {
    invoice: str(v.invoice, 'invoice'),
    recipientId: str(v.recipientId, 'recipient ID'),
    expirationTimestamp: big(v.expirationTimestamp, 'expiration'),
    batchTransferIdx: int(v.batchTransferIdx, 'batch transfer idx', 'i32'),
    publicKey: str(v.publicKey, 'public key'),
  };
}
export function publicReceive(value: ReceiveData) {
  return {
    ...value,
    expirationTimestamp: toNumber(
      value.expirationTimestamp,
      'expirationTimestamp'
    ),
  };
}

/** rgb-lib-wasm's `BitcoinNetwork` serde names → SDK network names. */
const INVOICE_NETWORKS: Readonly<Record<string, BitcoinNetwork>> = {
  Mainnet: 'mainnet',
  Testnet: 'testnet',
  Testnet4: 'testnet4',
  Signet: 'signet',
  Regtest: 'regtest',
};
/** beta.4 `TransportType` (`src/database/enums.rs`): its only variant. */
const TRANSPORT_TYPES = ['JsonRpc'] as const;
/** beta.4 `AssetSchema` (`src/database/enums.rs`): its only variants. */
const ASSET_SCHEMAS = [AssetSchema.Nia, AssetSchema.Ifa, 'Bfa'] as const;
const ENCRYPTIONS = ['Required', 'Unsupported', 'Optional'] as const;

export interface Invoice {
  recipientId: string;
  assetSchema: (typeof ASSET_SCHEMAS)[number] | null;
  assetId: string | null;
  assignment: Assignment;
  assignmentName: string | null;
  network: BitcoinNetwork;
  /** As the runtime names it, for the wallet network check. */
  wasmNetwork: string;
  expirationTimestamp: bigint | null;
  transportEndpoints: string[];
  publicKey: string | null;
  encryption: (typeof ENCRYPTIONS)[number];
  unknownQueryParams: Record<string, string>;
}

export function decodeInvoice(value: unknown): Invoice {
  const v = record(value, 'invoice data');
  // A HashMap<String, String>, built as a plain object
  // (serialize_maps_as_objects in bindings/wasm/src/lib.rs).
  // Required in Rust (not an Option): a missing map is a malformed response.
  const params = record(v.unknownQueryParams, 'query params');
  const expirationTimestamp = optBig(
    v.expirationTimestamp,
    'invoice expiration'
  );
  const wasmNetwork = str(v.network, 'invoice network');
  const decoded = {
    recipientId: str(v.recipientId, 'recipient ID'),
    assetSchema: optStr(v.assetSchema, 'asset schema'),
    assetId: optStr(v.assetId, 'asset ID'),
    assignment: decodeAssignment(v.assignment),
    assignmentName: optStr(v.assignmentName, 'assignment name'),
    // Own keys only: "constructor" or "__proto__" must not resolve.
    network: Object.hasOwn(INVOICE_NETWORKS, wasmNetwork)
      ? INVOICE_NETWORKS[wasmNetwork]!
      : invalid('invoice network'),
    wasmNetwork,
    expirationTimestamp,
    transportEndpoints: list(v.transportEndpoints, 'transport endpoints').map(
      (e) => str(e, 'transport endpoint')
    ),
    publicKey: optStr(v.publicKey, 'public key'),
    encryption: str(v.encryption, 'encryption'),
    // Sorted by key, so Object.keys() and JSON.stringify() are stable.
    unknownQueryParams: Object.fromEntries(
      Object.entries(params)
        .map(([key, item]) => [key, str(item, 'query param')] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    ),
  };
  return {
    ...decoded,
    assetSchema:
      decoded.assetSchema === null
        ? null
        : known(decoded.assetSchema, ASSET_SCHEMAS, 'invoice schema'),
    encryption: known(decoded.encryption, ENCRYPTIONS, 'encryption'),
  };
}
export function publicInvoice(
  value: Invoice,
  encoded: string
): WalletInvoiceData {
  return {
    invoice: encoded,
    recipientId: value.recipientId,
    assetId: value.assetId ?? undefined,
    assetSchema: (value.assetSchema ?? undefined) as AssetSchema | undefined,
    assignment: publicAssignment(value.assignment),
    assignmentName: value.assignmentName ?? undefined,
    network: value.network,
    expirationTimestamp:
      value.expirationTimestamp === null
        ? null
        : toNumber(value.expirationTimestamp, 'expirationTimestamp'),
    transportEndpoints: value.transportEndpoints,
    publicKey: value.publicKey ?? undefined,
    encryption: value.encryption,
    unknownQueryParams: { ...value.unknownQueryParams },
  };
}

/** `OperationResult` of sendEnd and inflateEnd. The entropy is not read. */
export interface Operation {
  txid: string;
  batchTransferIdx: number;
}
export function decodeOperation(value: unknown): Operation {
  const v = record(value, 'operation result');
  const txid = str(v.txid, 'txid');
  const batchTransferIdx = int(v.batchTransferIdx, 'batch transfer idx', 'i32');
  if (!/^[0-9a-f]{64}$/.test(txid) || batchTransferIdx < 0)
    rejected('Invalid operation result');
  return { txid, batchTransferIdx };
}
export function publicOperation(value: Operation) {
  return { txid: value.txid, batchTransferIdx: value.batchTransferIdx };
}

/** `getFeeEstimation`: an f64 in sat/vB. */
export function decodeFeeEstimate(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > Number.MAX_SAFE_INTEGER
  )
    rejected('Invalid fee estimation');
  return value;
}
/** A recommendation; explicit send inputs are never rounded. */
export function publicFeeEstimate(value: number) {
  return { feeRate: Math.ceil(value) };
}

// ── refresh ─────────────────────────────────────────────────────────────────

export interface RefreshFailure {
  /** `RGB_LIB_<Variant>`, as on React Native. */
  name: string;
  message: string;
}
export interface Refreshed {
  batchTransferIdx: number;
  updatedStatus: TransferStatus | null;
  failure: RefreshFailure | null;
}

/** The Rust field types of the beta.4 `Error` variants, as text. */
const ERROR_FIELD = {
  String: (v: unknown, f: string) => str(v, f),
  // An enum with unit variants only, serialized as its name.
  AssetSchema: (v: unknown, _f: string) =>
    known(str(v, 'refresh failure details'), ASSET_SCHEMAS, 'asset schema'),
  u64: (v: unknown, f: string) => big(v, f).toString(),
  i32: (v: unknown, f: string) => String(int(v, f, 'i32')),
  AssignmentsCollection: (v: unknown, f: string) => {
    const a = record(v, f);
    return `{fungible: ${big(a.fungible, f)}, non_fungible: ${bool(a.non_fungible, f)}, inflation: ${big(a.inflation, f)}, link: ${bool(a.link, f)}, mint: ${big(a.mint, f)}}`;
  },
} as const;

/** For tests: every field type the generated variants use is handled. */
export const ERROR_FIELD_TYPES: readonly string[] = Object.keys(ERROR_FIELD);

/**
 * A failure: an `Error`, externally tagged — `"Variant"` for a unit variant,
 * `{ Variant: { field: … } }` for a struct variant. The variant must be one of
 * beta.4; a struct variant's message lists its fields in Rust order, exact.
 * Fields the variant does not have are ignored.
 */
function decodeFailure(value: unknown): RefreshFailure {
  let variant: string;
  let fields: unknown;
  if (typeof value === 'string') {
    variant = value;
  } else {
    const entries = Object.entries(record(value, 'refresh failure'));
    if (entries.length !== 1) invalid('refresh failure');
    [variant, fields] = entries[0]!;
  }
  if (!Object.hasOwn(RGB_LIB_ERROR_VARIANTS, variant))
    rejected('Unknown rgb-lib-wasm refresh failure');
  const known = RGB_LIB_ERROR_VARIANTS[variant] ?? null;
  if ((known === null) !== (typeof value === 'string'))
    invalid('refresh failure');
  let message = variant;
  if (known !== null) {
    const v = record(fields, 'refresh failure fields');
    const details = Object.entries(known).map(([name, type]) => {
      const text = ERROR_FIELD[type as keyof typeof ERROR_FIELD];
      if (!text) invalid('refresh failure fields');
      return `${name}: ${text(v[name], 'refresh failure details')}`;
    });
    message = `${variant} (${details.join(', ')})`;
  }
  return { name: `RGB_LIB_${variant}`, message };
}

/** `RefreshResult`: `HashMap<i32, RefreshedTransfer>`, a Map with number keys. */
export function decodeRefresh(value: unknown): Refreshed[] {
  if (!(value instanceof Map)) invalid('refresh result');
  return [...value.entries()].map(([key, item]) => {
    const batchTransferIdx = int(key, 'batch transfer idx', 'i32');
    const v = record(item, 'refreshed transfer');
    const status = optStr(v.updatedStatus, 'updated status');
    const failure = absent(v.failure) ? null : decodeFailure(v.failure);
    return {
      batchTransferIdx,
      updatedStatus:
        status === null
          ? null
          : known(status, TRANSFER_STATUSES, 'transfer status'),
      failure,
    };
  });
}
export function publicRefresh(value: Refreshed[]): RefreshTransfersResult {
  return {
    transfers: Object.fromEntries(
      value.map((item) => [
        item.batchTransferIdx,
        {
          updatedStatus: item.updatedStatus ?? undefined,
          failure: item.failure ?? undefined,
        },
      ])
    ),
  };
}
