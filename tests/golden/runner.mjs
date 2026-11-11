/**
 * Golden cases (ADR-0002 step 0): every fixture sample goes into the fake
 * runtime as the result of its WasmWallet method; the matching public method
 * runs on the built engine. A case records the public result (or the error's
 * code, operation and message) and the runtime calls the method made, flush
 * included. Date.now is fixed to the capture time, so expiry checks are
 * stable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RgbLibWeb } from '../../dist/index.mjs';
import { KEYS, createFakeRuntime } from '../fake-rgb-lib-wasm.mjs';
import { copy } from '../fixtures/lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.resolve(
  here,
  '../fixtures/rgb-lib-wasm-1.0.0-beta.4'
);

const ONLINE = {
  indexerUrl: 'http://127.0.0.1:3002',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};
const ASSET = 'rgb:golden';

/** Loads every fixture module of the directory, by file name. */
export async function loadFixtures(dir = FIXTURES) {
  const mods = {};
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.endsWith('.mjs')) {
      mods[f.replace(/\.mjs$/, '')] = await import(
        pathToFileURL(path.join(dir, f)).href
      );
    }
  }
  return mods;
}

const first = (mods, method) => mods[method]?.samples?.[0]?.value;

/**
 * Per WasmWallet method: the public call, and the other runtime results it
 * needs (taken from the first captured sample of those methods).
 */
function plan(mods) {
  const blankInvoice = mods.invoiceData.samples.find(
    (s) => s.value.assetId === undefined && s.value.assignment === 'Any'
  )?.value;
  return {
    getAddress: { call: (e) => e.getAddress() },
    getBtcBalance: { call: (e) => e.getBtcBalance() },
    listUnspents: { call: (e) => e.listUnspents() },
    listTransactions: { call: (e) => e.listTransactions() },
    listTransfers: { call: (e) => e.listTransfers(ASSET) },
    listAssets: { call: (e) => e.listAssets() },
    getAssetBalance: { call: (e) => e.getAssetBalance(ASSET) },
    issueAssetNia: {
      call: (e) =>
        e.issueAssetNia({
          ticker: 'GLD',
          name: 'Golden',
          precision: 0,
          amounts: [1],
        }),
    },
    issueAssetIfa: {
      call: (e) =>
        e.issueAssetIfa({
          ticker: 'GLI',
          name: 'Golden IFA',
          precision: 0,
          amounts: [1],
          inflationAmounts: [1],
          rejectListUrl: null,
        }),
    },
    blindReceive: {
      call: (e) => e.blindReceive({ assetId: ASSET, amount: 1 }),
    },
    witnessReceive: {
      call: (e) => e.witnessReceive({ assetId: ASSET, amount: 1 }),
    },
    invoiceData: {
      invoice: true,
      call: (e) => e.decodeRGBInvoice({ invoice: 'rgb:golden-invoice' }),
    },
    refresh: { call: (e) => e.refresh() },
    getFeeEstimation: { call: (e) => e.estimateFeeRate(1) },
    failTransfers: { call: (e) => e.failTransfers({ batchTransferIdx: 1 }) },
    createUtxosEnd: {
      with: { createUtxosBegin: first(mods, 'createUtxosBegin') },
      call: (e) => e.createUtxos({ num: 1, feeRate: 1 }),
    },
    sendBtcEnd: {
      with: { sendBtcBegin: first(mods, 'sendBtcBegin') },
      call: (e) =>
        e.sendBtc({ address: 'bcrt1qgolden', amount: 1000, feeRate: 1 }),
    },
    inflateEnd: {
      with: { inflateBegin: first(mods, 'inflateBegin') },
      call: (e) =>
        e.inflate({ assetId: ASSET, inflationAmounts: [1], feeRate: 1 }),
    },
    sendEnd: {
      with: { sendBegin: first(mods, 'sendBegin') },
      invoiceValue: blankInvoice,
      call: (e) =>
        e.onchainSend({
          invoice: 'rgb:golden-invoice',
          assetId: ASSET,
          amount: 1,
          feeRate: 1,
        }),
    },
  };
}

/** Methods whose results only feed another method's case. */
export const INPUT_ONLY = new Set([
  'createUtxosBegin',
  'sendBtcBegin',
  'inflateBegin',
  'sendBegin',
]);

/** The list of cases: captured, handmade and negative samples. */
export function collectCases(mods) {
  const cases = [];
  const capturedAt = mods.getBtcBalance.meta.capturedAt;
  for (const [file, mod] of Object.entries(mods)) {
    if (['errors', 'handmade', 'negative'].includes(file)) continue;
    if (INPUT_ONLY.has(file)) continue;
    mod.samples.forEach((s, i) =>
      cases.push({
        name: `${file}[${i}] ${s.label}`,
        method: file,
        value: s.value,
        capturedAt,
      })
    );
  }
  for (const file of ['handmade', 'negative']) {
    for (const c of mods[file].cases) {
      cases.push({
        name: `${file}: ${c.method} — ${c.label}`,
        method: c.method,
        value: c.value,
        capturedAt,
        expect: c.expect,
        kind: c.kind,
        label: c.label,
      });
    }
  }
  return cases;
}

function outcome(error) {
  return {
    ok: false,
    code: error?.code,
    operation: error?.operation,
    message: error?.message,
  };
}

/** Runs one case; returns { result, calls }. */
export async function runCase(mods, c) {
  const p = plan(mods)[c.method];
  if (!p) throw new Error(`golden: no public call for ${c.method}`);
  const overrides = {
    ...Object.fromEntries(
      Object.entries(p.with ?? {}).map(([m, v]) => [m, () => copy(v)])
    ),
  };
  if (!p.invoice) {
    overrides[c.method] = () => copy(c.value);
  }
  const realNow = Date.now;
  Date.now = () => c.capturedAt;
  try {
    const runtime = createFakeRuntime({
      overrides,
      invoice: p.invoice ? copy(c.value) : copy(p.invoiceValue ?? null),
    });
    const engine = new RgbLibWeb({
      network: 'regtest',
      mnemonic: KEYS.mnemonic,
      runtime,
      // The golden calls are the operation's own; VSS uploads are tested apart.
      vssUrl: null,
      ...ONLINE,
    });
    await engine.init();
    await engine.unlock();
    const start = runtime.calls.length;
    let result;
    try {
      result = { ok: true, value: await p.call(engine) };
    } catch (error) {
      result = outcome(error);
    }
    const calls = runtime.calls.slice(start).map((x) => x.name);
    // A failing cleanup fails the case.
    await engine.destroy();
    return { result, calls };
  } finally {
    Date.now = realNow;
  }
}
