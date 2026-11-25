// Loaded by `npm run test:unit` (--import). The unit tests open many wallets
// with the same keys in one process and do not always destroy them, so the
// Web Lock of the engine is off here. tests/unit/lock.test.mjs turns it back
// on with REAL_LOCKS, or with its own LockManager where Node has none.
export const REAL_LOCKS = Symbol.for('rgb-sdk-web.tests.realLocks');
const nav = globalThis.navigator;
if (nav && 'locks' in nav) {
  globalThis[REAL_LOCKS] = nav.locks;
  Object.defineProperty(nav, 'locks', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}
