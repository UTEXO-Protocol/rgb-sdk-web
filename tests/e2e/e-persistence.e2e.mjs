/**
 * Scenario E — persistence in the browser: the wallet state lives in
 * IndexedDB under (dataDir, fingerprint, network). Reopening the same wallet
 * in the same browser profile sees its assets and UTXOs; the same mnemonic in
 * an empty profile does not, until it restores a byte backup
 * (`exportBackup()` / `restoreBackup()`, ADR-0003 B3).
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
import { STAND } from './stand.mjs';

test('E: state survives destroy and a page reload; an empty profile starts empty', async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const fresh = await browser.newContext();
  try {
    const page = await ctx.newPage();
    wirePageLogging(page);
    const boot = await bootWallet(page);
    await fundAndCreateUtxos(page, 3);
    const { assetId } = await wcall(page, 'issueAssetNia', {
      ticker: 'E2EP',
      name: 'E2E Persisted',
      precision: 0,
      amounts: [42],
    });
    const lastAddress = await wcall(page, 'getAddress');
    await wcall(page, 'destroy');

    // Same profile: reload the page, open the same wallet.
    await page.reload();
    await bootWallet(page, {
      mnemonic: boot.mnemonic,
      dataDir: boot.dataDir,
      unlock: false,
    });
    const assets = await wcall(page, 'listAssets');
    report('reopened: listAssets', assets);
    expect((assets.nia ?? []).map((a) => a.assetId)).toContain(assetId);
    expect((await wcall(page, 'getAssetBalance', assetId)).settled).toBe(42);
    const unspents = await wcall(page, 'listUnspents', { skipSync: true });
    expect(
      unspents.filter((u) => u.utxo.colorable).length
    ).toBeGreaterThanOrEqual(3);
    // The address index was persisted too: no address is handed out twice.
    expect(await wcall(page, 'getAddress')).not.toBe(lastAddress);
    await wcall(page, 'destroy');

    // Empty profile, same mnemonic and dataDir: nothing local to read.
    const other = await fresh.newPage();
    wirePageLogging(other);
    await bootWallet(other, {
      mnemonic: boot.mnemonic,
      dataDir: boot.dataDir,
      unlock: false,
    });
    const empty = await wcall(other, 'listAssets');
    report('empty profile: listAssets', empty);
    expect((empty.nia ?? []).length).toBe(0);
  } finally {
    await ctx.close();
    await fresh.close();
  }
});

test('E: a byte backup restores the wallet into an empty profile', async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const fresh = await browser.newContext();
  try {
    const page = await ctx.newPage();
    wirePageLogging(page);
    const boot = await bootWallet(page);
    await fundAndCreateUtxos(page, 3);
    const { assetId } = await wcall(page, 'issueAssetNia', {
      ticker: 'E2EB',
      name: 'E2E Backup',
      precision: 0,
      amounts: [77],
    });
    const before = {
      assets: (await wcall(page, 'listAssets')).nia.map((a) => a.assetId),
      balance: await wcall(page, 'getAssetBalance', assetId),
      btc: await wcall(page, 'getBtcBalance', { skipSync: true }),
      unspents: (await wcall(page, 'listUnspents', { skipSync: true })).length,
      transfers: (await wcall(page, 'listTransfers', assetId)).length,
    };
    // Through the UTEXOWallet facade, which forwards BackupBytesApi.
    const backup = await wcall(page, 'exportBackup', { password: 'e2e-pw' });
    expect(backup.$bytes.length).toBeGreaterThan(0);
    await wcall(page, 'destroy');

    // Empty profile, same mnemonic: restore before the first connection.
    const other = await fresh.newPage();
    wirePageLogging(other);
    await bootWallet(other, {
      mnemonic: boot.mnemonic,
      dataDir: boot.dataDir,
      unlock: false,
    });
    const wrong = await wcallError(other, 'restoreBackup', {
      bytes: backup,
      password: 'not-it',
    });
    expect(wrong.code).toBe('NATIVE_ERROR');
    expect(JSON.stringify(wrong)).not.toContain('not-it');
    const broken = await wcallError(other, 'restoreBackup', {
      bytes: { $bytes: [1, 2, 3] },
      password: 'e2e-pw',
    });
    expect(broken.code).toBe('INVALID_PARAMS');
    // The failed attempts changed nothing: the wallet is still empty.
    expect((await wcall(other, 'listAssets')).nia.length).toBe(0);

    await wcall(other, 'restoreBackup', { bytes: backup, password: 'e2e-pw' });
    const after = {
      assets: (await wcall(other, 'listAssets')).nia.map((a) => a.assetId),
      balance: await wcall(other, 'getAssetBalance', assetId),
      btc: await wcall(other, 'getBtcBalance', { skipSync: true }),
      unspents: (await wcall(other, 'listUnspents', { skipSync: true })).length,
      transfers: (await wcall(other, 'listTransfers', assetId)).length,
    };
    report('restored from bytes', after);
    expect(after).toEqual(before);
    // Now it has local data: a second restore needs overwrite.
    const again = await wcallError(other, 'restoreBackup', {
      bytes: backup,
      password: 'e2e-pw',
    });
    expect(again.code).toBe('WALLET_INVALID_STATE');
    await wcall(other, 'destroy');

    // The restore was saved: a reload of the new profile still has it.
    await other.reload();
    await bootWallet(other, {
      mnemonic: boot.mnemonic,
      dataDir: boot.dataDir,
      unlock: false,
    });
    expect((await wcall(other, 'getAssetBalance', assetId)).settled).toBe(77);
    // After the connection the restore window is closed.
    await wcall(other, 'unlock', {
      indexerUrl: STAND.indexerUrl,
      proxyEndpoint: STAND.proxyEndpoint,
    });
    expect((await wcall(other, 'getAssetBalance', assetId)).settled).toBe(77);
    const late = await wcallError(other, 'restoreBackup', {
      bytes: backup,
      password: 'e2e-pw',
      overwrite: true,
    });
    expect(late.code).toBe('WALLET_INVALID_STATE');
    await wcall(other, 'destroy');
  } finally {
    await ctx.close();
    await fresh.close();
  }
});
