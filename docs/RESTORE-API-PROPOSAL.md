# Proposal: explicit one-call VSS restore (`rlnRestoreVSSBackup`)

> Status: **implemented** (2026-07-15) — kept as the design-rationale record;
> current behavior is documented in docs/VSS-BACKUP-RESTORE.md.
> Verified against the current wasm-sdk source
> (`bindings/wasm-sdk/src/sdk_facade.rs`, `ln_node.rs`, `ldk_runtime.rs`).
> **No changes to rgb-lightning-node are needed** — everything below is
> implementable in rgb-sdk-web alone.

## TL;DR

| | Today | Proposed |
|---|---|---|
| Wallet-stream backup | Automatic (per-op background `vssBackup()`) when VSS configured | **Unchanged** — automatic iff VSS is configured |
| LDK/channel backup | Automatic (continuous replication) when VSS configured | **Unchanged** |
| Wallet-stream restore | Automatic at `unlock()` (`vssAutoRestore: false` opts out) | **Explicit**: `await wallet.rlnRestoreVSSBackup()` in the init→unlock gap; `vssAutoRestore` param **removed** |
| LDK/channel restore | Automatic inside the unlock-time `configureLdkVssReplication` (guarded, fresh-store only) | **Unchanged** (see "why channels stay implicit") |
| Fence takeover | Separate `vssClearFence()` call | Optional: `rlnRestoreVSSBackup({ takeoverFence: true })` folds it in |
| Wallet creation | At `unlock()` | **Moved to `init()`** (makes the restore call direct — see below) |

Backup already follows from "VSS is configured" (both streams), so nothing
changes there. Restore becomes the one explicit user call.

## What the wasm actually gates (verified)

The key facts that make the design work:

1. **`RlnWasmWallet.create` has NO lifecycle check** (`sdk_facade.rs`) — it
   parses WalletData, builds the rgb-lib wallet, and loads the IndexedDB
   snapshot. It does not require `sdk.unlock`.
2. **The wallet-stream VSS calls have no lifecycle check either** —
   `configureVssBackup`, `vssBackupInfo`, `vssRestoreBackup` are methods on
   the wallet object; they work as soon as the wallet exists.
3. **What `sdk.unlock` really gates is the node runtime**: every runtime
   start goes through `ensure_runtime_session_authorized()` → *"runtime
   session is locked; call unlock first"* (`ldk_runtime.rs`). Unlock is also
   where the password is validated.
4. **Channel restore is embedded in `configureLdkVssReplication`**
   (`ln_node.rs`) — one call does fence acquire + guarded fresh-store
   restore + starts continuous replication; it must run **before the node
   runtime starts**, and `clearLdkVssFence` is refused once replication is
   active.
5. **Wallet-stream restore must finish before go-online/attach** (the
   RefCell rules): restoring the wallet DB while the node runtime or an
   esplora sync can touch the wallet is a borrow-panic / race risk.

Facts 1–2 mean the wallet can be created **at `init()`**, while the SDK is
still "locked" — the locked contract is enforced by the binding (which
already throws "Wallet is locked" for gated ops), not by the wallet's
absence. That removes any lifecycle trickery from the restore call.

## Proposed lifecycle

```
init()                       — sdk.initValue, key derivation, node handle
                               (runtime not started), RlnWasmWallet.create
                               (loads local IDB snapshot), configureVssBackup.
                               Binding still reports LOCKED: wallet/network
                               ops throw; only key reads + VSS ops work.

   ── the gap ──             — optional, explicit, user-invoked:
                               await wallet.rlnRestoreVSSBackup()
                               (+ { takeoverFence: true } for dead-device
                               takeover — vssClearFence still works here
                               because LDK replication isn't active yet)

unlock()                     — sdk.unlock (password check + runtime
                               authorization) → configureLdkVssReplication
                               (guarded channel restore, pre-runtime) →
                               goOnline + node attach.
```

Ordering stays safe: the wallet-stream restore now runs *before* the LDK
configure instead of after, but the two streams are independent stores, and
both restores still complete before the runtime starts / the wallet
attaches / the indexer connects — which is the actual constraint.

### The restore function

```ts
// UTEXOWallet — proposed
async rlnRestoreVSSBackup(opts?: {
  takeoverFence?: boolean; // default false — see safety note
}): Promise<RlnVssRestoreResult> {
  if (!this.initPromise) throw new Error('call init() first');
  await this.initPromise;
  if (this.unlockPromise) {
    throw new Error(
      'rlnRestoreVSSBackup must run between init() and unlock()'
    );
  }
  if (!this.derivedVssConfig) throw new Error('VSS is disabled (vssUrl: null)');

  // Optional dead-device takeover — must happen before unlock()'s
  // configureLdkVssReplication acquires the fence.
  if (opts?.takeoverFence) await this.vssClearFence();

  // Direct wallet-stream restore — the wallet exists since init().
  const info = await this.vssBackupInfo();
  if (info.backupExists) await this.vssRestoreBackup();

  this.vssRestoreRan = true; // consumed by the unlock()-time guard rail
  return {
    walletRestored: info.backupExists,
    serverVersion: info.serverVersion ?? null,
  };
}
```

Channel restore is *not* in this function's body — it happens inside
`unlock()`'s `configureLdkVssReplication` (see the caveat below) — but from
the app's point of view the sequence `init → rlnRestoreVSSBackup → unlock`
restores **everything**: wallet stream in the call itself, channels at the
unlock that follows (the fence takeover in the call is what unblocks it on
a replaced device).

### Binding changes

- `RlnWasmBinding.create()` (init phase) additionally does
  `RlnWasmWallet.create` + `configureVssBackup` when VSS is enabled.
- `unlockWallet()` shrinks to `sdk.unlock` + `configureLdkVss()`.
- The LOCKED gate becomes an explicit `unlocked` flag on the binding:
  wallet/network ops keep throwing "Wallet is locked" until `unlock()`,
  even though the wallet object exists. Externally the lifecycle contract
  (and RN parity) is unchanged. VSS info/restore are exempt from the gate.

### App-visible flows

```ts
// Existing device (normal start) — nothing changes:
const wallet = new UTEXOWallet({ mnemonic, password, network });
await wallet.init();
await wallet.unlock();            // backups automatic, no restore surprise

// New device, restore from the mnemonic — ONE extra call:
const wallet = new UTEXOWallet({ mnemonic, password, network });
await wallet.init();              // locked, wallet object exists
await wallet.rlnRestoreVSSBackup();   // wallet stream now, channels at unlock
await wallet.unlock();            // channel restore + online

// Old device wiped/dead (fence still held) — folded into the same call:
await wallet.init();
await wallet.rlnRestoreVSSBackup({ takeoverFence: true }); // after user confirms!
await wallet.unlock();
```

Calling it after `unlock()` throws (the safe window is gone once the
runtime is authorized and the wallet can attach). Calling `unlock()`
without it just starts fresh — no silent cloud overwrite.

## The caveat: why channel restore stays implicit

The wasm API couples channel restore to enabling channel *backup*: they are
one call (`configureLdkVssReplication`), and it must keep running inside
`unlock()` — otherwise a user who never calls the restore function would
silently get **no channel backup at all**. So `unlock()` alone still
restores channels on a fresh device (when the fence allows it).

This is correct rather than a compromise:

- The restore inside the configure is **guarded** — it only fires when the
  local store is empty (a genuinely fresh device). On a normal start it is
  a no-op.
- "Start fresh, ignore my old channel state" is not a meaningful user
  choice — running a node against stale channel state risks punishment
  transactions / fund loss. The only legitimate gate is the single-writer
  fence, which already forces the explicit `takeoverFence` decision.
- The user-meaningful restore decision is the **wallet stream** (it
  *overwrites* local RGB/on-chain state with the cloud snapshot) — and
  that is exactly the part the proposal makes explicit.

A fully symmetric "nothing restores unless asked" would need an upstream
wasm change (split `configureLdkVssReplication` into configure vs restore)
— touching the frozen rgb-lightning-node repo. Not recommended; not needed.

## Guard rail: warn when a backup exists but restore wasn't invoked

With auto-restore removed, a user who enters an old mnemonic on a fresh
device and calls plain `unlock()` gets a mixed state: channels restored
(guarded LDK restore) but an empty RGB wallet — and the next auto-backup
would **overwrite the cloud snapshot with the fresh empty wallet**
(last-write-wins). Mitigation, cheap because the wallet + VSS client now
exist from init(): `unlock()` checks `vssBackupInfo()` before go-online —
if `backupExists`, the local wallet is fresh, and `rlnRestoreVSSBackup()`
was not called, log a prominent warning (or optionally throw; worth a
`vssStrictRestore?: boolean` param, default warn-only).

## Naming

`rlnRestoreVSSBackup()` works; alternatives: `restoreFromVSS()`,
`vssRestore()`. Whatever the pick, keep the existing low-level
`vssRestoreBackup()` (wallet-stream-only force restore) as-is — the new
method is the orchestrated flow on top of it. Docs should present only the
new one.

## Change list (all in rgb-sdk-web)

1. `RlnWasmBinding`: move `RlnWasmWallet.create` + wallet-stream
   `configureVssBackup` into the create/init phase; add the explicit
   `unlocked` gate flag; `unlockWallet()` = sdk.unlock + LDK configure.
2. `RlnWalletInitParams`: remove `vssAutoRestore`
   (src/wallet/rln-wallet-manager.ts).
3. `UTEXOWallet.unlockInternal()`: drop the auto-restore branch; add the
   unrestored-backup warning (src/utexo/utexo-wallet.ts).
4. Add `UTEXOWallet.rlnRestoreVSSBackup(opts?)` + `RlnVssRestoreResult`.
5. Update `docs/VSS-BACKUP-RESTORE.md` (flows, RN-comparison table) and
   CLAUDE.md lifecycle description.
6. Tests: `tests/utexo-flows.test.ts` — new-device restore flow, wrong-order
   call throws, locked ops still throw pre-unlock, unlock-without-restore
   warns.
7. Demo app: replace any `vssAutoRestore` usage with the explicit call.

**Breaking change note:** RN parity breaks deliberately — RN restores
automatically at unlock. If web↔RN portability of the *restore* path
matters, keep `vssAutoRestore` one more release (deprecated, default
`false`) instead of deleting it immediately.

## Rejected alternative: lifecycle-advance trick

An earlier draft kept wallet creation at unlock() and had
`rlnRestoreVSSBackup()` internally run the idempotent `unlockWallet()` to
reach an "unlocked but offline" state, restore there, and let the real
`unlock()` re-enter as a no-op. It works, but the init()-time wallet
creation is strictly better: no hidden lifecycle side effects inside a
restore call, `sdk.unlock` (password validation) stays exactly where the
user expects it, and the restore function body is three lines of actual
restore. The only cost is enforcing LOCKED at the binding instead of via
the wallet's absence.
