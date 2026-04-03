/**
 * VSS (cloud) backup and restore.
 *
 * Backup: initialize wallet, call vssBackup() — state is uploaded to the VSS server.
 * Restore: call restoreUtxoWalletFromVss() — state is written to IndexedDB.
 *          Then initialize a new UTEXOWallet normally; it picks up the restored state.
 */

import { UTEXOWallet, restoreUtxoWalletFromVss } from '@utexo/rgb-sdk-web';

const NETWORK = 'testnet';
const MNEMONIC = 'your twelve word mnemonic phrase here ...';

// ── Backup ────────────────────────────────────────────────────────────────────

const wallet = new UTEXOWallet(MNEMONIC, { network: NETWORK });
await wallet.initialize();

await wallet.vssBackup();
const info = await wallet.vssBackupInfo();
console.log('VSS backup info:', info);

await wallet.dispose();

// ── Restore ───────────────────────────────────────────────────────────────────
// Restores state from VSS into IndexedDB. Run this on a fresh page / new device.

await restoreUtxoWalletFromVss({ mnemonic: MNEMONIC, networkPreset: NETWORK });

const restoredWallet = new UTEXOWallet(MNEMONIC, { network: NETWORK });
await restoredWallet.initialize();

console.log('Restored address:', await restoredWallet.getAddress());
await restoredWallet.dispose();
