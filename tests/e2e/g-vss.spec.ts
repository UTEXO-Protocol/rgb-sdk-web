/**
 * Scenario G — VSS round-trip, web, requires VSS=1 (§7a.3). Prerequisite for
 * step 7: reshaping VSS without a proven restore would be changing backup
 * semantics blind.
 *
 * mutate → backup → mutate → backup → fresh wallet → restoreFromVss → state
 * equality.
 *
 * Both backup paths are exercised: the automatic one every mutation triggers
 * (observed through `vssBackupInfo`) and an explicit `backupNow()` alongside
 * it, which must queue rather than race the version.
 *
 * `configureVssBackup` is not called explicitly: `init()` runs it with the
 * config derived from the mnemonic, and every call below would fail with
 * "VSS is not configured" if it had not.
 *
 * For a real user this is the safety net behind "I still have my 12 words":
 *
 * ```ts
 * // Backups are configured from the mnemonic at init() — the storeId is
 * // derived, so the same seed always finds its own backup.
 * const wallet = new UTEXOWallet({
 *   network: 'utexo', mnemonic, password,
 *   vssUrl: DEFAULT_VSS_SERVER_URL,   // pass null to opt out entirely
 * });
 * await wallet.init();
 * await wallet.unlock();
 *
 * // Every state-changing call schedules a background upload. To be sure a
 * // particular moment is saved — before a risky step, or on app background:
 * await wallet.backupNow();
 * await wallet.vssBackupInfo();       // { exists, version, updatedAt }
 *
 * // On a new device, same seed. Restore is NEVER automatic, and the window
 * // for it is the gap between init() and unlock() — nowhere else:
 * const restored = new UTEXOWallet({ network: 'utexo', mnemonic, password,
 *                                    vssUrl: DEFAULT_VSS_SERVER_URL });
 * await restored.init();
 * await restored.restoreFromVss();    // ← here, or the backup is ignored
 * await restored.unlock();
 * ```
 *
 * Two things worth knowing before shipping this: unlocking without restoring
 * starts a *fresh* wallet on the same seed, which is how a backup gets silently
 * abandoned; and concurrent uploads race the server's version, which is why
 * `backupNow()` queues rather than firing immediately.
 */
import { test, expect, type Page } from '@playwright/test';
import { report, expectFields } from '@utexo/rgb-sdk-core/conformance';
import { loadFixtures, gatewayFund } from './fixtures';
import {
  bootWallet,
  wcall,
  fundAndCreateUtxos,
  waitForColorable,
  wirePageLogging,
} from './harness-client';

const f = loadFixtures();

interface AssetShape {
  assetId: string;
  ticker: string;
  issuedSupply: number;
}
interface ListAssets {
  nia?: AssetShape[];
}
interface BackupInfo {
  backupExists: boolean;
  backupRequired: boolean;
  serverVersion?: number | null;
}

const ids = (assets: ListAssets): string[] =>
  (assets.nia ?? []).map((a) => a.assetId).sort();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll until the server version passes `after` — auto-backup is async. */
async function waitForBackup(
  page: Page,
  after: number,
  timeoutMs = 60_000
): Promise<BackupInfo> {
  const t0 = Date.now();
  for (;;) {
    const info = await wcall<BackupInfo>(page, 'vssBackupInfo');
    if (info.backupExists && (info.serverVersion ?? -1) > after) return info;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        `backup version did not advance past ${after} in ${timeoutMs}ms (${JSON.stringify(info)})`
      );
    }
    await sleep(2000);
  }
}

test('G: backup, mutate, restore into a fresh wallet', async ({ page }) => {
  test.skip(!f.VSS_URL, 'stack started without VSS=1 — no VSS_URL in fixture');
  test.setTimeout(300_000);
  wirePageLogging(page);

  const boot = await bootWallet(page, f, { vss: true });
  const mnemonic = boot.mnemonic;

  const address = await wcall<string>(page, 'getAddress');
  await fundAndCreateUtxos(page, f, address, 3);

  const first = await wcall<Record<string, unknown>>(page, 'issueAssetNia', {
    ticker: 'GVS1',
    name: 'VSS Round Trip One',
    precision: 0,
    amounts: [500],
  });
  const firstId = first.assetId as string;

  const info1 = await waitForBackup(page, -1);
  report('vssBackupInfo (after first issuance)', info1);
  expectFields(info1, {
    backupExists: { type: 'boolean', oneOf: [true] },
    backupRequired: { type: 'boolean' },
    serverVersion: { type: 'number' },
  });
  const v1 = info1.serverVersion!;

  // Confirm the issuance and wait for the wallet's view to catch up: issuing
  // twice off a stale view makes rgb-lib pick a spent input and panic (§6.0l).
  await gatewayFund(f, address, 0.001, 1);
  await waitForColorable(page, 1);

  const second = await wcall<Record<string, unknown>>(page, 'issueAssetNia', {
    ticker: 'GVS2',
    name: 'VSS Round Trip Two',
    precision: 0,
    amounts: [750],
  });
  const secondId = second.assetId as string;

  const info2 = await waitForBackup(page, v1);
  report('vssBackupInfo (after second issuance)', info2);
  const v2 = info2.serverVersion!;
  expect(v2, 'a state change must advance the backup version').toBeGreaterThan(
    v1
  );

  // Explicit backup right after a mutation: it queues behind the automatic one
  // instead of racing it into a "VSS version conflict".
  const forced = await wcall<number>(page, 'backupNow');
  report('backupNow (explicit, after mutation)', forced);
  expect(forced).toBeGreaterThanOrEqual(v2);

  // Turning off the schedule must not turn off backup itself.
  await wcall(page, 'disableVssAutoBackup');
  const afterDisable = await wcall<number>(page, 'backupNow');
  report('backupNow (auto-backup disabled)', afterDisable);
  expect(afterDisable).toBeGreaterThanOrEqual(forced);

  const before = await wcall<ListAssets>(page, 'listAssets');
  expect(ids(before)).toEqual([firstId, secondId].sort());
  const balanceBefore = await wcall<Record<string, number>>(
    page,
    'getAssetBalance',
    firstId
  );

  await wcall(page, 'dispose');

  // Same mnemonic (same VSS store), fresh dataDir — so a restored asset cannot
  // be a survivor of local state.
  const restoredBoot = await bootWallet(page, f, {
    vss: true,
    mnemonic,
    restore: true,
  });
  report('restoreFromVss', restoredBoot.restored);
  expect(
    restoredBoot.restored,
    'boot must have run restoreFromVss'
  ).not.toBeNull();
  expect(restoredBoot.restored!.walletRestored).toBe(true);
  expect(restoredBoot.restored!.serverVersion).toBeGreaterThanOrEqual(v2);

  const after = await wcall<ListAssets>(page, 'listAssets');
  report('listAssets (restored)', ids(after));
  expect(
    ids(after),
    'the restored wallet must hold exactly the backed-up assets'
  ).toEqual(ids(before));

  const restoredFirst = (after.nia ?? []).find((a) => a.assetId === firstId)!;
  expect(restoredFirst.ticker).toBe('GVS1');
  expect(restoredFirst.issuedSupply).toBe(500);

  const balanceAfter = await wcall<Record<string, number>>(
    page,
    'getAssetBalance',
    firstId
  );
  report('getAssetBalance (restored)', balanceAfter);
  expect(balanceAfter.settled).toBe(balanceBefore.settled);

  const infoAfter = await wcall<BackupInfo>(page, 'vssBackupInfo');
  expect(infoAfter.backupExists).toBe(true);
  expect(infoAfter.serverVersion).toBeGreaterThanOrEqual(v2);

  // The channel stream is the other half of a restore: `restoreFromVss` takes
  // over the previous device's single-writer fence, so replication here must
  // not report the store as still owned elsewhere.
  const ldk = await wcall<{ configured?: boolean; lastError?: string } | null>(
    page,
    'ldkVssBackupInfo'
  );
  report('ldkVssBackupInfo (restored)', ldk);
  if (ldk) {
    expect(
      ldk.lastError ?? '',
      'the fence takeover must leave the channel stream writable'
    ).not.toMatch(/owned by another/i);
  }
});
