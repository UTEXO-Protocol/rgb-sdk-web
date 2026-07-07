/**
 * VSS (cloud) backup.
 *
 * The VSS config needs a serverUrl, a storeId and a signing key — derive the
 * signing key from the wallet mnemonic with deriveVssSigningKeyFromMnemonic().
 * configureVssBackup() enables auto-backup; vssBackup() triggers one manually.
 */

import {
  UTEXOWallet,
  deriveVssSigningKeyFromMnemonic,
  DEFAULT_VSS_SERVER_URL,
} from '@utexo/rgb-sdk-web';

const NETWORK = 'regtest';
const MNEMONIC = 'your twelve word mnemonic phrase here ...';

const wallet = await UTEXOWallet.create({
  mnemonic: MNEMONIC,
  password: 'my-secure-password',
  network: NETWORK,
});

const config = {
  serverUrl: DEFAULT_VSS_SERVER_URL,
  storeId: 'my-store',
  signingKey: deriveVssSigningKeyFromMnemonic(MNEMONIC),
};

// Enable auto-backup, then trigger one manually and inspect it
await wallet.configureVssBackup(config);
const version = await wallet.vssBackup(config);
console.log('VSS backup version:', version);

const info = await wallet.vssBackupInfo(config);
console.log('VSS backup info:', info);

await wallet.dispose();
