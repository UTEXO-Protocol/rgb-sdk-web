/**
 * Spec-side driver for the harness page. All traffic is JSON strings in an
 * `{ ok, value | error }` envelope (see harness/main.ts).
 */
import type { Page } from '@playwright/test';
import { gatewayFund, type WebFixtures } from './fixtures';

interface Envelope<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

function unwrap<T>(json: string, what: string): T {
  const env = JSON.parse(json) as Envelope<T>;
  if (!env.ok) throw new Error(`${what} failed in page:\n${env.error}`);
  return env.value as T;
}

export interface BootResult {
  mnemonic: string;
  online: boolean;
  restored: { walletRestored: boolean; serverVersion: number | null } | null;
}

/** Pipe browser console + page errors into the test output. */
export function wirePageLogging(page: Page): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[page:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));
}

export async function bootWallet(
  page: Page,
  f: WebFixtures,
  opts: { vss?: boolean; mnemonic?: string; restore?: boolean } = {}
): Promise<BootResult> {
  await page.goto('/');
  // First load transforms dist + compiles wasm — allow generous time.
  await page.waitForFunction(
    () =>
      (window as unknown as { harness?: { ready?: boolean } }).harness
        ?.ready === true,
    undefined,
    { timeout: 120_000 }
  );
  if (opts.vss && !f.VSS_URL) {
    throw new Error(
      'bootWallet({ vss: true }) but the fixture has no VSS_URL — start the stack with VSS=1'
    );
  }
  const cfg = {
    gatewayWsUrl: f.GATEWAY_WS_URL,
    transportUrl: f.TRANSPORT_URL,
    indexerUrl: f.INDEXER_URL,
    // vss-server has no CORS; the harness vite config proxies /vss → :8081.
    vssUrl: opts.vss ? '/vss' : null,
    mnemonic: opts.mnemonic,
    restore: opts.restore ?? false,
  };
  const res = await page.evaluate(
    (cfgJson) =>
      (
        window as unknown as {
          harness: { boot: (c: string) => Promise<string> };
        }
      ).harness.boot(cfgJson),
    JSON.stringify(cfg)
  );
  return unwrap<BootResult>(res, 'boot');
}

/** Call a wallet method in the page; dot paths reach carriers. */
export async function wcall<T>(
  page: Page,
  path: string,
  ...args: unknown[]
): Promise<T> {
  const res = await page.evaluate(
    ([p, argsJson]) =>
      (
        window as unknown as {
          harness: { call: (p: string, a: string) => Promise<string> };
        }
      ).harness.call(p, argsJson),
    [path, JSON.stringify(args)] as const
  );
  return unwrap<T>(res, path);
}

/** Read a wallet property in the page (e.g. 'capabilities'). */
export async function wget<T>(page: Page, path: string): Promise<T> {
  const res = await page.evaluate(
    (p) =>
      (
        window as unknown as {
          harness: { get: (p: string) => Promise<string> };
        }
      ).harness.get(p),
    path
  );
  return unwrap<T>(res, path);
}

export interface ConformanceResult {
  test: string;
  ok: boolean;
  error?: string;
}

export async function runPageConformance(
  page: Page
): Promise<ConformanceResult[]> {
  const res = await page.evaluate(() =>
    (
      window as unknown as { harness: { conformance: () => Promise<string> } }
    ).harness.conformance()
  );
  return unwrap<ConformanceResult[]>(res, 'conformance');
}

interface BalanceSide {
  settled: number;
  future: number;
  spendable: number;
}
export interface BtcBalanceShape {
  vanilla: BalanceSide;
  colored: BalanceSide;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sync-and-poll until the wallet's vanilla spendable reaches `minSpendable`. */
export async function waitForFunds(
  page: Page,
  minSpendable = 1,
  timeoutMs = 120_000
): Promise<BtcBalanceShape> {
  const t0 = Date.now();
  let last: BtcBalanceShape | undefined;
  for (;;) {
    await wcall(page, 'syncWallet');
    last = await wcall<BtcBalanceShape>(page, 'getBtcBalance');
    if ((last.vanilla?.spendable ?? 0) >= minSpendable) return last;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        `funds not visible after ${timeoutMs}ms (vanilla=${JSON.stringify(last.vanilla)})`
      );
    }
    await sleep(2000);
  }
}

interface UnspentShape {
  utxo: { colorable: boolean; exists: boolean };
}

/**
 * Sync-and-poll until the wallet sees ≥ `minColorable` colorable unspents.
 *
 * A single syncWallet right after mining is a race: esplora indexes the new
 * block asynchronously, so the wallet can fetch pre-mine state and later
 * build PSBTs on already-spent inputs (`bad-txns-inputs-missingorspent`).
 */
export async function waitForColorable(
  page: Page,
  minColorable: number,
  timeoutMs = 60_000
): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    await wcall(page, 'syncWallet');
    const unspents = await wcall<UnspentShape[]>(page, 'listUnspents');
    const colorable = unspents.filter((u) => u.utxo.colorable).length;
    if (colorable >= minColorable) return;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        `only ${colorable}/${minColorable} colorable unspents after ${timeoutMs}ms`
      );
    }
    await sleep(2000);
  }
}

/**
 * The standard on-chain setup shared by scenarios B/C/F: fund 1 BTC (mine 6),
 * wait until spendable, create colorable UTXOs, confirm them and wait until
 * the wallet actually sees them.
 */
export async function fundAndCreateUtxos(
  page: Page,
  f: WebFixtures,
  address: string,
  num = 5
): Promise<void> {
  await gatewayFund(f, address, 1, 6);
  await waitForFunds(page);
  await wcall(page, 'createUtxos', { upTo: false, num, feeRate: 7 });
  // Confirm the utxo tx (tiny top-up + 1 block)…
  await gatewayFund(f, address, 0.001, 1);
  // …and wait until the wallet's view includes the confirmed outputs.
  await waitForColorable(page, num);
}

/** Retry an async fn until it stops throwing (node runtime spin-up etc.). */
export async function retry<T>(
  fn: () => Promise<T>,
  timeoutMs = 60_000,
  everyMs = 2000
): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (Date.now() - t0 > timeoutMs) throw e;
      await sleep(everyMs);
    }
  }
}
