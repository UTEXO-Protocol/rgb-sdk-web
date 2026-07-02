# Accept problem: why the wasm node cannot accept a channel from the LSP

**Component:** `rln-wasm-sdk` (`rgb-lightning-node/bindings/wasm-sdk`) → consumed by `@utexo/rgb-sdk-web`
**Priority:** High — blocks the LSP/APay flow in the browser (`/lsp-apay`)
**Status:** root cause identified; fix NOT implemented

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

## What needs to be done (the fix)

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

*Related document: [LSP_VIRTUAL_CHANNEL_ACCEPT_BUG.md](./LSP_VIRTUAL_CHANNEL_ACCEPT_BUG.md)*
*Ukrainian version: [LSP_ACCEPT_PROBLEM.md](./LSP_ACCEPT_PROBLEM.md)*
