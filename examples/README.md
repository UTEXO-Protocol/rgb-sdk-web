# Examples

Code snippets demonstrating the `@utexo/rgb-sdk-web` API. Each file is a
self-contained ES module using `import` from `@utexo/rgb-sdk-web`.

> These examples show browser-compatible usage patterns. They are not
> runnable in Node.js (the package uses WebAssembly + IndexedDB).
> Use them as copy-paste references when building browser apps.

## Files

| File | What it shows |
|------|---------------|
| `new-wallet.mjs` | Generate keys, create + initialize a `UTEXOWallet`, get address + BTC balance |
| `read-wallet.mjs` | Offline (xpub, address) and online (balance, assets) read operations |
| `create-utxos-asset.mjs` | Create UTXOs and issue a NIA asset |
| `transfer.mjs` | Send RGB assets: blind + witness receive invoices, `send()`, `refreshWallet()`, `listTransfers()` |
| `utexo-vss-backup-restore.mjs` | VSS cloud backup (`vssBackup()`) and restore (`restoreUtxoWalletFromVss()`) |
| `utexo-file-backup-restore.mjs` | File backup (`createBackup()` → `Uint8Array`) and restore (`restoreUtxoWalletFromBackup()`) |
