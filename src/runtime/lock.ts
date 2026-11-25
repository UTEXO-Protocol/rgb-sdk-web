/**
 * One open wallet per browser profile: an exclusive Web Lock on the wallet's
 * IndexedDB snapshot, held from open to close. A second open of the same
 * wallet (another tab, or another instance in this page) fails at once with
 * `WALLET_STORAGE_IN_USE`, the code React Native gives for a wallet directory
 * that is already open. rgb-lib-wasm leaves this to the SDK (rgb-lib-wasm#193,
 * reverted in #204); its own stale-write check then only fails the later save.
 *
 * Where the Web Locks API is missing (an old browser, Node before 22) the
 * wallet opens without the lock. The lock is a guard against mistakes, not a
 * security boundary: any script of the origin can hold it.
 *
 * Called by: `session.ts` (open, close). Depends on: `errors.ts`.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { RgbLibWebError } from '../errors.js';

/** Releases the lock; idempotent. */
export type WalletLease = () => void;

interface LockManagerLike {
  request(
    name: string,
    options: { mode?: 'exclusive'; ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<void> | void
  ): Promise<unknown>;
}

function lockManager(): LockManagerLike | undefined {
  const locks = (globalThis as { navigator?: { locks?: LockManagerLike } })
    .navigator?.locks;
  return typeof locks?.request === 'function' ? locks : undefined;
}

/**
 * The lock name: a hash of the snapshot's key, so `navigator.locks.query()`
 * does not list the data directory. The key holds the master fingerprint in
 * IndexedDB already, so the name exposes nothing the origin cannot read.
 */
export function walletLockName(
  dataDir: string,
  masterFingerprint: string,
  network: string
): string {
  const key = `${dataDir}/${masterFingerprint.toLowerCase()}/${network}`;
  return `@utexo/rgb-sdk-web:wallet:${bytesToHex(sha256(utf8ToBytes(key)))}`;
}

/**
 * Takes the lock without waiting. Rejects with `WALLET_STORAGE_IN_USE` when
 * it is held; resolves with a no-op lease when Web Locks are not available.
 * Never steals: a forced take-over is the app's decision.
 */
export function acquireWalletLock(name: string): Promise<WalletLease> {
  const locks = lockManager();
  if (!locks) return Promise.resolve(() => undefined);
  return new Promise<WalletLease>((resolve, reject) => {
    let release!: () => void;
    const held = new Promise<void>((done) => {
      release = done;
    });
    locks
      .request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
        if (!lock) {
          reject(
            new RgbLibWebError(
              'WALLET_STORAGE_IN_USE',
              'This wallet is already open in another tab or instance; destroy it there first'
            )
          );
          return;
        }
        resolve(release);
        return held;
      })
      .catch(reject);
  });
}
