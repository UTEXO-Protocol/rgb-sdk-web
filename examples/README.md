# Examples

Code snippets demonstrating the `@utexo/rgb-sdk-web` API. Each file is a
self-contained ES module using `import` from `@utexo/rgb-sdk-web`.

> These examples show browser-compatible usage patterns. They are not
> runnable in Node.js (the package uses WebAssembly and browser APIs).
> Use them as copy-paste references when building browser apps.

## Files

| File | What it shows |
|------|---------------|
| `new-wallet.mjs` | Generate keys, `UTEXOWallet.create()`, get address + BTC balance |
| `read-wallet.mjs` | Offline (xpub, network) and online (address, balance, assets) reads, `isOnline()`/`goOnline()` |
| `create-utxos-asset.mjs` | Create UTXOs and issue a NIA asset |
| `transfer.mjs` | Send RGB assets: `onchainReceive()` (witness + blind), `onchainSend()`, `refreshWallet()`, `listTransfers()` |
| `utexo-file-backup-restore.mjs` | File backup (`createBackup()` → `getLastBackupBytes()`) and restore (`restoreFromBackupBytes()`) |
| `utexo-vss-backup-restore.mjs` | VSS cloud backup (`configureVssBackup()` + `vssBackup()`) |
