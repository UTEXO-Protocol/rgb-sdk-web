# Test Suite

Unit tests for `@utexo/rgb-sdk-web`. Run from repo root after `npm run build`.

```bash
npm test                 # build + run all tests
npm run test:watch       # build + run in watch mode
npm run test:coverage    # build + run with coverage report
```

Single file:
```bash
NODE_OPTIONS='--experimental-vm-modules' npx jest tests/signer.test.ts
```

---

## Test Files

### `keys.test.ts`

Pure JS key derivation — no WASM or network required.

- `generateKeys` — valid keys for testnet, mainnet, regtest
- `deriveKeysFromMnemonic`, `deriveKeysFromSeed`, `deriveKeysFromXpriv`
- `getXprivFromMnemonic`, `getXpubFromXpriv`
- `restoreKeys` (deprecated alias)
- Validation and error handling

### `signer.test.ts`

Pure JS PSBT and message signing — no WASM or network required.

- `signPsbt` — signs UTXO creation and send PSBTs
- `signPsbtFromSeed` — signs using seed (hex or Uint8Array)
- `signMessage` / `verifyMessage` — Schnorr message signing
- `estimatePsbt` — fee estimation
- Validation and edge cases

### `restore.test.ts`

Browser restore utilities — validation only, no WASM mock needed (validation errors are thrown before any WASM call).

- `getBackupStoreId` — returns `wallet_<fp>` format
- `restoreUtxoWalletFromBackup` validation — throws on missing `layer1Bytes`, `utexoBytes`, `password`, `mnemonic`

### `utexo-mocked.test.ts`

Restore flow with mocked `WasmRgbLibBinding`. Verifies that `restoreUtxoWalletFromBackup` creates WASM bindings for both layer1 and utexo wallets, calls `restoreFromBackupBytes` with the correct bytes and password, and cleans up with `dropWallet`.

Uses `jest.unstable_mockModule` for ESM compatibility.

### `utexo-flows.test.ts`

Structure tests for `UTEXOWallet` — verifies all expected methods exist on the prototype. Imports from `dist/` and requires a prior `npm run build`. Does not require network or WASM.

Covers: core lifecycle, keys, balance, UTXO management, assets, transfers, sync, fee estimation, backup, signing.

### `utexo-wallet-mocked.test.ts`

`UTEXOWallet` behaviour tests with mocked `WalletManager`. Verifies that delegated calls return the expected mock values. No network or WASM required.

Covers: `getAddress`, `getBtcBalance`, `listAssets`, `listTransfers`, `listTransactions`, `listUnspents`, `getAssetBalance`, `blindReceive`, `witnessReceive`, `getXpub`, `getNetwork`, and Promise return types for all async methods.
