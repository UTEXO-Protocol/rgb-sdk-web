# Backup and restore in detail

The [README](../Readme.md#backup-and-restore) covers everyday use. This page
lists the full rules.

## VSS backup

VSS (cloud) backup is on by default, with no setup. On regtest it is off
unless `vssUrl` or `vss` names a server, so test wallets do not upload to the
production server. `vssUrl: null` turns it off on any network.

- `init()` derives the identity from the mnemonic with the core helpers:
  store `wallet_<masterFingerprint>`, signing key from the mnemonic. The key
  goes to the runtime only; it is not kept, logged or put in errors.
- Each successful mutation (create UTXOs, send, issue, inflate, burn, receive, fail
  transfers, refresh) queues one upload. It runs as its own task after the
  mutation, uploads only when the wallet changed, and a failure is logged
  (`logger.warn`) without failing anything. `destroy()` waits for it.
- Nothing is uploaded on `init()`: a restore may still run before the wallet
  connects.
- `backupToVss()` uploads now and returns the server version.
- `getVssBackupInfo()` reads the server state: `{ backupExists,
serverVersion, backupRequired, lastBackupError }`.
- A watch-only wallet has no mnemonic, so it gets VSS only with `vss`.

## Restore from VSS

```ts
const wallet = new RgbLibWeb({
  network: 'testnet',
  mnemonic,
  dataDir: 'my-app',
});
await wallet.init(); // opened from IndexedDB, not online yet
await wallet.restoreFromVss(); // the VSS backup of this mnemonic, saved locally
await wallet.unlock(); // online
```

- `restoreFromVss()` runs only after `init()` and before the first
  connection (`unlock()` or any online call); later it rejects with
  `WALLET_INVALID_STATE`. To restore later, destroy the wallet, create it
  again and restore before `unlock()`.
- A wallet with local data (assets, transfers, UTXOs or transactions) is
  refused unless `{ overwrite: true }`, so a restore never wipes newer local
  state by accident.
- **Unrestored backup.** On the first connection of a wallet that was empty
  before it (judged before the connect: its chain scan brings in the UTXOs of
  this mnemonic) and was not restored, the engine asks the server whether a
  backup exists. If one does, it belongs to this mnemonic from another
  device: the engine logs a warning and holds automatic uploads, so the first
  mutation does not replace it. `backupToVss()` lifts the hold and replaces the
  server copy on purpose.
- The core logger prints only errors by default. To see the VSS warnings
  (a held upload, a failed automatic backup), raise its level:
  `logger.setLevel(LogLevel.WARN)` from `@utexo/rgb-sdk-core`.

## Byte backup

`exportBackup()` and `restoreBackup()` (`BackupExportApi` and
`BackupRestoreApi` from core) move an encrypted backup as bytes, with no
server.

- `exportBackup()` works offline, on any wallet, watch-only included.
- `restoreBackup()` follows the rules of `restoreFromVss()`: only between
  `init()` and the first connection, and `{ overwrite: true }` for a wallet
  with local data. The restored state is saved to IndexedDB before it
  resolves.
- A missing or empty password, or `bytes` that are not a nonempty
  `Uint8Array`, is `INVALID_CONFIG`. Damaged bytes are `INVALID_PARAMS`; a
  wrong password is `NATIVE_ERROR` ("Wrong password"). A failed restore
  changes nothing.
- A backup restores only with this engine; backups made by other engines do
  not open here.
- The `UTEXOWallet` facade forwards all backup methods.
