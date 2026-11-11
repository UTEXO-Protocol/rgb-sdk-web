// Handmade negative samples (ADR-0002 step 0): malformed or boundary values
// built from captured samples. `expect` says what a strict decoder must do;
// the golden file records what the current code does, so a known defect
// shows as a difference between the two (fixed in ADR-0002 step 1).
import * as getBtcBalance from './getBtcBalance.mjs';
import * as getFeeEstimation from './getFeeEstimation.mjs';
import * as invoiceData from './invoiceData.mjs';
import * as listAssets from './listAssets.mjs';
import * as listTransactions from './listTransactions.mjs';
import * as listTransfers from './listTransfers.mjs';
import * as listUnspents from './listUnspents.mjs';
import { I64_MIN, SAFE_LIMIT, U64_MAX, sample, variant } from '../lib.mjs';

export const meta = {
  runtime: '@utexo/rgb-lib-wasm',
  version: '1.0.0-beta.4',
  source: 'handmade',
  rustCommit: 'f0e266f039744896baa39e3a35766ef01c0f369a', // tag v1.0.0-beta.4
};

const balance = sample(getBtcBalance, 'sender: funded, colorable UTXOs');
const assets = sample(listAssets, 'sender: with NIA and IFA');
const unspents = sample(listUnspents, 'sender: with NIA and IFA');
const transfers = sample(listTransfers, 'sender: settled sends');
const transactions = sample(
  listTransactions,
  'sender: funded, colorable UTXOs'
);
const fee = sample(getFeeEstimation, 'sender: empty wallet');
const invoice = sample(invoiceData, 'sender: decode named invoice');

const settled = (value) => (v) => {
  v.vanilla.settled = value;
};

export const cases = [
  // ── missing required fields ────────────────────────────────────────────
  {
    method: 'listAssets',
    label: 'NIA without assetId',
    kind: 'missing-field',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(assets, (v) => delete v.nia[0].assetId),
  },
  {
    method: 'getBtcBalance',
    label: 'balance without colored',
    kind: 'missing-field',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(balance, (v) => delete v.colored),
  },
  // ── wrong containers ───────────────────────────────────────────────────
  {
    method: 'listAssets',
    label: 'Assets as a Map',
    kind: 'wrong-container',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: new Map(Object.entries(assets)),
  },
  {
    method: 'listUnspents',
    label: 'unspents as an object',
    kind: 'wrong-container',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: { ...unspents },
  },
  {
    method: 'refresh',
    label: 'refresh result as a plain object',
    kind: 'wrong-container',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: { 1: { updatedStatus: 'Settled', failure: undefined } },
  },
  // ── unknown enum variants and keys ─────────────────────────────────────
  {
    method: 'listTransfers',
    label: 'unknown transfer status',
    kind: 'unknown-variant',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(transfers, (v) => {
      v[0].status = 'Exploded';
    }),
  },
  {
    method: 'listTransfers',
    label: 'unknown assignment variant',
    kind: 'unknown-variant',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(transfers, (v) => {
      v[0].assignments = [{ Mystery: 1n }];
    }),
  },
  {
    method: 'listTransactions',
    label: 'unknown transaction type',
    kind: 'unknown-variant',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(transactions, (v) => {
      v[0].transactionType = 'Teleport';
    }),
  },
  {
    method: 'getBtcBalance',
    label: 'unknown extra key',
    kind: 'unknown-key',
    expect: 'ok (ignored at runtime)',
    value: variant(balance, (v) => {
      v.vanilla.futureField = 1n;
    }),
  },
  // ── scalars and boundaries ─────────────────────────────────────────────
  {
    method: 'getBtcBalance',
    label: 'settled = 2^53 - 1 (largest safe)',
    kind: 'boundary',
    expect: 'ok',
    value: variant(balance, settled(SAFE_LIMIT - 1n)),
  },
  {
    method: 'getBtcBalance',
    label: 'settled = 2^53',
    kind: 'boundary',
    expect: 'AMOUNT_OVERFLOW',
    value: variant(balance, settled(SAFE_LIMIT)),
  },
  {
    method: 'getBtcBalance',
    label: 'settled = u64::MAX',
    kind: 'boundary',
    expect: 'AMOUNT_OVERFLOW',
    value: variant(balance, settled(U64_MAX)),
  },
  {
    method: 'getBtcBalance',
    label: 'settled = u64::MAX + 1',
    kind: 'boundary',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(balance, settled(U64_MAX + 1n)),
  },
  {
    method: 'getBtcBalance',
    label: 'settled negative',
    kind: 'boundary',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(balance, settled(-1n)),
  },
  {
    method: 'getBtcBalance',
    label: 'settled as a decimal string',
    kind: 'wrong-type',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(balance, settled('100000000')),
  },
  {
    method: 'listAssets',
    label: 'negative i64 timestamp (valid)',
    kind: 'boundary',
    expect: 'ok',
    value: variant(assets, (v) => {
      v.nia[0].timestamp = -1n;
    }),
  },
  {
    method: 'listAssets',
    label: 'timestamp below i64::MIN',
    kind: 'boundary',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(assets, (v) => {
      v.nia[0].timestamp = I64_MIN - 1n;
    }),
  },
  {
    method: 'listTransfers',
    label: 'idx not an integer',
    kind: 'wrong-type',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(transfers, (v) => {
      v[0].idx = 1.5;
    }),
  },
  {
    method: 'getFeeEstimation',
    label: 'fee rate NaN',
    kind: 'wrong-type',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: Number.NaN,
  },
  {
    method: 'getFeeEstimation',
    label: 'fee rate Infinity',
    kind: 'wrong-type',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: Number.POSITIVE_INFINITY,
  },
  {
    method: 'getFeeEstimation',
    label: 'captured fee rate as a string',
    kind: 'wrong-type',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: String(fee),
  },
  // ── Rust integer ranges (u8, u32, i32) ────────────────────────────────
  {
    method: 'listAssets',
    label: 'precision = 255 (u8::MAX)',
    kind: 'boundary',
    expect: 'ok',
    value: variant(assets, (v) => {
      v.nia[0].precision = 255;
    }),
  },
  {
    method: 'listAssets',
    label: 'precision = 256',
    kind: 'boundary',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(assets, (v) => {
      v.nia[0].precision = 256;
    }),
  },
  {
    method: 'listUnspents',
    label: 'vout = -1',
    kind: 'boundary',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(unspents, (v) => {
      v[0].utxo.outpoint.vout = -1;
    }),
  },
  {
    method: 'listUnspents',
    label: 'pending blinded = 2^32',
    kind: 'boundary',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(unspents, (v) => {
      v[0].pendingBlinded = 2 ** 32;
    }),
  },
  {
    method: 'refresh',
    label: 'refresh key = 2^31',
    kind: 'boundary',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: new Map([
      [2 ** 31, { updatedStatus: 'Settled', failure: undefined }],
    ]),
  },
  {
    method: 'refresh',
    label: 'refresh key = i32::MIN (valid)',
    kind: 'boundary',
    expect: 'ok',
    value: new Map([
      [-(2 ** 31), { updatedStatus: 'Settled', failure: undefined }],
    ]),
  },
  // ── containers ────────────────────────────────────────────────────────
  {
    method: 'invoiceData',
    label: 'unknownQueryParams as a Map',
    kind: 'wrong-container',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(invoice, (v) => {
      v.unknownQueryParams = new Map([['x', '1']]);
    }),
  },
  {
    method: 'refresh',
    label: 'nested failure u64 = 2^64',
    kind: 'boundary',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: new Map([
      [
        3,
        {
          updatedStatus: 'Failed',
          failure: {
            InsufficientBitcoins: { needed: 2n ** 64n, available: 0n },
          },
        },
      ],
    ]),
  },
  {
    method: 'invoiceData',
    label: 'invoice network "constructor"',
    kind: 'unknown-variant',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(invoice, (v) => {
      v.network = 'constructor';
    }),
  },
  {
    method: 'invoiceData',
    label: 'invoice network "__proto__"',
    kind: 'unknown-variant',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(invoice, (v) => {
      v.network = '__proto__';
    }),
  },
  {
    method: 'invoiceData',
    label: 'invoice network "toString"',
    kind: 'unknown-variant',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: variant(invoice, (v) => {
      v.network = 'toString';
    }),
  },
  {
    method: 'invoiceData',
    label: 'query params out of key order (valid)',
    kind: 'boundary',
    expect: 'ok',
    value: variant(invoice, (v) => {
      v.unknownQueryParams = { z: 'last', a: 'first' };
    }),
  },
  // ── refresh failures against the beta.4 Error enum ───────────────────
  {
    method: 'refresh',
    label: 'unknown failure variant',
    kind: 'unknown-variant',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: new Map([
      [4, { updatedStatus: 'Failed', failure: 'ImaginaryVariant' }],
    ]),
  },
  {
    method: 'refresh',
    label: 'struct failure variant without its fields',
    kind: 'wrong-type',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: new Map([
      [4, { updatedStatus: 'Failed', failure: 'InsufficientBitcoins' }],
    ]),
  },
  {
    method: 'refresh',
    label: 'unit failure variant with fields',
    kind: 'wrong-type',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: new Map([
      [
        4,
        {
          updatedStatus: 'Failed',
          failure: { NoValidTransportEndpoint: { x: 1 } },
        },
      ],
    ]),
  },
  {
    method: 'refresh',
    label: 'failure field of the wrong type',
    kind: 'wrong-type',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: new Map([
      [
        4,
        {
          updatedStatus: 'Failed',
          failure: { InsufficientBitcoins: { needed: '1', available: 0n } },
        },
      ],
    ]),
  },
  {
    method: 'refresh',
    label: 'failure field with an unknown AssetSchema',
    kind: 'unknown-variant',
    expect: 'INVALID_NATIVE_RESPONSE',
    value: new Map([
      [
        4,
        {
          updatedStatus: 'Failed',
          failure: { UnsupportedSchema: { asset_schema: 'ImaginarySchema' } },
        },
      ],
    ]),
  },
  {
    method: 'refresh',
    label: 'unknown field in AssignmentsCollection (ignored)',
    kind: 'unknown-key',
    expect: 'ok, without the unknown field',
    value: new Map([
      [
        4,
        {
          updatedStatus: 'Failed',
          failure: {
            InsufficientAssignments: {
              asset_id: 'rgb:handmade',
              available: {
                fungible: 1n,
                non_fungible: false,
                inflation: 0n,
                link: false,
                mint: 0n,
                newField: 9n,
              },
            },
          },
        },
      ],
    ]),
  },
  // ── nested error with BigInt ───────────────────────────────────────────
  {
    method: 'refresh',
    label: 'nested failure with BigInt details',
    kind: 'nested-error',
    expect: 'ok, with the nested values in the failure details',
    value: new Map([
      [
        3,
        {
          updatedStatus: 'Failed',
          failure: {
            InsufficientAssignments: {
              asset_id: 'rgb:handmade',
              available: {
                fungible: 2n ** 60n,
                non_fungible: false,
                inflation: 2n ** 63n + 1n,
                link: false,
                mint: 2n ** 64n - 1n,
              },
            },
          },
        },
      ],
    ]),
  },
];
