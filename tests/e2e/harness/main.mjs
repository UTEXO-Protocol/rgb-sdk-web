/**
 * E2E harness page: the BUILT engine (`dist/`) over the real
 * `@utexo/rgb-lib-wasm`, exposed on `window.harness`.
 * The page passes no runtime: `init()` loads the WASM from its default URL,
 * next to the bundle, as in an app.
 *
 *   boot(cfgJson)        — new RgbLibWeb → init → unlock
 *   start(cfgJson)       — generateKeys → RgbLibWeb.create, no unlock
 *   boot({ capture: true }) records raw runtime values (capture.mjs);
 *   label(name) tags the next records; takeCapture() returns and clears them
 *   call(method, args)   — call a wallet method
 *   get(property)        — read a wallet property ('capabilities')
 *
 * Results cross the page boundary as JSON `{ ok, value | error }`; an error
 * keeps `code` and `operation`, so specs can assert engine error codes.
 */
import initRgbLibWasm, * as rgbLibWasm from '@utexo/rgb-lib-wasm';
import { LogLevel, generateKeys, logger } from '@utexo/rgb-sdk-core';
import { recordingRuntime } from './capture.mjs';
import {
  RgbLibWeb,
  generateKeys as generateKeysFromPackage,
} from '../../../dist/index.mjs';

// The core logger prints only errors by default; the VSS specs read warnings.
logger.setLevel(LogLevel.WARN);

let wallet = null;
let captureLabel = 'unlabeled';
const captured = [];
const statusEl = document.getElementById('status');

// Bytes cross the page boundary as { $bytes: [...] }, both ways.
const enc = (v) =>
  JSON.stringify(v ?? null, (_k, x) =>
    typeof x === 'bigint'
      ? x.toString()
      : x instanceof Uint8Array
        ? { $bytes: Array.from(x) }
        : x
  );
const dec = (json) =>
  JSON.parse(json, (_k, x) =>
    Array.isArray(x?.$bytes) ? Uint8Array.from(x.$bytes) : x
  );

async function run(fn) {
  try {
    return enc({ ok: true, value: await fn() });
  } catch (e) {
    return enc({
      ok: false,
      error: {
        name: e?.name,
        code: e?.code,
        operation: e?.operation,
        message: e?.message ?? String(e),
        cause: e?.cause?.message,
      },
    });
  }
}

function live() {
  if (!wallet) throw new Error('harness.boot() first');
  return wallet;
}

window.harness = {
  ready: false,

  /**
   * cfg: { indexerUrl, proxyEndpoint, mnemonic?, dataDir?, unlock?, vssUrl? }.
   * A fresh dataDir per boot unless the spec passes one (persistence specs).
   */
  boot: (cfgJson) =>
    run(async () => {
      const cfg = JSON.parse(cfgJson);
      const mnemonic = cfg.mnemonic ?? (await generateKeys('regtest')).mnemonic;
      const dataDir = cfg.dataDir ?? `e2e-${Date.now().toString(16)}`;
      let runtime;
      if (cfg.capture) {
        // The same module the package loads; init() is a no-op once loaded.
        await initRgbLibWasm();
        runtime = recordingRuntime(rgbLibWasm, (r) =>
          captured.push({ label: captureLabel, ...r })
        );
      }
      wallet = new RgbLibWeb({
        network: 'regtest',
        dataDir,
        mnemonic,
        // The stand has no VSS server: off unless the spec sets one.
        vssUrl: cfg.vssUrl ?? null,
        ...(runtime ? { runtime } : {}),
      });
      await wallet.init();
      if (cfg.unlock !== false) {
        await wallet.unlock({
          indexerUrl: cfg.indexerUrl,
          proxyEndpoint: cfg.proxyEndpoint,
        });
      }
      statusEl.textContent = `wallet booted (${dataDir})`;
      return { mnemonic, dataDir };
    }),

  /**
   * The README quick start: keys from the package, one create() call, the
   * engine used directly. cfg: { indexerUrl, proxyEndpoint, mnemonic?, dataDir? }; on
   * regtest the connection settings must be in the config (no defaults).
   */
  start: (cfgJson) =>
    run(async () => {
      const cfg = JSON.parse(cfgJson);
      const keys = cfg.mnemonic
        ? { mnemonic: cfg.mnemonic }
        : await generateKeysFromPackage('regtest');
      // No dataDir unless the spec passes one: the default config, as in an app.
      wallet = await RgbLibWeb.create({
        network: 'regtest',
        mnemonic: keys.mnemonic,
        ...(cfg.dataDir ? { dataDir: cfg.dataDir } : {}),
        indexerUrl: cfg.indexerUrl,
        proxyEndpoint: cfg.proxyEndpoint,
        vssUrl: cfg.vssUrl ?? null,
      });
      statusEl.textContent = 'wallet started';
      return { mnemonic: keys.mnemonic, keys };
    }),

  label: (name) => {
    captureLabel = name;
  },
  takeCapture: () => JSON.stringify(captured.splice(0)),

  call: (method, argsJson) =>
    run(async () => {
      const w = live();
      const fn = w[method];
      if (typeof fn !== 'function') {
        throw new Error(`harness.call: ${method} is not a wallet method`);
      }
      return await fn.apply(w, dec(argsJson));
    }),

  get: (property) => run(() => live()[property]),
};

window.harness.ready = true;
statusEl.textContent = 'harness ready';
