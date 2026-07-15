# Examples

Code snippets demonstrating the `@utexo/rgb-sdk-web` API. Each file is a
self-contained ES module using `import` from `@utexo/rgb-sdk-web`.

> These examples show browser-compatible usage patterns. They are not
> runnable in Node.js (the package uses WebAssembly and browser APIs).
> Use them as copy-paste references when building browser apps.

## Files

| File | What it shows |
|------|---------------|
| `new-wallet.mjs` | Generate keys, `new UTEXOWallet()` + `init()` + `unlock()`, get address + BTC balance |
| `read-wallet.mjs` | Offline (xpub, network) and online (address, balance, assets) reads, `isOnline()`/`goOnline()` |
| `create-utxos-asset.mjs` | Create UTXOs and issue a NIA asset |
| `transfer.mjs` | Send RGB assets: `onchainReceive()` (witness + blind), `onchainSend()`, `refreshWallet()`, `listTransfers()` |
| `lightning-channels-keysend.mjs` | `connectPeer()`, `openChannel()` (RGB channel), wait until usable, `keysend()` (BTC + RGB), `listPayments()` |
| `lightning-payment.mjs` | Plain Lightning with a hosted node: `createLightningInvoice()` (BTC + RGB), `payLightningInvoice()`, receive/send status polling |
| `lsp-bridge.mjs` | LSP bridges via `createLsp()`: `receiveAsset()` + `awaitReceiveSettlement()` (on-chain RGB → LN), `sendAsset()` (LN → on-chain RGB) |
| `apay-lightning-address.mjs` | APay offline receive: `enableLightningAddress()` + keepalive/refill, sender `payAddress()`, automatic settlement check |
| `utexo-file-backup-restore.mjs` | File backup (`createBackup()` → `getLastBackupBytes()`) and restore (`restoreFromBackupBytes()`) |
| `utexo-vss-backup-restore.mjs` | VSS cloud backup (automatic) + explicit restore (`restoreFromVss()`) |
