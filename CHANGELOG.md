# Changelog

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
