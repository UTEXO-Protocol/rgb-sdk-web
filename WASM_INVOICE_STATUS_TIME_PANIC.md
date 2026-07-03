# Bug: `invoiceStatus` panics the wasm node — "time not implemented on this platform"

**Component:** `rln-wasm-sdk` (`rgb-lightning-node/bindings/wasm-sdk/src/ln_node.rs`) → consumed by `@utexo/rgb-sdk-web`
**Priority:** High — any invoice-status poll on a pending invoice kills the whole wasm instance
**Status:** **FIXED (2026-07-02)** — see fix at the bottom
**Environment:** wasm32-unknown-unknown (browser), any network

---

## Symptom

Polling a Lightning receive request (the standard settlement wait) aborts the entire
node with an unrecoverable trap:

```text
Fatal: RuntimeError: unreachable

[rln-wasm-sdk panic] panicked at library/std/src/sys/pal/wasm/../unsupported/time.rs:31:9:
time not implemented on this platform

  $rlnwasmsdknodehandle_invoiceStatusJson
  invoiceStatus            @ RlnNodeBinding.ts
  getLightningReceiveRequest @ utexo-wallet.ts
  awaitReceiveSettlement   @ UtexoLsp.ts
```

Because a Rust panic in wasm is an `unreachable` trap, this doesn't return an error —
it poisons the wasm instance (borrowed `RefCell`s never unwind), so **every subsequent
SDK call in the tab is undefined behavior**. The only recovery is a page reload.

## Root cause

`invoice_status_value` (`ln_node.rs:2911`) checked pending-invoice expiry with:

```rust
if payment.status == "pending" && parsed.is_expired() {
```

`Bolt11Invoice::is_expired()` (lightning-invoice) is implemented as:

```rust
pub fn is_expired(&self) -> bool {
    Self::is_expired_from_epoch(&self.timestamp(), self.expiry_time())
}
pub(crate) fn is_expired_from_epoch(epoch: &SystemTime, expiry_time: Duration) -> bool {
    match epoch.elapsed() { ... }   // ← SystemTime::now()
}
```

`SystemTime::now()` has no implementation on `wasm32-unknown-unknown` — `std` stubs it
with `panic!("time not implemented on this platform")`.

The rest of the crate already knows this: every other time read goes through the
cfg-gated `unix_now_secs()` helper (`js_sys::Date::now()` on wasm, `SystemTime` on
native). This one call site bypassed the pattern by delegating to a lightning-invoice
convenience method whose `std`-clock dependency is invisible at the call site.

## Why it was not seen earlier

The path was unreachable in the browser until the LSP inbound-accept fix landed
(see `LSP_ACCEPT_PROBLEM_EN.md`): `waitForChannel` never succeeded, so no flow ever got
far enough to poll `getLightningReceiveRequest` on a pending invoice. First run past the
channel phase hit the panic immediately. (The wasm-interop harnesses poll
`livePaymentValue`, not `invoiceStatusJson`, so they never crossed this line either.)

## Fix

`ln_node.rs:2911` — use lightning-invoice's `std`-free expiry check against the JS clock:

```rust
if payment.status == "pending" && parsed.would_expire(Duration::from_secs(unix_now_secs()))
```

`would_expire(at_time)` compares against an explicit duration-since-epoch and never
touches `SystemTime`. Semantics are identical (`is_expired()` is
`would_expire(SystemTime::now() − UNIX_EPOCH)`).

Rebuild: `wasm-pack build --target web` in `bindings/wasm-sdk` (pkg is symlinked into
`rgb-sdk-web`/demo `node_modules`; no TS rebuild needed for a wasm-only change).

## Guidance for the crate (how not to regress)

On wasm32, **any** `lightning` / `lightning-invoice` API that internally reads the
system clock is a trap-in-waiting. Known offenders: `Bolt11Invoice::is_expired()`,
`SystemTime`-taking constructors (`InvoiceBuilder::timestamp`), anything documented as
"since the Unix epoch" without taking the time as a parameter. The sanctioned pattern is
the crate-local `unix_now_secs()` + explicit-time API variants (`duration_since_epoch`,
`would_expire`, `expires_at`). A quick audit found no other unguarded `std::time` uses —
all other `SystemTime::now()` hits are inside `#[cfg(not(target_arch = "wasm32"))]`
branches.
