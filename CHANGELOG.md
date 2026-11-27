# Changelog

## 1.0.0-beta.16 (unreleased)

Runs on `@utexo/rgb-lib-wasm` **1.0.0-beta.7** (was 1.0.0-beta.5). Wallets and
backups made with beta.5 open and keep working, receives pending at the
upgrade included.

### Breaking

- **`reuseAddresses` is removed**, as in the runtime and rgb-lib: every
  `getAddress` and `witnessReceive` gives a new address. Any value but `false`
  is `INVALID_CONFIG`. A wallet created with it keeps its funds and pending
  receives on the addresses it already gave out.
- `getConsignment` of a transfer without a consignment is now
  `CONSIGNMENT_NOT_FOUND` (was `NATIVE_ERROR`), as on React Native.
- `getReceivedMint` rejects with `CONSIGNMENT_NOT_FOUND` when it cannot read
  the asset from the checked consignment (see Added). beta.5 dropped a
  receive's consignment once it settled, so this includes a mint that settled
  before the upgrade; mints pending at the upgrade keep theirs.
- `RgbLibWasmRuntime` needs `inspectConsignment`, and `RgbLibWasmWallet` has
  `getConsignment(transferIdx)` instead of `getBurnConsignment`: a custom
  runtime passed as `runtime` must follow.

### Added

- **`getReceivedMint` returns `assetId`**, as on React Native: read from the
  consignment the runtime checked, which must hold the mint's `opid`
  (`CONSIGNMENT_NOT_FOUND` otherwise). A mint for an invoice without an asset
  now works over WebRGB.
- **`getConsignment(assetId, txid)` serves any transfer**, as on React Native:
  the sent consignment of a send, burn or mint, the received and validated one
  of a receive. It was burns only. beta.5 did not keep the consignment of a
  send it ended or a receive that settled, so for those made before the
  upgrade it is `CONSIGNMENT_NOT_FOUND`. So is a `txid` whose transfers of
  the asset carry different consignments.
- Error code `CONSIGNMENT_NOT_FOUND`.

## 1.0.0-beta.15

Needs `@utexo/rgb-sdk-core` 1.0.0-beta.11.
Runs on `@utexo/rgb-lib-wasm` **1.0.0-beta.5** (was 1.0.0-beta.4).

### Breaking

- **Wallet state from beta.4 does not open.** The beta.5 snapshot has
  required fields beta.4 never wrote, so `init()` rejects (`NATIVE_ERROR`,
  "Deserialize error: missing field …") on a profile that holds beta.4 state
  for that wallet, and a byte or VSS backup made with beta.4 does not restore.
  Before upgrading a wallet that holds RGB assets, send them to a wallet
  created with beta.5: a mnemonic alone recovers only bitcoin.
- Opening a wallet that is already open in another tab or instance of the same
  browser profile now rejects with `WALLET_STORAGE_IN_USE` (see Added).

### Fixed

- **Mainnet wallets open again.** rgb-lib refuses a mainnet wallet that
  supports IFA or BFA unless `allowRecklessSchemas` is set, and the wallet
  always asked for every schema with the flag off, so `init()` failed with
  `Cannot use Ifa schema on mainnet`. A mainnet wallet now opens with NIA only
  unless `allowRecklessSchemas` is `true` (see Added).

### Added

- **`allowRecklessSchemas`** option, default `false`, as in rgb-lib and on
  React Native. With `true`, a mainnet wallet opens with every schema. Without
  it, on mainnet, `issueAssetIfa`, `inflate`, `burn`, the inflate and burn
  begin/end steps, `getConsignment` and `getReceivedMint` reject with
  `UNSUPPORTED_CAPABILITY` before any runtime call, and `getBfaCapabilities()`
  is all `false`. Other networks are unchanged.
- **`getAssetMetadata(assetId)`** (core's `AssetMetadataApi`) returns the
  contract metadata: schema, name, ticker, precision, details, timestamp and
  the initial, maximum and known circulating supply as exact decimal strings,
  plus `rejectListUrl` and the linked contracts when set. It is offline; an unknown asset is `ASSET_NOT_FOUND`. WebRGB's
  `getAssetMetadata` uses it.
- **One open wallet per browser profile** — `init()` takes a Web Lock on the
  wallet's IndexedDB state until `destroy()`. A second open of the same wallet
  (keys, network, `dataDir`) rejects at once with `WALLET_STORAGE_IN_USE`, the
  React Native code, instead of two tabs overwriting each other's state.
  Without the Web Locks API the wallet opens without the lock.
- **`signal` (web only)** — `createUtxos`, `sendBtc`, `onchainSend`,
  `inflate`, `burn`, the `beginEnd` begin steps, `refresh`, `refreshWallet`,
  `syncWallet`, `getReceivedMint` and `unlock(params, { signal })` take an
  optional `AbortSignal`. When it fires, the call rejects with the new code
  `ABORTED` and the wallet is left as before the call; an end step that
  broadcast is never reported as aborted. `RgbLibWebCallOptions` is exported.
- **`getConsignment(assetId, txid)`** (core's `ConsignmentApi`) returns the
  consignment of an ended burn as base64, as on React Native: WebRGB's burn
  proof. Burns only; another txid is `NATIVE_ERROR`.
  `getBfaCapabilities().consignment` is now `true` while the wallet is open.
- **`checkIndexerUrl(url)`** (core's `IndexerCheckApi`) resolves with
  `{ indexerProtocol: 'esplora' }`; an Electrum URL is
  `UNSUPPORTED_CAPABILITY`.
- **`witnessVersion`** option: `'taproot'` (default) or `'segwit-v0'`, as on
  React Native. It is part of the wallet ID (the same ID as React Native for
  the same keys).

### Changed

- `syncWallet()` syncs the colored keychain, then the vanilla one with a
  lookback of 20, as React Native does; reads that sync (`getBtcBalance`,
  `listUnspents`, `listTransactions` without `skipSync`) sync inside the
  runtime. The connection sets React Native's `vanillaSyncLookback` (20) and
  `failedWitnessReceiveGraceSecs` (one day).
- BFA assets: `knownCirculatingSupply` replaces `initialSupply` (the runtime
  dropped it). An asset whose reject list is an EVM contract has no
  `rejectListUrl`.
- A transfer's change is `changeUtxos` (a list) in the runtime; the public
  transfer is unchanged.

## 1.0.0-beta.14

Needs `@utexo/rgb-sdk-core` with `ReceivedMintApi` (1.0.0-beta.11).

### Added

- `getReceivedMint(recipientId, options?)` (core's `ReceivedMintApi`) returns the checked BFA mint paying a recipient ID (`opid`, `lockId`, `amount`, `beforeBlock`, `evmChainId`, `bridgeContract`; u64 values as exact decimal strings) or `undefined`. It is offline; `{ refreshIncoming: true }` first refreshes pending incoming transfers only, so no send or burn is progressed; a refresh failure reported for that receive rejects (`NATIVE_ERROR`) instead of reading as no mint. Receiving a mint needs the chain's `evmRpcUrls` entry.
- **Prepare, approve, submit** — `wallet.beginEnd` is now present: core's begin/end flows plus `burnBegin(params)` and `burnEnd({ signedPsbt })`. `burnBegin` returns the unsigned `psbt`, `txid`, `batchTransferIdx`, exact `fee` (sat), `vbytes` and `feeRate`, and signs nothing. Calling `onchainSendEnd`, `inflateEnd` or `burnEnd` again with the same signed PSBT resolves with the result if the operation was already submitted.
- `wallet.psbt` (`signPsbt`, `estimateFee`) is present on a wallet with the mnemonic and absent on a watch-only wallet. `signPsbt` signs with the wallet's own keys and refuses a `mnemonic` argument.

### Changed

- `capabilities.beginEndFlows` is now `true`, and `capabilities.psbtSigning` is `true` unless the wallet is watch-only.

## 1.0.0-beta.13

### Added

- **Burn** — `RgbLibWeb` implements `BurnApi`: `burn({ assetId, amount,
burnRecipient?, feeRate, minConfirmations })` (begin, sign, end over
  `@utexo/rgb-lib-wasm`) and `getBfaCapabilities()`. Params are checked by
  core's `validateBurnParams`; a watch-only wallet rejects with
  `UNSUPPORTED_CAPABILITY`. `consignment` is `false`: beta.4 has no
  consignment export, so `getConsignment()` is absent.

### Fixed

- **IFA assets (e.g. USDT) can be received** — `@utexo/rln-wasm` bumped from
  `0.10.0-beta.3` to `0.15.0-beta.3`. The old build carried a stale IFA schema
  ID, so a receiving wallet silently rejected every incoming IFA transfer: no
  ACK was posted, the sender's transfer stayed `WaitingCounterparty` and the
  receiver never got the asset (rgb-lightning-node#126, fixed in
  rgb-lib-wasm#25)

### Changed

- **Lightning APIs are rejected on mainnet** — with the new `rln-wasm`, Lightning
  operations (peers, channels, invoices, payments) on a mainnet wallet fail with
  `LightningUnsupportedOnMainnet` instead of running. On-chain APIs are
  unaffected, and the SDK ships no mainnet defaults

## 1.0.0-beta.11

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
  - `RlnSigner`
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
