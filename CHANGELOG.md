# Changelog

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
