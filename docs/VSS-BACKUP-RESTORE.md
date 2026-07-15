# VSS Backup & Restore for `@utexo/rgb-sdk-web`

> Status: based on rgb-lightning-node **PR #105** (`Wasm followup vss support`,
> `rmn-boiko:feat/wasm-followup-fixes` → `dev`), built locally from the `pr-105-vss`
> branch. Not yet released upstream.

## How the app uses it

**Backup is zero-config** (both streams, automatic once VSS is configured —
which happens by default). **Restore is explicit-only**: one call,
`restoreFromVss()`, in the init→unlock gap. Nothing ever restores
without the app asking.

The lifecycle: `init()` → wallet LOCKED (SDK initialized but locked, node
handle exists — runtime not started, RGB wallet object created from the
local IDB snapshot, wallet-stream VSS client configured; wallet/network ops
throw, VSS ops work) → *optional explicit restore* → `unlock()` → sdk
unlocked, channels restored (guarded), online.

```ts
// Normal start (existing device) — no restore, no surprises:
const wallet = new UTEXOWallet({ mnemonic, password, network });
await wallet.init();    // locked
await wallet.unlock();  // online (UTEXOWallet.create() does both)
// - backup: identity derived from the mnemonic, server defaults to
//   DEFAULT_VSS_SERVER_URL; every state-changing op auto-uploads, and
//   channel state replicates continuously.

// New device, restore from the mnemonic — ONE extra call. This also takes
// over the old device's single-writer fence BY DEFAULT (takeoverFence:
// true): a wiped/dead device can never release its own fence, and
// restoring from the mnemonic on a new device almost always means the old
// one is gone. Only restore when that is actually true.
const wallet = new UTEXOWallet({ mnemonic, password, network });
await wallet.init();            // locked
await wallet.restoreFromVss();  // wallet stream restored NOW + fence takeover;
                                // channels restore at the unlock below
await wallet.unlock();          // channel restore + online

// Old device might STILL BE RUNNING (migration, second browser)? Keep its
// fence — two live writers on one channel store = stale-commitment /
// fund-loss risk. The channel stream then stays with the old device until
// it releases the fence (clean shutdown / disableLdkVssReplication):
await wallet.restoreFromVss({ takeoverFence: false });
```

`restoreFromVss()` returns `{ walletRestored, serverVersion }`, throws
if called after `unlock()` (the safe window is gone once the runtime can
start), and throws on restore failure — no silent "starting fresh". The
fence takeover is skipped when the wallet has no Lightning node (no channel
stream to fence). Plain `unlock()` on a fresh device logs a prominent
warning when a cloud backup exists that wasn't restored (the next
auto-backup would overwrite it).

Manual controls:

```ts
new UTEXOWallet({ ..., vssUrl: null });          // disable VSS entirely
new UTEXOWallet({ ..., vssUrl: 'https://…' });   // custom server
await wallet.vssBackup();        // force a backup now (no args needed)
await wallet.vssBackupInfo();    // { backupExists, serverVersion, … }
await wallet.vssRestoreBackup(); // low-level wallet-stream-only restore
await wallet.vssClearFence();    // fence clear alone (in the locked gap)

// Detecting a held fence after a normal unlock() — unlock() runs ONCE, so
// the retry must be explicit: disable (resets the latch) → clear → unlock:
const health = wallet.ldkVssBackupInfo();
if (health && !health.configured && /owned by another/.test(health.lastError ?? '')) {
  wallet.disableLdkVssReplication(); // user confirmation first!
  await wallet.vssClearFence();
  await wallet.unlock();             // re-runs the configure
}
```

The LDK/channel stream is wired in too: `unlock()` configures
`configureLdkVssReplication` on the node handle before its runtime starts
(same derived identity; the wasm side keys the stream as `<storeId>-ldk`).
It's non-fatal — if the VSS server is down or the fence is held by another
instance, a warning is logged and channel state stays local-only. Check
health with `wallet.ldkVssBackupInfo()`
→ `{ configured, pendingWrites, lastError, disabled }`.

### Local dev (rgb-sdk-web-demo)

`VSS=1 ./scripts/start-lsp-web.sh` also brings up the local vss-server
(`sigs-auth` build, port 8081 — same `VSS=1` convention as the native
`regtest.sh`) and writes `VITE_VSS_URL="/vss"` to `.env.local`. The browser
reaches it through the Vite `/vss` proxy (same-origin; vss-server has no CORS
support). The demo passes `vssUrl: DEMO_VSS_URL` everywhere it creates a
wallet — and `null` when the env var is absent, so demo wallets never talk to
the production VSS server by accident.

## Why VSS is needed at all

The web SDK keeps **all** node state in the browser (localStorage + IndexedDB).
The mnemonic alone can only recover on-chain BTC (plain BDK derivation). It can
**not** recover:

| State | Why the mnemonic is not enough |
|---|---|
| RGB assets | RGB is client-side validated — the stock (stash/state/index) and consignments exist only on the client. Lose them and the assets are unspendable even though "the keys" are fine. |
| Lightning channels | Channel monitors / channel manager are LDK runtime state, never derivable from the seed. |
| Colored (RGB) channels | Per-channel `RgbInfo`, payment/transfer info and consignments live in the node's RGB KV store. Without them a restored channel would silently degrade to plain-BTC. |

VSS (Versioned Storage Service) is the encrypted cloud store that fills this gap.

## The two VSS streams

There are **two independent streams**, with separate APIs and store ids:

### 1. RGB wallet stream (rgb-lib-wasm — existed before PR #105)

What's in it: the rgb-lib wallet snapshot — BDK changeset, wallet DB, RGB stock
(stash/state/index), reuse-address index.

| API (on `RlnWasmWallet`) | Behavior |
|---|---|
| `configureVssBackup(serverUrl, storeId, signingKeyHex)` | Sets the client. **Does not upload anything by itself.** |
| `vssBackup()` | Explicit upload of a full encrypted snapshot; returns the server version. |
| `vssBackupInfo()` | `{ backup_exists, server_version, backup_required }` — `backup_required` compares last-operation vs last-backup timestamps. |
| `vssRestoreBackup()` | Downloads and installs the snapshot (also persists it to IndexedDB). |
| `disableVssBackup()` | Drops the client. |

⚠️ Unlike native, the wasm wallet stream has **no auto-backup**: the wasm
`VssBackupConfig` has no `auto_backup`/`backup_mode` options. If nobody calls
`vssBackup()` after an RGB operation, that operation is not in the cloud.

✅ **`UTEXOWallet` closes this gap**: once VSS is configured (automatic at
init), every state-changing op (issue NIA/IFA/CFA, inflate, createUtxos,
RGB/BTC send, blind/witness receive, failTransfers, and any `refreshWallet()`
pass where a transfer actually changed status) fires a best-effort background
`vssBackup()`. At most one upload is in flight; a failure is just logged — no
queue or retry, since the next state-changing op triggers the next backup
anyway. A failed backup never fails the operation itself. Note this is still
weaker than native's *blocking* mode: an op completes locally before the cloud
upload lands.

### 2. LDK / node stream (new in PR #105)

What's in it: channel monitors, channel manager, network graph, scorer, plus the
entire node RGB KV store (`RgbInfo`, payments, consignments — mirrored via a
`VssMirroredKvStore` wrapper).

| API (on `RlnWasmNode`) | Behavior |
|---|---|
| `configureLdkVssReplication(serverUrl, storeId, signingKeyHex)` | Call **before** starting the node runtime. Acquires the single-writer guards, then — on a fresh device — automatically restores everything from VSS into the local browser store. Returns the number of restored keys. After that, replication is **continuous and automatic**: every local persist is mirrored to VSS in the background. |
| `ldkVssBackupInfoJson()` | `{ configured, pendingWrites, lastError, disabled }` — `pendingWrites > 0` means some state hasn't reached VSS yet (alert if it stays non-zero). |
| `disableLdkVssReplication()` | Stops replication, releases the fence + Web Lock. |
| `clearLdkVssFence(serverUrl, storeId, signingKeyHex)` | Deletes the `__rln_instance__` fence key — recovery for when the fence owner can never release it (wiped profile / dead device). Refused while replication is active on this node. |

Design notes (all inherited from the native `SyncedKvStore` model, adapted to the
browser):

- **Local-first**: the localStorage/IndexedDB write remains the durability ack
  gate; VSS is a best-effort background mirror (queued, retried, last-write-wins,
  1000-entry cap).
- Values are encrypted at rest with XChaCha20-Poly1305, keyed by HKDF-SHA256 over
  the signing key (same HKDF tag as native, so envelopes are format-compatible).
- Because the browser VSS client can't list keys, an encrypted manifest key
  (`__ldk_manifest__`) tracks every replicated key; restore walks the manifest.
- The passed `storeId` gets an `-ldk` suffix internally, so the LDK stream can
  never collide with the wallet stream even on the same server.

### Single-writer protection (important for the restore story)

Two writers on the same channel state = corrupted channels / potential fund loss,
so the LDK stream is guarded twice:

1. **VSS fence** (`__rln_instance__` key, cross-device): a random instance id is
   minted per browser profile and **persisted in localStorage**, so a page reload
   re-acquires its own fence. A different browser sees "store is owned by another
   instance" and is refused.
2. **Web Locks API** (same browser, multi-tab): a second tab of the same origin is
   refused with "another tab is already replicating this node to VSS".

The fence is released on `disableLdkVssReplication()` and on final node teardown
(best-effort). When the owner can never release it (wiped profile / dead
device), the takeover is the RN-identical flow — clear in the locked gap:

```ts
await wallet.init();          // locked — node handle exists, no replication
await wallet.vssClearFence(); // deletes the __rln_instance__ key
await wallet.unlock();        // claims the fence → fresh-device restore
```

`wallet.clearLdkVssFence(config?)` is the primary name (identity defaults to
the one derived at init()); `wallet.vssClearFence(password?)` is the RN-parity
alias — the password argument is accepted and ignored (on RN the locked node
needs it to derive its VSS identity; on web the mnemonic is already in the
constructor params). The wasm side refuses to clear while replication is
active on the calling node (i.e. after a successful unlock) — the browser
equivalent of RN's locked-node requirement. unlock() runs ONCE; when the
conflict is only detected after it, recover explicitly:
`disableLdkVssReplication()` (stops the replicator, releases the guards,
resets the unlock latch) → `vssClearFence()` → `unlock()`.

## Identity: who owns which store?

Backup is zero-config because the identity is derived deterministically from
the mnemonic. rgb-sdk-web uses the shared `@utexo/rgb-sdk-core` convention
(`buildVssConfigFromMnemonic`, the same one the other UTEXO SDKs use):

```
signing key = HMAC-SHA256(mnemonic, rgb-lib domain string)   // 32 bytes
store id    = wallet_<masterFingerprint>
```

- The signing key is used both for sigs-auth against the VSS server and for
  deriving the per-value encryption keys.
- The same mnemonic therefore always maps to the same store — that is what makes
  "restore on another browser from the mnemonic" possible with no extra input.
- The native node derives differently (`m/535'/1'`, store id = pubkey hex), but
  the two conventions never need to line up: their payload formats aren't
  cross-restorable anyway (see the note below).

Store layout (`F` = master fingerprint, `P` = native VSS pubkey hex):

| Stream | rgb-sdk-web (wasm) | native / RN |
|---|---|---|
| RGB wallet | `wallet_<F>` | `P_rgb` |
| LDK/node | `wallet_<F>-ldk` (suffix added by the wasm side) | `P` |

> Cross-platform note: even if the store ids were aligned, a native-node backup is
> **not** restorable into a wasm node (and vice versa) — the encryption envelope is
> compatible but the key layout differs (native replicates LDK's real KV
> namespaces; wasm replicates snapshot categories like `_/monitor/...`). VSS
> recovery is same-platform: web ↔ web, RN ↔ RN.

## The scenario: wipe browser A, restore in browser B from the mnemonic

### Browser A (original), while it was alive

1. `UTEXOWallet` `init()` + `unlock()` derive the VSS identity from the
   mnemonic and configure both streams automatically — the LDK stream on the
   node handle before its runtime starts, then the wallet-stream backup.
2. `configureLdkVssReplication` sees a populated local store (existing
   channel-manager snapshot) → restore is skipped, fence acquired, continuous
   replication begins. Channel/RGB-KV changes stream to VSS automatically.
3. Wallet-stream snapshots upload automatically: every state-changing op
   schedules a background `vssBackup()`.

### Browser A's profile is cleared

- localStorage + IndexedDB are gone: wallet DB, RGB stock, channel snapshots, the
  persisted fence instance id — everything local.
- The VSS server is untouched: both streams are still there, **including browser
  A's fence**, which was never released (clearing a profile doesn't run teardown).

### Browser B (new device / fresh profile)

1. User enters the **mnemonic** (+ password, network). Same mnemonic → same
   signing key and store id. Nothing else is needed for identity.
2. **Wallet stream**: `await wallet.restoreFromVss()` in the
   init→unlock gap finds the backup on the server and installs the last
   wallet snapshot → on-chain funds **and RGB assets** are back. (No fence
   on this stream — restore always works.) Skipping the call means starting
   fresh; `unlock()` warns loudly if a backup existed.
3. **LDK stream**: `configureLdkVssReplication(...)` inside `unlock()`:
   - Browser B has a *different* persistent instance id, so if browser A's fence
     is still standing, this call **fails** with "VSS store is owned by another
     rgb-lightning-node instance (…); … clear the `__rln_instance__` key to take
     over."
   - This is by design: the SDK cannot tell "browser A was wiped" apart from
     "browser A is still running somewhere". Blindly taking over while A is alive
     would mean two writers on one channel state.
   - The takeover is an explicit app step: after user confirmation,
     `restoreFromVss()` (fence takeover is its default; or a bare
     `vssClearFence()`) in the locked gap before the first `unlock()`; if
     the conflict was only noticed after unlock,
     `disableLdkVssReplication()` → `vssClearFence()` → `unlock()`.
   - On that retry the call finds an empty local
     store → downloads the manifest → restores RGB KV entries, monitors, network
     graph, scorer, and the channel manager **last** (its presence is the
     restore guard, so a partially failed restore stays retryable) → returns the
     restored key count → node starts with its channels intact.
4. Node runtime starts; channels and colored-channel state are live again.

### Safety caveat

Restoring LDK state on B is only safe if A never comes back online with its (now
stale) copy — broadcasting an old commitment invites punishment. The fence is
exactly the mechanism that forces this to be an explicit, conscious step rather
than an accident.

### Current gaps to close in rgb-sdk-web

1. ~~**Fence takeover UX**~~ — **done**: upstream added a `clearLdkVssFence`
   binding (PR #105, `Fix acquire_fence logic`), and the UTEXOWallet
   lifecycle was split into RN-parity `init()` (locked) / `unlock()` phases
   so the takeover is the RN-identical
   init → `vssClearFence()` → `unlock()` flow. A held fence is detectable via
   `wallet.ldkVssBackupInfo().lastError` — the SDK captures the unlock-time
   configure error, which the wasm health view alone would report as
   `lastError: null`; after-the-fact recovery is the explicit
   `disableLdkVssReplication()` → `vssClearFence()` → `unlock()` sequence.
2. ~~**Wallet-stream auto-backup**~~ — **done**: `UTEXOWallet` schedules a
   background `vssBackup()` after every state-changing op once
   `configureVssBackup()` has been called (see the wallet-stream section).
3. ~~**`UTEXOWallet` wiring**~~ — **done for both streams**: `init()`
   auto-configures the wallet-stream VSS client from the mnemonic-derived
   identity (`vssUrl` param, default `DEFAULT_VSS_SERVER_URL`, `null`
   disables) and gets per-op auto-backup; the LDK stream is configured on
   the node handle pre-runtime at `unlock()` (non-fatal; health via
   `wallet.ldkVssBackupInfo()`).
4. ~~**Explicit restore**~~ — **done**:
   restore is never automatic; `restoreFromVss()` in the init→unlock
   gap is the single restore entry point (wallet stream immediately,
   channels at the following unlock; fence takeover on by default,
   `{ takeoverFence: false }` opts out). `unlock()`
   warns when a cloud backup exists but the fresh local wallet wasn't
   restored. The former `vssAutoRestore` param was removed.

## RN vs WASM: backup UX flow compared

| | RN (`@utexo/rgb-sdk-rn`, native node) | Web (`@utexo/rgb-sdk-web`, wasm PR #105) |
|---|---|---|
| Lifecycle | `init()` (locked) → optional `vssClearFence(password)` → `unlock()` | Same gap, one call: `init()` (locked) → optional `restoreFromVss()` (fence takeover default-on) → `unlock()` (`UTEXOWallet.create()` = init + unlock) |
| Enabling | Constructor params: `vssUrl`, `vssAllowHttp?`, `vssAllowEmptyRestore?` — nothing else | Wallet stream: **on by default**, configured at init (`vssUrl` optional, `null` disables). LDK stream: configured automatically at unlock |
| Identity | Auto-derived in the node from the mnemonic at `m/535'/1'` (or from bootstrap material in external-signer mode) | Auto-derived at init via core's `buildVssConfigFromMnemonic` (HMAC-SHA256 key, storeId = `wallet_<masterFingerprint>`) |
| RGB wallet backup | **Automatic + blocking** after every op (`auto_backup(true)`, `VssBackupMode::Blocking`) — an op isn't done until it's backed up | Wasm layer is manual, but **`UTEXOWallet` auto-schedules** a background `vssBackup()` after every state-changing op (non-blocking: op completes locally first, cloud follows) |
| LDK/channel replication | Continuous via `SyncedKvStore`, starts at unlock | Continuous via `VssReplicator`, starts at `configureLdkVssReplication` (must be before runtime start) |
| Restore | Automatic at unlock; guarded (never clobbers a local wallet); failure blocks unlock unless `vssAllowEmptyRestore` | **Explicit-only**: `restoreFromVss()` in the init→unlock gap restores the wallet stream (throws on failure — no silent fresh start). LDK stream: guarded fresh-store restore inside the unlock-time `configureLdkVssReplication`; a configure failure is non-fatal (recover via disable → clear fence → unlock) |
| Restore failure policy | `vssAllowEmptyRestore` flag decides fail-closed vs start-fresh | Wallet stream: the explicit call throws; the app decides. Skipped restore with an existing cloud backup → loud unlock() warning (next auto-backup would overwrite the snapshot) |
| Single-writer | VSS fence + `vssClearFence(password)` recovery API (works on a locked node) | VSS fence (persisted instance id) + Web Locks for multi-tab; `vssClearFence()` in the locked init→unlock gap (refused while replication is active) |
| Backup health | node HTTP routes `/vssbackupinfo` | `vssBackupInfo()` (wallet) + `ldkVssBackupInfoJson()` (node) |
| App code required | Zero backup-related calls | Backup: zero. Restore: one call — `restoreFromVss()` on a new device |

**The essential UX differences:** on RN the app opts in with one URL and the
node guarantees cloud durability synchronously (blocking auto-backup); on web
the SDK orchestrates the same guarantees itself — `UTEXOWallet` auto-backs-up
the wallet stream after each state-changing op (asynchronously, so the cloud
can briefly lag local state), and the LDK stream, once configured, is as
automatic as RN's. And where RN restores automatically at unlock, web makes
restore a deliberate one-call decision (`restoreFromVss()`) — restoring
overwrites local state, so it is explicit and loud instead of automatic and
silent.
