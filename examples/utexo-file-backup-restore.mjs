/**
 * File backup and restore using Uint8Array bytes.
 *
 * Backup: createBackup() then getLastBackupBytes() — a single encrypted blob.
 *         Store it however suits your app (file download, cloud upload, etc.).
 * Restore: restoreFromBackupBytes(bytes, password) — updates the active
 *          wallet's in-memory state.
 *
 * Example: trigger a file download in the browser
 *   const blob = new Blob([bytes], { type: 'application/octet-stream' });
 *   const url = URL.createObjectURL(blob);
 *   const a = document.createElement('a'); a.href = url; a.download = 'wallet.backup'; a.click();
 */

import { UTEXOWallet } from '@utexo/rgb-sdk-web';

const NETWORK = 'regtest';
const MNEMONIC = 'your twelve word mnemonic phrase here ...';
const PASSWORD = 'my-secure-password';
const BACKUP_PASSWORD = 'backup-password';

// ── Backup ────────────────────────────────────────────────────────────────────

const wallet = await UTEXOWallet.create({
  mnemonic: MNEMONIC,
  password: PASSWORD,
  network: NETWORK,
});

await wallet.createBackup({ backupPath: '', password: BACKUP_PASSWORD });
const bytes = wallet.getLastBackupBytes(); // Uint8Array | null
console.log('backup bytes:', bytes?.byteLength);
// → store or download `bytes`

// ── Restore ───────────────────────────────────────────────────────────────────
// Provide the bytes retrieved from your storage / file input.

const restoredWallet = await UTEXOWallet.create({
  mnemonic: MNEMONIC,
  password: PASSWORD,
  network: NETWORK,
});
restoredWallet.restoreFromBackupBytes(bytes, BACKUP_PASSWORD);

console.log('Restored address:', await restoredWallet.getAddress());
await restoredWallet.dispose();
await wallet.dispose();
