# Changelog

## Unreleased

### Breaking

All four align the web surface with `@utexo/rgb-sdk-rn` (RN parity), so app code
ports across web ↔ RN unchanged.

- **`openChannel` now opens _and funds_ the channel** — `openChannel(params, opts?)`
  returns `Promise<WebOpenChannelResult>` (`{ temporaryChannelId, fundingTxid?,
  fundingTxHex? }`) instead of `Promise<string>` (bare temporary channel id).
  It polls for the funding request, builds and signs the funding tx (BDK) and
  submits it, resolving once the funding tx is submitted (poll `listChannels()`
  for readiness). Previously it only opened the channel and left it unfunded.
  `opts` accepts `{ fundingTimeoutMs?, pollIntervalMs? }`. RN's node funds
  channels internally and returns the shared `OpenChannelResult`;
  `WebOpenChannelResult` is a superset that adds the web-only funding fields.
  Migration: `const { temporaryChannelId } = await wallet.openChannel(params)`
- **`connectPeer(peerUri)` takes a single `'pubkey@host:port'` string** instead
  of `connectPeer(peerAddr, peerPubkey)`. Matches RN's `connectPeer(peerPubkeyAndAddr)`.
  Migration: `wallet.connectPeer('<pubkey>@<host>:<port>')`
- **`closeChannel(...)` is now `async` (`Promise<void>`)** — was synchronous (`void`)
- **`invoiceStatus()` / `getLightningReceiveStatus()` return `RlnInvoiceStatus`**
  (`'Pending' | 'Claimable' | 'Claiming' | 'Succeeded' | 'Cancelled' | 'Failed' |
  'Expired'`) instead of the legacy `InvoiceStatus` (`'Paid'`). Send-side
  `getLightningSendStatus()` likewise returns `RlnPaymentStatus | null`

### Changed

- **`RlnWalletManager` is now standalone** — it no longer extends
  `BaseWalletManager` (removed). `binding` and `signer` are required and
  non-null; every public method stays `async` so validation/disposal failures
  surface as promise rejections
- **Wallet contract consolidated on `IUTEXOWallet`** — the `IWalletManager` /
  `IUTEXOProtocol` interface family is gone. `UTEXOWallet` implements the shared
  `IUTEXOWallet` contract whole, with platform-specific surface (PSBT signing,
  begin/end flows) on the optional `psbt` / `beginEnd` carriers
- **LSP moved to core** — `UtexoLsp` / `UtexoLSPClient` and the LSP types are now
  re-exported from `@utexo/rgb-sdk-core` (previously `src/lsp/`); the public API
  of this package is unchanged
- Source comments and JSDoc trimmed to state contracts and invariants only;
  README method-reference headings no longer name the removed interfaces

## 1.0.0-beta.10

**Breaking — RLN-only architecture.** The SDK now runs entirely in the browser
through `rln-wasm-sdk` (rgb-lightning-node WASM), covering **native Lightning** in
addition to RGB on-chain. No external RGB Node server is required. The previous
`@utexo/rgb-lib-wasm` stack has been removed.

### Added

- **Native Lightning** — invoices, payments, channels, keysend, and HODL invoices
  via `RlnNodeBinding` (`src/lightning/RlnNodeBinding.ts`) over a direct `RlnWasmNode`
- **LSP support** — `UtexoLSPClient` / `UtexoLsp` (`src/lsp/`) with typed models and
  errors for the UTEXO LSP bridge (see `docs/lsp.md`)
- **Async payments** — documented in `docs/async-payments.md`
- `RlnWasmBinding` (`src/binding/RlnWasmBinding.ts`) — `IRlnSdkBinding` impl using a
  single `RlnWasmWallet` for wallet ops plus a direct `RlnWasmNode` for Lightning and
  NIA/CFA issuance
- `RlnNodeBinding` — `IRlnNodeBinding` impl wrapping `RlnWasmNode`
- `RlnWalletManager` (`src/wallet/rln-wallet-manager.ts`) — extends `BaseWalletManager`
  + `RlnSigner`
- `RlnSigner` (`src/signer/RlnSigner.ts`) — `ISigner`; delegates PSBT signing to the
  BDK path (`@bitcoindevkit/bdk-wallet-web`)
- `initRlnWasm()` (`src/wasm/initRln.ts`) — singleton WASM initializer, called
  internally by `RlnWasmBinding.create()`
- Vendored RLN contracts: `src/types/rln-model.ts`, `src/interfaces/IRln*.ts`, and
  `src/binding/RlnDefaults.ts` (`DEFAULT_RLN_URLS` / `DEFAULT_INDEXER_URLS`),
  re-exported via the `src/rln` barrel
- **VSS cloud backup — zero-config, automatic** — identity (signing key +
  `wallet_<masterFingerprint>` store id) is derived from the mnemonic at `init()`;
  the server defaults to `DEFAULT_VSS_SERVER_URL` (`vssUrl` param to override,
  `null` to disable). Every state-changing op uploads an encrypted wallet
  snapshot in the background, and LDK/channel state (channel monitors/manager,
  per-channel RGB state) replicates continuously to a separate `-ldk` stream
  while the node runs
- **Explicit one-call VSS restore** — `restoreFromVss({ takeoverFence? })` in the
  init→unlock gap restores the wallet stream immediately (returns
  `{ walletRestored, serverVersion }`, throws on failure — no silent fresh
  start); channel state restores at the `unlock()` that follows. Restore is
  never automatic. `takeoverFence` defaults to `true` (a wiped/dead device can
  never release its single-writer fence); pass `false` when the old device may
  still be running. `RlnVssRestoreResult` type exported
- **VSS safety rails** — `unlock()` on a fresh wallet logs a loud warning when an
  unrestored cloud backup exists (the next auto-backup would overwrite it);
  `vssClearFence()` for a bare fence clear (RN parity); `ldkVssBackupInfo()`
  channel-replication health (a held fence surfaces in `lastError`; recover with
  `disableLdkVssReplication()` → `vssClearFence()` → `unlock()`)
- New examples: `apay-lightning-address`, `lightning-payment`,
  `lightning-channels-keysend`, `lsp-bridge`, `utexo-vss-backup-restore`

### Changed

- Swapped WASM backend: dropped `@utexo/rgb-lib-wasm`, added `rln-wasm-sdk`;
  `@utexo/rgb-sdk-core` now resolves via a local `file:` link
- Reworked `UTEXOWallet` (`src/utexo/utexo-wallet.ts`) as the single public API
  implementing `IWalletManager` + `IUTEXOProtocol`, mirroring `@utexo/rgb-sdk-rn` so
  app code ports across web ↔ RN
  - **Three-phase lifecycle (RN parity)**: `new UTEXOWallet(params)` stores params
    synchronously; `await wallet.init()` does all local setup and returns the
    wallet LOCKED; the init→unlock gap is the explicit VSS-restore window;
    `await wallet.unlock()` validates the password and brings it online. Both
    phases are idempotent and retryable; `UTEXOWallet.create(params)` does all
    three and `initialize()` aliases init + unlock
  - **One-call UX**: `indexerUrl` / `transportEndpoint` / `proxyUrl` default per
    network, and `create` auto-connects to the indexer non-fatally (unreachable
    indexer → offline wallet + warning; check `isOnline()`, retry with `goOnline()`)
  - `send` / `onchainSend` / `payLightningInvoice` are atomic — signed with the stored
    mnemonic via `RlnSigner`

### Removed

- `@utexo/rgb-lib-wasm` dependency and its stack: `WasmRgbLibBinding`, `WasmTypes`,
  `WasmSigner`, `src/wasm/init.ts`, the old dual-wallet `WalletManager`, and
  `src/utexo/restore.ts`
- Legacy tests: `restore.test.ts`, `utexo-mocked.test.ts`,
  `utexo-wallet-mocked.test.ts`, `wallet-init-params.test.ts`, and the `rgb-lib-wasm`
  mock. `tests/utexo-flows.test.ts` updated to assert the new `UTEXOWallet` surface

## 1.0.0-beta.9

### Added

- `WalletInitParams.reuseAddresses` — optional `boolean` (default `false`); passed to `WasmWallet` as `reuse_addresses` to pin addresses per keychain instead of rotating automatically
- `WalletInitParams.vanillaKeychain` — optional `number | null` (default `0`); controls the BIP32 keychain index used for the vanilla (BTC) wallet
- `WalletInitParams.maxAllocationsPerUtxo` — optional `number` (default `5`); forwarded to `WasmWallet` as `max_allocations_per_utxo`
- `WasmRgbLibBinding.rotateVanillaAddress()` — rotates the pinned vanilla address (`rotate_address(0)`); requires wallet created with `reuseAddresses: true`
- `WasmRgbLibBinding.rotateColoredAddress()` — rotates the pinned colored address (`rotate_address(1)`); requires wallet created with `reuseAddresses: true`
- `WalletManager` forwards all three new params to `WasmRgbLibBinding.create()`
- Jest test suite (`tests/wallet-init-params.test.ts`) covering default values and forwarding of all new fields, plus `rotateVanillaAddress` / `rotateColoredAddress` behavior

### Changed

- `rotateAddress(keychain: number)` removed in favor of the explicit `rotateVanillaAddress()` / `rotateColoredAddress()` split, matching the Node.js rgb-lib binding API

## 1.0.0

Initial release of `@utexo/rgb-sdk-web` — a browser-first rewrite of the RGB SDK.

### Added

- `WalletManager` — async factory (`WalletManager.create(params)`) wrapping `WasmRgbLibBinding` and `WasmSigner`
- `UTEXOWallet` — higher-level dual-wallet (layer1 BTC + utexo RGB) extending `UTEXOWalletCore` from `@utexo/rgb-sdk-core`
- `WasmRgbLibBinding` — `IRgbLibBinding` implementation backed by `@utexo/rgb-lib-wasm` (WasmWallet)
- `WasmSigner` — `ISigner` implementation delegating PSBT signing to the embedded WasmWallet mnemonic
- `initWasm()` — singleton WASM initializer; called automatically by `WasmRgbLibBinding.create()`
- `decodeRGBInvoice(params)` — invoice decoding via `WasmInvoice` (new in `@utexo/rgb-lib-wasm`)
- `sendBegin(params)` — send from invoice string; decodes invoice internally to build the recipient map
- `sendBeginBatch(params)` — send from a pre-built `RecipientMap`
- `WasmTypes` — supplemental TypeScript types (`WasmJson.*`) matching the raw snake_case WASM JSON shapes
- `restoreUtxoWalletFromBackup(params)` — restore dual-wallet state from encrypted `Uint8Array` bytes into IndexedDB
- `restoreUtxoWalletFromVss(params)` — restore wallet state from VSS cloud backup
- Browser HTML examples (`wallet-manager.html`, `utexo-wallet.html`, `rgb.html`, `bitcoin.html`, `backup.html`) served via `npm run examples` (Vite on `:8888`)
- ESM-only build via `tsup` → `dist/index.mjs` + `dist/index.d.ts`

### Architecture

- Browser-only — no Node.js built-ins; wallet state persisted to IndexedDB via the WASM layer
- All RGB operations run locally in WebAssembly; no external RGB Node server required
- Monorepo siblings: `@utexo/rgb-lib-wasm` (WasmWallet) and `@utexo/rgb-sdk-core` (shared base classes, types, error hierarchy)
