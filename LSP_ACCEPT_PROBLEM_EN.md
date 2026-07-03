# Accept problem: why the wasm node cannot accept a channel from the LSP

**Component:** `rln-wasm-sdk` (`rgb-lightning-node/bindings/wasm-sdk`) → consumed by `@utexo/rgb-sdk-web`
**Priority:** High — blocks the LSP/APay flow in the browser (`/lsp-apay`)
**Status:** **FIXED (2026-07-02)** — implemented in `bindings/wasm-sdk` + a companion fix in
`rgb-sdk-web`; see [Implemented fix](#implemented-fix-2026-07-02) at the bottom. The analysis
below is kept as-is for reference.

---

## Context: what "accept" means

Opening a Lightning channel is a **two-sided handshake**:

```
LSP  ──open_channel (channel params)──▶  wasm node
                                         the wasm node's LDK EVALUATES the params
                                         against its config and decides:
                                         accept (accept_channel) or reject (error)
```

The decision is made by the **wasm node's own LDK**. This is exactly where it breaks. "The LSP
can't open a channel" really means "the LSP sends the open, and the wasm node rejects it during
the handshake".

---

## Root cause: wasm auto-accepts with ONE fixed config

In the wasm node (`bindings/wasm-sdk/src/ldk_live_backend.rs:1199`) the channel manager is built like:

```rust
let mut user_config = UserConfig::default();
user_config.accept_forwards_to_priv_channels = true;   // ← this is ALL that is set
```

Consequences of this default:

| Parameter | Value in wasm | Effect |
|---|---|---|
| `manually_accept_inbound_channels` | `false` (default) | inbound channels are accepted **automatically**, with no way to adapt to the proposal |
| `force_announced_channel_preference` | `true` (LDK default) | requires the peer's announcement preference to match ours |
| `announce_for_forwarding` | `false` (default) | we accept **private** channels only |
| `is_virtual` on the inbound path | hardcoded `false` (`channelmanager.rs:10840`) | always the standard dust floor of **354** |

So the wasm node can accept exactly **one** channel type: **private + normal dust (≥354)**.
But the LSP sends other types.

---

## The two rejection modes (as seen in the logs)

### Mode 1 — LSP sends a VIRTUAL channel (`trusted_no_broadcast`, dust=1, private)

```
"dust_limit_satoshis (1) is less than the implementation limit (354)"
```

Mechanics: dust=1 is only allowed when `is_virtual=true` (`channel.rs:3566` →
floor = `VIRTUAL_DUST_LIMIT_SATOSHIS = 1`). But on the accept path `is_virtual` is hardcoded to
**false** → floor **354** → dust=1 is rejected:

```rust
// rust-lightning/lightning/src/ln/channel.rs:3566 (rev 3313e10d)
let min_dust_limit_satoshis = if is_virtual {
    VIRTUAL_DUST_LIMIT_SATOSHIS      // = 1
} else {
    MIN_CHAN_DUST_LIMIT_SATOSHIS     // = 354
};
if open_channel_fields.dust_limit_satoshis < min_dust_limit_satoshis {
    return Err(... "is less than the implementation limit" ...);
}
```
```rust
// channelmanager.rs:10840 — inbound accept, is_virtual HARDCODED false
InboundV1Channel::new(..., /*is_0conf=*/false, /*is_virtual=*/false, ...)
```

### Mode 2 — LSP sends a REGULAR channel (dust=354, **public**)

```
"Peer tried to open channel but their announcement preference is different from ours"
```

Mechanics: the LSP opens a **public** channel (`channel_flags: 1`), while wasm — via
`force_announced_channel_preference=true` + `announce_for_forwarding=false` — requires a
**private** one → mismatch → rejection.

### Summary: whatever the LSP sends, wasm rejects

| LSP sends | Why wasm rejects |
|---|---|
| virtual (dust=1, private) | `is_virtual=false` → floor 354 |
| regular (dust=354, public) | announce mismatch (accepts private only) |

---

## Why the native node accepts (and wasm does not)

The native `rgb-lightning-node` (`src/ldk.rs`) sets **three things** that wasm does not:

```rust
user_config.channel_handshake_limits
    .force_announced_channel_preference = false;        // :4119 — don't enforce announce (accepts both public and private)
user_config.accept_forwards_to_priv_channels = enable_virtual_channels_v0;  // :4123
user_config.manually_accept_inbound_channels = true;    // :4124 — MANUAL accept
```

And crucially — it handles the event manually (`ldk.rs:2436-2519`):

```rust
Event::OpenChannelRequest { temporary_channel_id, counterparty_node_id, .. } =>
    channel_manager.accept_inbound_channel_from_trusted_peer_0conf(..)   // :2507
    // → context.set_trusted_no_broadcast() → allows virtual dust=1 and 0-conf
```

The native node looks at **every** inbound proposal and accepts it **as the type the LSP sent** —
both virtual (dust=1) and regular (public). That's why the e2e suite (`tests/e2e/conftest.py`)
and RN are green.

> In the canonical e2e reference (`utexo-lsp/tests/e2e/conftest.py`) the clients only call
> `connectpeer` + `wait_for_peer_channel_usable` — **the LSP opens the channel**, and the client
> (a native uniffi node) accepts it. Our web code does the same
> (`UtexoLsp.connect()` + `waitForChannel()`), i.e. the web flow is correct; the only problem is
> that the wasm client cannot accept.

---

## What exactly is "broken" in wasm

The wasm SDK **nowhere**:
- sets `manually_accept_inbound_channels = true`;
- sets `force_announced_channel_preference = false`;
- handles the `Event::OpenChannelRequest` event;
- calls `accept_inbound_channel` / `accept_inbound_channel_from_trusted_peer_0conf`.

It simply auto-accepts everything under a single default config → and rejects anything that
doesn't match it.

---

## In one sentence

**The LSP opens the channel just fine, but the wasm node auto-accepts only one hardcoded type
(private + dust≥354). The LSP sends a different one (virtual dust=1 or public), the config does
not match — and the wasm node's own LDK tears the channel down.** The native node avoids this by
enabling manual accept and tailoring the config to each LSP proposal.

---

## What needs to be done (the fix — as originally proposed; now implemented, see bottom)

In `bindings/wasm-sdk/src/ldk_live_backend.rs`, bring the config/logic in line with the native node:

1. `force_announced_channel_preference = false` — to accept **public regular** channels
   (the cheapest part, effectively 1 line);
2. `manually_accept_inbound_channels = true` + an `Event::OpenChannelRequest` handler calling
   `accept_inbound_channel_from_trusted_peer_0conf` — to accept **virtual** channels (dust=1),
   mirroring the native `src/ldk.rs:2436-2519`;

then rebuild the pkg:
```bash
cd rgb-lightning-node/bindings/wasm-sdk
wasm-pack build --target web
cd ../../../rgb-sdk-web && npm run build
```

All required primitives (`accept_inbound_channel_from_trusted_peer_0conf`,
`set_trusted_no_broadcast`) already exist in the pinned rust-lightning (`rev 3313e10d`) —
rust-lightning does not need to be touched.

---

## Key code references

| What | File:line |
|---|---|
| Default wasm UserConfig (root cause) | `bindings/wasm-sdk/src/ldk_live_backend.rs:1199` |
| `is_virtual=false` on inbound accept | `rust-lightning .../channelmanager.rs:10840` (rev 3313e10d) |
| dust gate (354 / 1) | `rust-lightning .../channel.rs:3566`; constants `:947` (354), `:949` (1) |
| Virtual accept primitive | `.../channelmanager.rs` `accept_inbound_channel_from_trusted_peer_0conf` |
| Native node reference (config) | `rgb-lightning-node/src/ldk.rs:4119, 4123, 4124` |
| Native node reference (handler) | `rgb-lightning-node/src/ldk.rs:2436-2519` |
| Canonical e2e (LSP opens) | `utexo-lsp/tests/e2e/conftest.py:207-218` |
| wasm rust-lightning pin | `bindings/wasm-sdk/Cargo.toml:44` (rev 3313e10d) |

---

---

## Implemented fix (2026-07-02)

All changes live in `rgb-lightning-node/bindings/wasm-sdk` (the native node, uniffi
bindings, and the pinned rust-lightning fork are untouched, as predicted — every needed
primitive already existed in rev `3313e10d`), plus one companion fix in `rgb-sdk-web`.

### 1. UserConfig — `ldk_live_backend.rs` (the two missing lines)

```rust
user_config.channel_handshake_limits.force_announced_channel_preference = false;
user_config.manually_accept_inbound_channels = true;
```

Mirrors native `src/ldk.rs:4119/4124`. The first accepts announced ("public") regular
opens; the second routes every inbound open through `Event::OpenChannelRequest`.

### 2. `Event::OpenChannelRequest` handler — `ldk_live_backend.rs` (`handle_ldk_event_sync`)

Ported from native `src/ldk.rs:2436-2520`:

- **virtual channels enabled AND the proposed `channel_type` has `scid_privacy`** (the
  LSP's `trusted_no_broadcast` opens negotiate it via `negotiate_scid_privacy:
  is_virtual_open` in native `routes.rs:4188`; the fork advertises `scid_privacy_optional`
  unconditionally, so the wasm peer qualifies) →
  `accept_inbound_channel_from_trusted_peer_0conf(…, ChannelFundingType::Virtual)` —
  this flips `is_virtual=true`, so the dust floor is `VIRTUAL_DUST_LIMIT_SATOSHIS = 1`
  and the LSP's dust=1 open passes.
- **anything else** → stock `accept_inbound_channel(…)`.

**Deliberate divergence from native:** native force-closes non-scid-privacy inbound opens
when virtual channels are enabled; the wasm handler instead falls back to plain accept,
because the wasm node must keep accepting ordinary private channels for the existing
native→wasm interop flows (`run_multihop_flow`, `run_e2e_full_flow`). Native's
`virtual_peer_pubkeys` trust list is not ported; semantics match native with an *empty*
list (trust any peer) — acceptable for the regtest demo SDK, add a trust list later if
needed.

### 3. Flag plumbing — `ldk_live_backend.rs` + `ln_node.rs`

`setEnableVirtualChannelsV0` previously only flipped a `RefCell` inside `RlnWasmNode`
that the LDK backend never read (the old comment in `RlnWasmBinding.ts` claiming it
enabled accepting LSP virtual channels was wrong). Now a per-runtime-key registry
(`VIRTUAL_CHANNELS_V0_REGISTRY`, same thread-local pattern as the RGB wallet registry)
is written from `RlnWasmNode::setEnableVirtualChannelsV0` **and** on node construction
(restored flag), and read by the backend's `OpenChannelRequest` handler.

### 4. Channel-view enrichment — `list_live_channels` / reconcile

Needed so the accepted channel is *visible correctly*, not just open:

- `asset_id` / `asset_local_amount` are now read from the RGB kv store
  (`read_rgb_channel_info`; `contract_id.to_string()` is the canonical asset id) for
  every live channel. Previously they came only from the local outbound-open cache, so
  inbound/LSP-opened channels listed with `asset_id: null` and
  `UtexoLsp.waitForChannel(assetId)` could never match.
- `outbound_balance_msat` / `inbound_balance_msat` are now exposed from live
  `ChannelDetails` (`outbound/inbound_capacity_msat`). Previously absent, which made
  `UtexoLsp.waitForOutboundLiquidity` always read 0.
- Structs extended (`LdkRuntimeOpenChannelResultData`, `LdkRuntimeChannelStateData`,
  `RlnWasmNodeChannelData`) with `#[serde(default)]` — old persisted snapshots load fine.
  The runtime reconcile prefers live values and falls back to cached ones.

### 5. Companion fix in `rgb-sdk-web` — drive the RGB funding work queue

Found during verification: with accept working, the inbound channel stalled after
`Event::RgbFundingValidationRequired`. That event only *queues*
`PendingRgbFundingWork::ValidateFunding`; the wasm node has no background executor, and
the only driver is an explicit `driveRgbFundingWork()` call — which the wasm-interop
examples make in their wait loops, but `rgb-sdk-web` never did. Fix:
`RlnNodeBinding` now best-effort `await`s `driveRgbFundingWork()` on its polling read
paths — `listChannels`, `invoiceStatus`, `getPayment`, `listPayments(_Raw)` — so both
channel waits (`waitForChannel`) and payment/settlement waits
(`awaitReceiveSettlement`, `getLightningSendRequest` polling) double as the drive beat.
The same queue also flushes pending RGB transaction fascia (commitment/HTLC coloring),
which is what moves in-flight RGB payments out of `Pending`. Failed items are re-queued
internally and retried on the next poll.

### Rebuild

```bash
cd rgb-lightning-node/bindings/wasm-sdk
CC_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/clang \
AR_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/llvm-ar \
wasm-pack build --target web
cd ../../../rgb-sdk-web && npm run build   # pkg is symlinked into node_modules
```

### Verification

**VERIFIED END-TO-END (2026-07-02)** — `rgb-sdk-web-demo` "Regtest two-window flow":
LSP virtual channel open accepted + usable on both browser wallets, RGB top-up via
`lightning_receive` (faucet → LSP → sender) settled, and a 1-RGB / 3000-sat payment
sender → LSP → recipient **Settled** with correct channel RGB deltas. Note the fix
chain required beyond accept: companion SDK fixes for the scaffold-vs-live API split
and chain-sync ticking (see `WASM_LIVE_INVOICE_STATUS_GAP.md`).
