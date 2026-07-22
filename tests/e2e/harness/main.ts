/**
 * E2E harness page — exposes the BUILT rgb-sdk-web on `window.harness`.
 *
 * The specs (Node side) drive everything through three generic entry points;
 * every result crosses the page boundary as a JSON string in an
 * `{ ok, value | error }` envelope so failures carry their message instead of
 * dying in structured-clone.
 *
 *   boot(cfgJson)        — initRlnWasm → new UTEXOWallet → init() → unlock()
 *   call(path, argsJson) — invoke a wallet method; dot paths reach carriers
 *                          ('psbt.signPsbt', 'beginEnd.createUtxosBegin')
 *   get(path)            — read a property ('capabilities', 'vss')
 *   conformance()        — runConformanceChecks against the LIVE wallet with a
 *                          collector runner; closes the §6.0f createWallet gap
 */
import { UTEXOWallet, initRlnWasm, generateKeys } from '@utexo/rgb-sdk-web';
import { runConformanceChecks } from '@utexo/rgb-sdk-core/conformance';

let wallet: UTEXOWallet | null = null;
let bootMnemonic = '';

const statusEl = document.getElementById('status')!;

const enc = (v: unknown): string =>
  JSON.stringify(v ?? null, (_k, x) => (typeof x === 'bigint' ? Number(x) : x));

async function run(fn: () => unknown): Promise<string> {
  try {
    return enc({ ok: true, value: await fn() });
  } catch (e) {
    const error = e instanceof Error ? (e.stack ?? e.message) : String(e);
    return enc({ ok: false, error });
  }
}

interface BootConfig {
  gatewayWsUrl: string;
  transportUrl: string;
  indexerUrl: string;
  /** '/vss' (vite-proxied) to enable VSS, null to disable. */
  vssUrl: string | null;
  mnemonic?: string;
  password?: string;
  /** Restore in the init→unlock gap — the only window the wallet allows it. */
  restore?: boolean;
}

function live(): UTEXOWallet {
  if (!wallet) throw new Error('harness.boot() first');
  return wallet;
}

function resolvePath(path: string): { recv: unknown; last: string } {
  const segs = path.split('.');
  const recv = segs
    .slice(0, -1)
    .reduce<unknown>(
      (o, s) => (o as Record<string, unknown> | undefined)?.[s],
      live()
    );
  return { recv: segs.length > 1 ? recv : live(), last: segs[segs.length - 1] };
}

const harness = {
  ready: false,

  boot: (cfgJson: string) =>
    run(async () => {
      const cfg = JSON.parse(cfgJson) as BootConfig;
      // The wasm HTTP client needs an absolute URL — resolve the vite-proxied
      // '/vss' against the page origin (the demo's resolveVssUrl does the same).
      const vssUrl = cfg.vssUrl
        ? new URL(cfg.vssUrl, location.origin).toString()
        : null;
      await initRlnWasm();
      bootMnemonic = cfg.mnemonic ?? (await generateKeys('regtest')).mnemonic;
      // Fresh dataDir + nodeRuntimeId per boot: a full chain scan instead of a
      // stale checkpoint from a previous regtest run (same trick as the demo).
      const runId = Date.now().toString(16);
      wallet = new UTEXOWallet({
        network: 'regtest',
        mnemonic: bootMnemonic,
        password: cfg.password ?? 'e2e-password',
        proxyUrl: cfg.gatewayWsUrl,
        transportEndpoint: cfg.transportUrl,
        indexerUrl: cfg.indexerUrl,
        skipConsistencyCheck: true,
        dataDir: `/e2e_${runId}`,
        nodeRuntimeId: `e2e-${runId}`,
        vssUrl,
      });
      await wallet.init();
      const restored = cfg.restore ? await wallet.restoreFromVss() : null;
      await wallet.unlock();
      statusEl.textContent = `wallet booted (online=${wallet.isOnline()})`;
      return { mnemonic: bootMnemonic, online: wallet.isOnline(), restored };
    }),

  call: (path: string, argsJson: string) =>
    run(async () => {
      const args = JSON.parse(argsJson) as unknown[];
      const { recv, last } = resolvePath(path);
      const fn = (recv as Record<string, unknown> | undefined)?.[last];
      if (typeof fn !== 'function') {
        throw new Error(
          `harness.call: ${path} is not a function on the wallet`
        );
      }
      return await (fn as (...a: unknown[]) => unknown).apply(recv, args);
    }),

  get: (path: string) =>
    run(() => {
      const { recv, last } = resolvePath(path);
      return (recv as Record<string, unknown> | undefined)?.[last];
    }),

  conformance: () =>
    run(async () => {
      const w = live();
      const results: { test: string; ok: boolean; error?: string }[] = [];
      const stack: string[] = [];
      let chain = Promise.resolve();
      const describe = (name: string, fn: () => void) => {
        stack.push(name);
        fn();
        stack.pop();
      };
      // Tests are chained, not raced: they share one live wallet.
      const it = (name: string, fn: () => void | Promise<void>) => {
        const test = [...stack, name].join(' › ');
        chain = chain.then(async () => {
          try {
            await fn();
            results.push({ test, ok: true });
          } catch (e) {
            results.push({
              test,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        });
      };
      const expect = (actual: unknown) => ({
        toBe(expected: unknown) {
          if (actual !== expected) {
            throw new Error(
              `expected ${String(expected)}, got ${String(actual)}`
            );
          }
        },
        toContain(expected: unknown) {
          if (!Array.isArray(actual) || !actual.includes(expected)) {
            throw new Error(
              `expected array containing ${String(expected)}, got ${enc(actual)}`
            );
          }
        },
      });

      runConformanceChecks({
        name: 'rgb-sdk-web (live e2e wallet)',
        walletClass: UTEXOWallet,
        // The live, initialised wallet — this is the run §6.0f could not do.
        createWallet: async () => w as unknown as Record<string, unknown>,
        // Capability checks probe carrier methods with no args, which on a
        // live wallet could do real work (createUtxosBegin has all-optional
        // params) — so they get a fresh un-initialised instance instead.
        createWalletSync: () =>
          new UTEXOWallet({
            network: 'regtest',
            mnemonic: bootMnemonic,
            password: 'conformance-sync',
          }) as unknown as Record<string, unknown>,
        describe,
        it,
        expect,
      });
      await chain;
      return results;
    }),

  dispose: () => run(() => live().dispose()),
};

(window as unknown as { harness: typeof harness }).harness = harness;
harness.ready = true;
statusEl.textContent = 'harness ready';
