/**
 * E2E harness page: the BUILT engine (`dist/`) behind the `@utexo/rgb-sdk`
 * facade, over the real `@utexo/rgb-lib-wasm`, exposed on `window.harness`.
 * The page passes no runtime: `init()` loads the WASM from its default URL,
 * next to the bundle, as in an app.
 *
 *   boot(cfgJson)        — new RgbLibWeb → UTEXOWallet → init → unlock
 *   start(cfgJson)       — generateKeys → RgbLibWeb.create, no facade, no unlock
 *   call(method, args)   — call a wallet method
 *   get(property)        — read a wallet property ('capabilities')
 *
 * Results cross the page boundary as JSON `{ ok, value | error }`; an error
 * keeps `code` and `operation`, so specs can assert engine error codes.
 */
import { generateKeys } from '@utexo/rgb-sdk-core';
import { UTEXOWallet } from '@utexo/rgb-sdk';
import {
  RgbLibWeb,
  generateKeys as generateKeysFromPackage,
} from '../../../dist/index.mjs';

let wallet = null;
const statusEl = document.getElementById('status');

const enc = (v) =>
  JSON.stringify(v ?? null, (_k, x) =>
    typeof x === 'bigint' ? x.toString() : x
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
   * cfg: { indexerUrl, proxyEndpoint, mnemonic?, dataDir?, unlock? }.
   * A fresh dataDir per boot unless the spec passes one (persistence specs).
   */
  boot: (cfgJson) =>
    run(async () => {
      const cfg = JSON.parse(cfgJson);
      const mnemonic = cfg.mnemonic ?? (await generateKeys('regtest')).mnemonic;
      const dataDir = cfg.dataDir ?? `e2e-${Date.now().toString(16)}`;
      const engine = new RgbLibWeb({ network: 'regtest', dataDir, mnemonic });
      wallet = new UTEXOWallet({ engine });
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
   * engine used directly. cfg: { indexerUrl, proxyEndpoint, dataDir? }; on
   * regtest the connection settings must be in the config (no defaults).
   */
  start: (cfgJson) =>
    run(async () => {
      const cfg = JSON.parse(cfgJson);
      const keys = await generateKeysFromPackage('regtest');
      const dataDir = cfg.dataDir ?? `e2e-${Date.now().toString(16)}`;
      wallet = await RgbLibWeb.create({
        network: 'regtest',
        mnemonic: keys.mnemonic,
        dataDir,
        indexerUrl: cfg.indexerUrl,
        proxyEndpoint: cfg.proxyEndpoint,
      });
      statusEl.textContent = `wallet started (${dataDir})`;
      return { mnemonic: keys.mnemonic, dataDir, keys };
    }),

  call: (method, argsJson) =>
    run(async () => {
      const w = live();
      const fn = w[method];
      if (typeof fn !== 'function') {
        throw new Error(`harness.call: ${method} is not a wallet method`);
      }
      return await fn.apply(w, JSON.parse(argsJson));
    }),

  get: (property) => run(() => live()[property]),
};

window.harness.ready = true;
statusEl.textContent = 'harness ready';
