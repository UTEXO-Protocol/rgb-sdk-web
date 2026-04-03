/**
 * File backup and restore using Uint8Array bytes.
 *
 * Backup: createBackup() returns { layer1Bytes, utexoBytes } as Uint8Array.
 *         Store them however suits your app (file download, cloud upload, etc.).
 * Restore: pass the bytes back to restoreUtxoWalletFromBackup() — state is
 *          written to IndexedDB. Then initialize a new UTEXOWallet normally.
 *
 * Example: trigger a file download in the browser
 *   const blob = new Blob([layer1Bytes], { type: 'application/octet-stream' });
 *   const url = URL.createObjectURL(blob);
 *   const a = document.createElement('a'); a.href = url; a.download = 'layer1.backup'; a.click();
 */

import { UTEXOWallet, restoreUtxoWalletFromBackup } from '@utexo/rgb-sdk-web';

const NETWORK = 'testnet';
const MNEMONIC = 'your twelve word mnemonic phrase here ...';
const PASSWORD = 'secure-password';

// ── Backup ────────────────────────────────────────────────────────────────────

const wallet = new UTEXOWallet(MNEMONIC, { network: NETWORK });
await wallet.initialize();

const { layer1Bytes, utexoBytes } = await wallet.createBackup({ password: PASSWORD });
console.log('layer1 backup bytes:', layer1Bytes.byteLength);
console.log('utexo backup bytes:', utexoBytes.byteLength);
// → store or download layer1Bytes and utexoBytes

await wallet.dispose();

// ── Restore ───────────────────────────────────────────────────────────────────
// Provide the bytes retrieved from your storage / file input.

await restoreUtxoWalletFromBackup({
  layer1Bytes,
  utexoBytes,
  password: PASSWORD,
  mnemonic: MNEMONIC,
  networkPreset: NETWORK,
});

const restoredWallet = new UTEXOWallet(MNEMONIC, { network: NETWORK });
await restoredWallet.initialize();

console.log('Restored address:', await restoredWallet.getAddress());
await restoredWallet.dispose();
