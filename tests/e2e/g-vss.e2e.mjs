/**
 * Scenario G — VSS backup and restore against a real VSS server (ADR-0003
 * B4). The local server (lightningdevkit/vss-server, sigs auth) listens on
 * RGB_E2E_VSS_PORT (default 8181); the e2e server proxies `/vss/*` to it,
 * because it sends no CORS headers. Skipped when the server is not up.
 *
 *   docker start rgb-lightning-node-8777d71-vss-postgres-1 \
 *                rgb-lightning-node-8777d71-vss-server-1
 */
import { test, expect } from '@playwright/test';
import { report } from '@utexo/rgb-sdk-core/conformance';
import {
  bootWallet,
  fundAndCreateUtxos,
  wcall,
  wcallError,
  wirePageLogging,
} from './client.mjs';

const VSS_PORT = Number(process.env.RGB_E2E_VSS_PORT ?? 8181);
const PAGE_PORT = Number(process.env.RGB_E2E_PORT ?? 5180);
/** Same origin as the page: the e2e server proxies it. */
const VSS_URL = `http://127.0.0.1:${PAGE_PORT}/vss`;

/** A sigs-auth VSS server answers 401 to a call without a token. */
async function vssUp() {
  try {
    const res = await fetch(`http://127.0.0.1:${VSS_PORT}/vss/getObject`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    return res.status === 401;
  } catch {
    return false;
  }
}

/** Everything a restore must bring back, read without a connection. */
async function walletState(page, assetId) {
  return {
    assets: (await wcall(page, 'listAssets')).nia.map((a) => a.assetId),
    balance: await wcall(page, 'getAssetBalance', assetId),
    btc: await wcall(page, 'getBtcBalance', { skipSync: true }),
    unspents: (await wcall(page, 'listUnspents', { skipSync: true })).length,
    transfers: (await wcall(page, 'listTransfers', assetId)).length,
  };
}

/** A funded wallet with one issued asset, backed up to the server. */
async function backedUpWallet(page, ticker) {
  const boot = await bootWallet(page, { vssUrl: VSS_URL });
  await fundAndCreateUtxos(page, 3);
  const { assetId } = await wcall(page, 'issueAssetNia', {
    ticker,
    name: `E2E ${ticker}`,
    precision: 0,
    amounts: [55],
  });
  // The automatic uploads already ran; this is an explicit checkpoint.
  const version = await wcall(page, 'backupNow');
  expect(Number.isSafeInteger(version) && version > 0).toBe(true);
  return { ...boot, assetId, version };
}

test.beforeEach(async () => {
  test.skip(!(await vssUp()), `no VSS server on 127.0.0.1:${VSS_PORT}`);
});

test('G: a wallet backed up to VSS restores into an empty profile', async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const fresh = await browser.newContext();
  try {
    const page = await ctx.newPage();
    wirePageLogging(page);
    const source = await backedUpWallet(page, 'E2EV');
    const before = await walletState(page, source.assetId);
    await wcall(page, 'destroy');

    // New device: same mnemonic, empty profile, restore before connecting.
    const other = await fresh.newPage();
    wirePageLogging(other);
    await bootWallet(other, {
      mnemonic: source.mnemonic,
      dataDir: source.dataDir,
      vssUrl: VSS_URL,
      unlock: false,
    });
    expect((await wcall(other, 'listAssets')).nia.length).toBe(0);
    await wcall(other, 'engine.restoreFromVss');
    const after = await walletState(other, source.assetId);
    report('restored from VSS', after);
    expect(after).toEqual(before);

    // Saved: a reload of the new profile still has it, and it connects.
    await wcall(other, 'destroy');
    await other.reload();
    await bootWallet(other, {
      mnemonic: source.mnemonic,
      dataDir: source.dataDir,
      vssUrl: VSS_URL,
    });
    expect(
      (await wcall(other, 'getAssetBalance', source.assetId)).settled
    ).toBe(55);
    const late = await wcallError(other, 'engine.restoreFromVss');
    expect(late.code).toBe('WALLET_INVALID_STATE');
    await wcall(other, 'destroy');
  } finally {
    await ctx.close();
    await fresh.close();
  }
});

test('G: a new device that skips the restore does not overwrite the server copy', async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  try {
    const a = await ctxA.newPage();
    wirePageLogging(a);
    const source = await backedUpWallet(a, 'E2EH');
    await wcall(a, 'destroy');

    // Device B: same mnemonic, no restore, connects and mutates.
    const b = await ctxB.newPage();
    wirePageLogging(b);
    const warnings = [];
    b.on('console', (m) => {
      if (m.type() === 'warning') warnings.push(m.text());
    });
    await bootWallet(b, { mnemonic: source.mnemonic, vssUrl: VSS_URL });
    // A mutation that queues an automatic upload; B has no RGB state, so an
    // upload would replace A's asset with nothing.
    await wcall(b, 'refreshWallet');
    // destroy() waits for any queued upload, so a held one would show here.
    await wcall(b, 'destroy');
    expect(warnings.some((w) => w.includes('was not restored'))).toBe(true);

    // Device C restores: it gets A's state, not B's.
    const c = await ctxC.newPage();
    wirePageLogging(c);
    await bootWallet(c, {
      mnemonic: source.mnemonic,
      vssUrl: VSS_URL,
      unlock: false,
    });
    await wcall(c, 'engine.restoreFromVss');
    const restored = await wcall(c, 'listAssets');
    expect(restored.nia.map((x) => x.assetId)).toEqual([source.assetId]);
    await wcall(c, 'destroy');
  } finally {
    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  }
});
