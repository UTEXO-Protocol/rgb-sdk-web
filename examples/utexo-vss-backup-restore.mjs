/**
 * VSS (cloud) backup & restore.
 *
 * Backup is zero-config: the identity (signing key + store id) is derived
 * from the mnemonic at init() and every state-changing op auto-uploads a
 * wallet snapshot; channel state replicates continuously while the node
 * runs. Restore is explicit-only: restoreFromVss() in the init→unlock
 * gap (never automatic — restoring overwrites local wallet state).
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'regtest';
const MNEMONIC = 'your twelve word mnemonic phrase here ...';

// ── Normal operation: backup is automatic ───────────────────────────────────

const wallet = new UTEXOWallet({
  mnemonic: MNEMONIC,
  password: 'my-secure-password',
  network: NETWORK,
  // vssUrl: 'https://vss.example.com', // optional — DEFAULT_VSS_SERVER_URL
  // vssUrl: null,                      // disables VSS entirely
});
await wallet.init();
await wallet.unlock();

// Every state-changing op now auto-uploads in the background. Force one
// manually and inspect it:
const version = await wallet.vssBackup();
console.log('VSS backup version:', version);

const info = await wallet.vssBackupInfo();
console.log('VSS backup info:', info); // { backupExists, serverVersion, … }

await wallet.dispose();

// ── New device: explicit restore from the mnemonic ──────────────────────────

const restored = new UTEXOWallet({
  mnemonic: MNEMONIC, // same mnemonic → same VSS identity
  password: 'my-secure-password',
  network: NETWORK,
});
await restored.init(); // locked — the gap here is the restore window

// Restores the wallet stream (RGB assets, stock, BDK state) now; channel
// state restores at the unlock() that follows. The old device's fence is
// taken over BY DEFAULT — only restore when it is gone for good (wiped
// profile / dead device); if it might still be running, pass
// { takeoverFence: false } (two live writers risk channel corruption).
const result = await restored.restoreFromVss();
console.log('restored:', result); // { walletRestored, serverVersion }

await restored.unlock(); // guarded channel restore + online
console.log('channel replication health:', restored.ldkVssBackupInfo());
