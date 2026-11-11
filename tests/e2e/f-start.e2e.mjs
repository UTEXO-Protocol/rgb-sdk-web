/**
 * Scenario F — the one-call start from the README: generateKeys from the
 * package, RgbLibWeb.create(), no facade, no runtime, no unlock(). The first
 * network operation connects with the config's connection settings.
 */
import { test, expect } from '@playwright/test';
import { fund } from './stand.mjs';
import { startWallet, wcall, wget, wirePageLogging } from './client.mjs';

test('F: generateKeys + RgbLibWeb.create(), then address and balance', async ({
  page,
}) => {
  wirePageLogging(page);
  const started = await startWallet(page);
  expect(started.mnemonic.split(' ').length).toBe(12);
  expect(started.keys.accountXpubVanilla.startsWith('tpub')).toBe(true);

  // create() opened the wallet: no init() or unlock() before these calls.
  const id = await wcall(page, 'getWalletIdentity');
  expect(id.network).toBe('regtest');
  expect(await wget(page, 'capabilities')).toEqual({
    psbtSigning: false,
    beginEndFlows: false,
    canSignTransactions: true,
  });

  const address = await wcall(page, 'getAddress');
  expect(address.startsWith('bcrt1p')).toBe(true);
  expect((await wcall(page, 'getBtcBalance')).vanilla.settled).toBe(0);

  await fund(address);
  expect((await wcall(page, 'getBtcBalance')).vanilla.settled).toBe(
    100_000_000
  );
  await wcall(page, 'destroy');
});

test('F: the default config persists to IndexedDB across a reload', async ({
  page,
}) => {
  wirePageLogging(page);
  // No dataDir: the default ':memory:' is only a key prefix.
  const { mnemonic } = await startWallet(page);
  const first = await wcall(page, 'getAddress');
  await wcall(page, 'destroy');

  await startWallet(page, { mnemonic }); // reloads the page
  const next = await wcall(page, 'getAddress');
  // A fresh wallet would return the first address again; this one resumes.
  expect(next).not.toBe(first);
  await wcall(page, 'destroy');
});

test('F: create() rejects an Electrum indexer before opening', async ({
  page,
}) => {
  wirePageLogging(page);
  await page.goto('/');
  await page.waitForFunction(() => window.harness?.ready === true);
  const res = await page.evaluate(() =>
    window.harness.start(JSON.stringify({ indexerUrl: 'ssl://x:50002' }))
  );
  const env = JSON.parse(res);
  expect(env.ok).toBe(false);
  expect(env.error.code).toBe('UNSUPPORTED_CAPABILITY');
});
