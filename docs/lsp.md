# LSP Integration

`utexo-lsp` is a Lightning Service Provider that bridges on-chain RGB assets with Lightning payments. The SDK exposes it through two objects:

- **`UtexoLsp`** — composed flows (connect, channel wait, receive, send, APay). Create one per wallet via `wallet.createLsp()`.
- **`UtexoLSPClient`** — raw HTTP client. Accessible via `lsp.http` for one-off calls.

---

## Quick start

```typescript
import { UTEXOWallet } from '@utexo/rgb-sdk-web';

// lspBaseUrl is the source for no-arg createLsp() peer discovery.
// lspBearerToken is only required for APay routes.
const wallet = await UTEXOWallet.create({
  mnemonic,
  password: 'my-secure-password',
  network: 'utexo',
  lspBaseUrl: 'https://lsp-signet.utexo.com',
  lspBearerToken: 'bearer-token',
});

// No-arg: peer pubkey from GET /get_info, host from the lspBaseUrl hostname,
// port defaults to 9735 (override with the second argument).
const lsp = await wallet.createLsp();

// Non-standard LDK peer port (e.g. a local regtest stack):
const lspRegtest = await wallet.createLsp(undefined, 9745);
```

If you need to override any peer detail (or you didn't set `lspBaseUrl`), pass an explicit peer:

```typescript
import { type LspPeer } from '@utexo/rgb-sdk-web';

const lsp = await wallet.createLsp({
  baseUrl:    'https://lsp-signet.utexo.com',
  peerPubkey: '02abc...',
  peerHost:   'lsp-signet.utexo.com',
  peerPort:   9735,
  bearerToken: 'bearer-token',   // required for APay
});
```

> Unlike the RN SDK there is no init-order constraint — `createLsp()` can be called at any time after `UTEXOWallet.create()`.

---

## `LspPeer`

```typescript
interface LspPeer {
  baseUrl:      string;   // utexo-lsp HTTP API URL
  peerPubkey:   string;   // Lightning P2P pubkey for connectPeer()
  peerHost:     string;   // P2P host
  peerPort:     number;   // P2P port (LDK peer port, not HTTP)
  bearerToken?: string;   // required for APay internal routes
  timeoutMs?:   number;   // HTTP request timeout (default 15 000 ms)
}

// Build a "pubkey@host:port" string from a peer
peerUri(peer: LspPeer): string
```

---

## `UtexoLsp` — method reference

### `connect()`

Connect to the LSP peer over Lightning P2P. Idempotent — safe to call even if already connected (swallows LDK "already connected" errors).

```typescript
await lsp.connect();
```

---

### `waitForChannel(assetId, opts?)`

Poll `wallet.listChannels()` until a usable RGB channel for `assetId` exists. Calls `wallet.syncWallet()` before each check.

```typescript
const channel = await lsp.waitForChannel('rgb:abc...', {
  timeoutMs:      120_000,   // default
  pollIntervalMs:   2_000,   // default
  onProgress: (msg) => console.log(msg),
  // In regtest, mine a block each iteration so the channel confirms:
  onEachPoll: () => mine(1),
});

// channel: ChannelReadyInfo
// { channelId, peerPubkey, capacitySat, outboundBalanceMsat, inboundBalanceMsat }
```

Throws **`LspChannelTimeoutError`** if `timeoutMs` is exceeded.

**`onEachPoll`** — async hook called at the start of every iteration before the wallet check. In regtest the channel funding transaction needs block confirmations; pass `onEachPoll: () => mine(1)` to mine one block per poll. On public networks omit it — confirmations arrive naturally.

---

### `receiveAsset(opts)` — `POST /lightning_receive`

The **Lightning → RGB** bridge. The on-chain sender sends RGB to the LSP; once settled, the LSP pays the user's Lightning invoice.

```typescript
const { lnInvoice, rgbInvoice, mappingId } = await lsp.receiveAsset({
  assetId:    'rgb:abc...',
  amountSats: 3_000,       // sats component of the LN invoice
  amountRgb:  1,           // RGB units
  expirySeconds: 3_600,    // default; applied to both LN and RGB — always in sync
});

// Give rgbInvoice to the on-chain sender.
// The LSP pays lnInvoice once the RGB transfer settles.
```

Internally:
1. Calls `wallet.createLightningInvoice({ amountSats, expirySeconds, asset: { assetId, amount: amountRgb } })`
2. POSTs to `utexo-lsp /lightning_receive` with the LN invoice and RGB params
3. Returns `{ lnInvoice, rgbInvoice, mappingId }`

`expirySeconds` is applied to **both** invoices simultaneously. The LSP validates that they match; `receiveAsset` ensures they always do (it sends the LN invoice's *remaining* lifetime).

---

### `awaitReceiveSettlement(lnInvoice, opts?)`

Poll `wallet.getLightningReceiveRequest(lnInvoice)` until it reaches a terminal state.

```typescript
const outcome = await lsp.awaitReceiveSettlement(lnInvoice, {
  timeoutMs:      60_000,
  pollIntervalMs:  2_000,
  onProgress: (status) => setUiStatus(status),
});
// outcome: 'settled' | 'timed_out'
// throws LspSettlementError({ step: 'ln_invoice', status }) on Failed | Expired
```

Return value: `'settled'` when the invoice is confirmed paid; `'timed_out'` when `timeoutMs` elapses without a terminal status (the LSP cron may still be processing — not a confirmed failure).

---

### `waitForOutboundLiquidity(minMsat, opts?)`

Poll `wallet.listChannels()` until outbound balance on the LSP channel ≥ `minMsat`. Use before `wallet.payLightningInvoice()` to confirm routing capacity.

```typescript
await lsp.waitForOutboundLiquidity(3_000_000, {
  timeoutMs:      120_000,
  pollIntervalMs:   2_000,
  onProgress: (msg) => console.log(msg),
});
```

Throws **`LspLiquidityTimeoutError`** if `timeoutMs` is exceeded.

---

### `sendAsset(opts)` — `POST /onchain_send`

The **RGB → Lightning** bridge. The user sends sats over Lightning; the LSP sends RGB on-chain to the recipient.

```typescript
const result = await lsp.sendAsset({
  rgbInvoice: 'rgb:...',   // recipient's on-chain RGB invoice
  ln: {                    // optional LN params
    amtMsat:   3_000_000,
    expirySec: 3_600,
  },
});
// result.lnInvoice  — the LN invoice this wallet paid
// result.sendResult — { txid: paymentHash, status }
```

Internally:
1. POSTs to `utexo-lsp /onchain_send` with the RGB invoice and LN params
2. LSP returns a BOLT11 invoice
3. Immediately pays it via `wallet.payLightningInvoice()`
4. LSP executes the RGB send to the recipient once the LN payment settles

---

### `payAddress(opts)`

Resolve a Lightning Address and pay it. Tries the LSP's `resolveAddress` first; falls back to standard LNURL discovery for addresses on other hosts.

```typescript
const { invoice, sendResult } = await lsp.payAddress({
  address: 'alice@lsp-signet.utexo.com',
  amtMsat: 3_000_000,
  asset: { assetId: 'rgb:abc...', assetAmount: 1 },  // optional
});
```

---

### `enableLightningAddress()`

Register an async payment hash pool with the LSP, then fetch the auto-generated Lightning Address for this wallet's pubkey. Call once to enable offline receive.

```typescript
const { username, domain, address } = await lsp.enableLightningAddress();
// address → 'excited-mountain-1234@lsp-signet.utexo.com'
```

How it works:

The LSP mints a Lightning Address for every peer that connects, so the address exists before registration — the method only has to look it up. It reads the wallet pubkey (`getNodeInfo`) and the LSP pubkey (`getInfo`), then polls `getLightningAddressByPubkey` until the address appears. `lsp.connect()` must run first; until the account exists the lookup returns 404.

With the `username` and `domain` resolved, it calls `wallet.apayNewWithAddress(lspPubkey, username, domain)`, which sends a single signed batch of hashes to the LSP over P2P. The node signs `username`+`domain` (`address_sig`) and attaches it to the batch — this makes the pool resistant to hash substitution.

Returns `{ username, domain, address, unusedHashes, nextIndexExpected, refillBatchSize }`.

Both `lspBaseUrl` and `lspBearerToken` should be set on `UTEXOWallet.create()` (or `bearerToken` on the explicit `LspPeer`) — registration runs through the RLN node, not the HTTP client.

> Register exactly one batch. The node's batch size already matches the LSP's pool cap, so a single batch fills it. Issuing an `apayNew` bootstrap first overflows the pool, and the LSP rejects the second batch with `invalid_hash_batch`.

---

### `refillHashPool()`

Tops up the hash pool with a fresh signed batch. Call it after `enableLightningAddress()` once `unusedHashes` runs low.

```typescript
const { unusedHashes, nextIndexExpected, refillBatchSize } = await lsp.refillHashPool();
```

The address is already minted, so the method re-resolves it and registers another batch through `apayNewWithAddress`. Refills therefore carry the same attestation as the initial registration. Prefer this over calling `apayNew` directly.

---

### `claimPendingPayments()`

Find all `Claimable` / `Claiming` inbound HODL payments and call `claimHodlInvoice` on each. Use for invoices created with `createHodlLnInvoice` — e.g. when the wallet comes back online.

```typescript
const results = await lsp.claimPendingPayments();
// results: Array<{ paymentHash, claimed, error? }>
```

---

## `WaitOptions`

All waiting methods share these options:

```typescript
interface WaitOptions {
  timeoutMs?:      number;               // ms until timeout (throws or returns)
  pollIntervalMs?: number;               // ms between checks
  signal?:         AbortSignal;          // abort the loop
  onProgress?:     (msg: string) => void; // status updates for UI
  onEachPoll?:     () => Promise<void>;  // regtest: mine blocks between iterations
}
```

---

## Error types

```typescript
// Thrown by waitForChannel() on timeout
class LspChannelTimeoutError extends Error {
  assetId:   string;
  elapsedMs: number;
}

// Thrown by waitForOutboundLiquidity() on timeout
class LspLiquidityTimeoutError extends Error {
  minMsat:          number;
  lastOutboundMsat: number;
  elapsedMs:        number;
}

// Thrown by awaitReceiveSettlement() when the invoice fails or expires
class LspSettlementError extends Error {
  step:   'ln_invoice';
  status: ReceiveStatus;
}

// Thrown by the HTTP client on non-2xx responses
class LspError extends Error { /* status, body */ }
```

---

## Full examples

### Receive RGB over Lightning

```typescript
const lsp = await wallet.createLsp();

// 1. Connect + wait for channel (regtest: mine blocks per iteration)
await lsp.connect();
const channel = await lsp.waitForChannel(ASSET_ID, {
  onEachPoll:  () => mine(1),   // omit on public networks
  onProgress:  (msg) => console.log(msg),
});
console.log(`Channel ready: ${channel.capacitySat} sat`);

// 2. Create invoices — one call, expiry synced automatically
const { lnInvoice, rgbInvoice } = await lsp.receiveAsset({
  assetId:    ASSET_ID,
  amountSats: 3_000,
  amountRgb:  1,
});

// 3. Share rgbInvoice with the on-chain sender
console.log('RGB invoice (give to sender):', rgbInvoice);

// 4. Wait for the LSP to pay the LN invoice once RGB settles
await lsp.awaitReceiveSettlement(lnInvoice, {
  onProgress: (s) => setStatus(s),
});
console.log('Received!');
```

### Send RGB to an on-chain recipient

```typescript
// Recipient gives you their RGB invoice
const result = await lsp.sendAsset({
  rgbInvoice: recipientRgbInvoice,
  ln: { amtMsat: 3_000_000 },
});
console.log('Sent. Payment hash:', result.sendResult.txid);
```

### P2P Lightning payment (after receiving)

```typescript
// Wait until the channel has enough outbound balance
await lsp.waitForOutboundLiquidity(3_000_000, {
  onProgress: (msg) => console.log(msg),
});

// Recipient creates an invoice
const { lnInvoice } = await recipientWallet.createLightningInvoice({
  amountSats: 3_000,
  expirySeconds: 3_600,
  asset: { assetId: ASSET_ID, amount: 1 },
});

// Pay it directly — no LSP bridge needed for Lightning-to-Lightning
await wallet.payLightningInvoice({ lnInvoice });
```

### APay — Lightning Address (offline receive)

```typescript
const wallet = await UTEXOWallet.create({
  mnemonic,
  password,
  network: 'utexo',
  lspBaseUrl: 'https://lsp-signet.utexo.com',
  lspBearerToken: 'bearer-token',
});

const lsp = await wallet.createLsp();

await lsp.connect();
await lsp.waitForChannel(ASSET_ID, { onProgress: (m) => console.log(m) });

const { address } = await lsp.enableLightningAddress();
console.log('Lightning Address:', address);

// While the app tab is open and expecting payments: lsp.connect() periodically
// so the LSP outbox can reach the node. Settlement is automatic — see
// docs/async-payments.md.
```

Sender side:

```typescript
await senderLsp.connect();
await senderLsp.waitForChannel(ASSET_ID, { /* … */ });
await senderLsp.waitForOutboundLiquidity(3_000_000, { /* … */ });

const { pr } = await senderLsp.http.resolveAddress(username, 3_000_000, ASSET_ID, 1);
const pay = await senderWallet.payLightningInvoice({
  lnInvoice: pr,
  assetId: ASSET_ID,
  assetAmount: 1,
});

// Poll until Settled
const status = await senderWallet.getLightningSendRequest(pay.txid!);
```

Full flow → [async-payments.md](./async-payments.md).

### Claim pending HODL payments

```typescript
const claimed = await lsp.claimPendingPayments();
console.log(`Claimed ${claimed.filter((c) => c.claimed).length} HODL payments`);
```

---

## Two LSP flows explained

### `POST /lightning_receive` — on-chain RGB → Lightning

```
On-chain sender ─[RGB on-chain]→ LSP
                                   │ once RGB settles
                    User ←[LN]──── LSP
```

Use case: the user has a Lightning channel with the LSP but needs to receive RGB from a sender who can only send on-chain (exchange, faucet, another wallet without a channel). The user creates a LN invoice, the LSP issues an RGB invoice for the sender to pay, then delivers the RGB to the user over Lightning once the on-chain transfer confirms.

SDK: `lsp.receiveAsset()` + `lsp.awaitReceiveSettlement()`

### `POST /onchain_send` — Lightning → on-chain RGB

```
User ─[LN]→ LSP
              │ once LN settles
Recipient ←[RGB on-chain]── LSP
```

Use case: the user has RGB in a Lightning channel and wants to send to a recipient who only has an on-chain RGB invoice. The user submits the RGB invoice to the LSP, pays the returned LN invoice, and the LSP delivers the RGB on-chain.

SDK: `lsp.sendAsset()`

---

## Raw HTTP client

`lsp.http` is an `IUtexoLSPClient` instance. Use it for calls not covered by `UtexoLsp`:

```typescript
// Get LSP info
const info = await lsp.http.getInfo();
console.log(info.pubkey, info.numUsableChannels);

// Resolve a Lightning Address (LNURL discovery)
const { pr } = await lsp.http.resolveAddress('alice@lsp-signet.utexo.com', 3_000_000);
await wallet.payLightningInvoice({ lnInvoice: pr });

// Get the Lightning Address assigned to a peer pubkey
const addr = await lsp.http.getLightningAddressByPubkey(peerPubkey);
console.log(`${addr.username}@${addr.domain}`);
```
