# Bug: live-API invoices are invisible to `invoiceStatus` / `getPayment` / `listPayments` — "unknown LN invoice"

**Component:** `rln-wasm-sdk` (`rgb-lightning-node/bindings/wasm-sdk/src/ln_node.rs`) → consumed by `@utexo/rgb-sdk-web`
**Priority:** High — blocks settlement polling (`awaitReceiveSettlement`, `getLightningSendRequest`) for real LSP-routed payments
**Status:** mitigated in `@utexo/rgb-sdk-web` (2026-07-02) — `RlnNodeBinding` read paths
(`invoiceStatus`, `getPayment`, `listPayments(_Raw)`) now consult the live event-stream
ledger (`livePaymentValue`/`livePaymentsValue`) and fold status casing; the wasm-side
API inconsistency itself remains **open** (fix drafted below, frozen per decision not to
change `rgb-lightning-node`)
**Environment:** wasm32 (browser), regtest LSP stack

---

## Symptom

Recipient waits for a payment and the settlement poll aborts immediately:

```text
waiting for the Sender to pay…
Fatal: unknown LN invoice

  invoiceStatusJson            (wasm)
  invoiceStatus                @ RlnNodeBinding.ts
  getLightningReceiveRequest   @ utexo-wallet.ts
  awaitReceiveSettlement       @ UtexoLsp.ts
```

## Context — how we got here

The scaffold invoice builder (`createLnInvoiceJson`) produces invoices with **no route
hints** and **no ChannelManager payment registration**, so an LSP-routed (multi-hop)
payment to a wasm recipient can never be routed — verified empirically: the LSP RLN log
contains zero HTLC traffic for such payments; the HTLC never leaves the sender.
`rgb-sdk-web` was therefore switched to the live API (`createLnInvoiceLiveJson`, the
same call the wasm-interop e2e reference uses), which fixes routing — and exposed this
gap.

## Root cause — two disjoint payment ledgers

The wasm node keeps **two** payment stores that never see each other:

| Ledger | Written by | Read by |
|---|---|---|
| Scaffold maps (`self.payments` / runtime `get_payment`) | `createLnInvoiceJson`, `createHodlLnInvoiceJson`, scaffold send paths | `invoiceStatusJson`, `getPaymentJson`, `listPaymentsJson` |
| Live event-stream ledger (`live_payments` in `WasmLdkLiveBackend`, fed by real LDK events: `PaymentClaimable`/`PaymentClaimed`/`PaymentSent`/`PaymentFailed`) | `createLnInvoiceLiveJson` (`ln_node.rs:2312` → backend `create_bolt11_invoice_live`), `sendPaymentJson` → `send_bolt11_live` | `livePaymentJson`, `livePaymentsJson` **only** |

`invoice_status_value` (`ln_node.rs:~2896`) and `get_payment_value` (`~2330`) look up
the payment hash **only in the scaffold maps** and return
`ERR_LN_INVOICE_UNKNOWN` / `ERR_PAYMENT_NOT_FOUND` when it is missing — which is always
the case for live-created invoices and live sends. `list_payments_value` likewise never
merges live records (relevant for APay: the merchant settle loop polls
`listPaymentsRaw()` for the inbound payment).

The wasm-interop harnesses never hit this because they poll `livePaymentValue(hash)`
directly.

## Secondary issue — status casing

Live-ledger statuses are lowercase (`"pending"`, `"claimable"`, `"succeeded"`,
`"failed"`), while `@utexo/rgb-sdk-web` status mappers switch on capitalized unions
(`InvoiceStatus = 'Pending'|'Expired'|'Paid'`, `LightningPaymentStatus =
'Pending'|'Succeeded'|'Failed'` — see `mapInvoiceStatus`/`mapPaymentStatus` in
`utexo-wallet.ts`, which return `null` on any unrecognized value). Whichever side is
fixed must also fold casing, or settlement will silently report `Pending` forever even
after the payment succeeds.

## Proposed fix (wasm side — drafted, reverted, ready to reapply)

All in `ln_node.rs`; ~40 lines, no `rust-lightning` changes:

1. `invoice_status_value`: after computing `payment_hash`, check the live ledger first:

   ```rust
   if let Some(live) = self.ldk_runtime.live_payment(&payment_hash) {
       let status = if live.status == "pending"
           && live.expires_at.map(|at| at < unix_now_secs()).unwrap_or(false)
       { "expired".to_string() } else { live.status };
       return crate::js_obj(&RlnWasmNodeInvoiceStatusData { status });
   }
   ```

2. `get_payment_value`: turn the scaffold lookup into an `Option` and fall back to
   `self.ldk_runtime.live_payment(&payment_hash)` mapped through a small
   `payment_data_from_live` helper (`LdkRuntimeLivePaymentData` →
   `RlnWasmNodePaymentData`; `invoice_type: None`, `payee_pubkey: ""`).

3. `list_payments_value`: before sorting, append live records whose `payment_hash` is
   not already present.

4. Add `LdkRuntimeLivePaymentData` to the `crate::ldk_runtime` import block
   (`ln_node.rs:26-30`) — the drafted revert removed the helper, so this import is the
   one missing piece.

Then `wasm-pack build --target web` and fold status casing in
`RlnNodeBinding.invoiceStatus` / `normalizePayment` (`'succeeded'→'Paid'/'Succeeded'`,
`'expired'/'failed'→'Expired'/'Failed'`, else `'Pending'`).

## Same split on the SEND side — `sendPaymentJson` never sends (found 2026-07-02)

The scaffold/live split is systemic, not invoice-specific. `sendPaymentJson` and
`keysendJson` are **parity-model** paths: they record a payment entry and simulate its
settlement from the event stream — no route is computed and **no HTLC is ever
constructed**. The node's own doc comment on `keysendLiveValue` states it: *"Unlike
`keysend_value`, which records a parity-model payment that settles from the
event-stream, this constructs and routes an actual HTLC."* Verified empirically: a
`sendPaymentJson` pay returns `pending` with a payment hash, while the LSP log shows
zero HTLC traffic for that hash — the wire never sees the payment, and the recipient
polls `Pending` forever.

The real send APIs are `sendPaymentLiveJson` / `keysendLiveJson` (used by the
wasm-interop flows: `node.sendPaymentLiveValue(bolt11, …)`).

**Mitigated in `@utexo/rgb-sdk-web` (2026-07-02):** `RlnNodeBinding.sendPayment` /
`keysend` now call the `*LiveJson` variants. Together with live invoices and the
live-ledger status reads, the entire payment path now runs on the real LDK
`ChannelManager`.

**Guidance for the wasm crate:** the scaffold (parity-model) `createLnInvoiceJson` /
`sendPaymentJson` / `keysendJson` / `invoiceStatusJson` / `getPaymentJson` family
silently simulates instead of erroring when a live runtime is active. Either route the
scaffold names to the live implementations when the live backend is up, or deprecate
them — any SDK consumer picking the "obvious" name gets a no-op payment.

## Alternative workaround (SDK-only, no `rgb-lightning-node` changes)

`RlnNodeBinding` can bypass the scaffold readers entirely:
- `invoiceStatus(invoice)`: decode the invoice → payment hash → `livePaymentJson(hash)`;
  fall back to `invoiceStatusJson` for scaffold-era invoices; fold casing.
- `getPayment(hash)`: try `getPaymentJson`, fall back to `livePaymentJson`.
- `listPayments(_Raw)`: merge `listPaymentsJson` + `livePaymentsJson` by payment hash.

Functionally equivalent for the demo; leaves the wasm API inconsistency in place.

## Current state of the flow

With the shipped pkg (accept fix + enrichment + time-panic fix) and the current
`rgb-sdk-web` (live invoices + RGB-work driving + **live-ledger read paths applied**):
channel opens work, invoices carry route hints, and settlement polling reads real LDK
payment state. The wasm-side ledger split remains for other consumers of
`invoiceStatusJson`/`getPaymentJson` until the drafted node fix lands.
