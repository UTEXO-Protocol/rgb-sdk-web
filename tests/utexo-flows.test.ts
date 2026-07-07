/**
 * UTEXOWallet API structure tests.
 *
 * Verifies the RLN-backed UTEXOWallet exposes the IWalletManager + IUTEXOProtocol
 * surface (mirroring @utexo/rgb-sdk-rn) plus the RLN/Lightning extras. These are
 * shape-only checks (method presence) — no WASM is instantiated.
 */
import { UTEXOWallet } from '../dist/index.mjs';

const hasMethod = (name: string) =>
  it(`UTEXOWallet should have ${name} method`, () => {
    expect(typeof (UTEXOWallet.prototype as any)[name]).toBe('function');
  });

describe('UTEXOWallet API', () => {
  describe('lifecycle', () => {
    [
      'initialize',
      'goOnline',
      'getXpub',
      'getNetwork',
      'dispose',
      'isDisposed',
    ].forEach(hasMethod);
  });

  describe('balance & address', () => {
    [
      'getBtcBalance',
      'getAddress',
      'rotateVanillaAddress',
      'rotateColoredAddress',
    ].forEach(hasMethod);
  });

  describe('UTXO management', () => {
    [
      'listUnspents',
      'createUtxosBegin',
      'createUtxosEnd',
      'createUtxos',
    ].forEach(hasMethod);
  });

  describe('assets', () => {
    [
      'listAssets',
      'getAssetBalance',
      'issueAssetNia',
      'issueAssetIfa',
      'issueAssetCfa',
      'inflateBegin',
      'inflateEnd',
      'inflate',
    ].forEach(hasMethod);
  });

  describe('sending', () => {
    // RGB sends are exposed only under the RN-parity onchainSend* names
    // (see "IUTEXOProtocol — onchain" below).
    ['sendBtcBegin', 'sendBtcEnd', 'sendBtc', 'sendRgbFromGroups'].forEach(
      hasMethod
    );
  });

  describe('receiving', () => {
    ['blindReceive', 'witnessReceive', 'decodeRGBInvoice'].forEach(hasMethod);
  });

  describe('transactions & transfers', () => {
    [
      'listTransactions',
      'listTransfers',
      'failTransfers',
      'refreshWallet',
      'syncWallet',
    ].forEach(hasMethod);
  });

  describe('backup & vss', () => {
    [
      'configureVssBackup',
      'disableVssAutoBackup',
      'vssBackup',
      'vssBackupInfo',
      'createBackup',
      'getLastBackupBytes',
      'restoreFromBackupBytes',
    ].forEach(hasMethod);
  });

  describe('fee & crypto', () => {
    [
      'estimateFeeRate',
      'estimateFee',
      'signPsbt',
      'signMessage',
      'verifyMessage',
    ].forEach(hasMethod);
  });

  describe('IUTEXOProtocol — lightning', () => {
    [
      'createLightningInvoice',
      'payLightningInvoice',
      'listLightningPayments',
      'getLightningReceiveRequest',
      'getLightningSendRequest',
    ].forEach(hasMethod);
  });

  describe('IUTEXOProtocol — onchain', () => {
    [
      'onchainReceive',
      'onchainSend',
      'onchainSendBegin',
      'onchainSendEnd',
      'listOnchainTransfers',
    ].forEach(hasMethod);
  });

  describe('lightning node extras', () => {
    [
      'getLightningNode',
      'getNodePubkey',
      'getNodeInfo',
      'getNetworkInfo',
      'connectPeer',
      'disconnectPeer',
      'listPeers',
      'listChannels',
      'openChannel',
      'closeChannel',
      'keysend',
      'listPayments',
      'getPayment',
      'decodeLnInvoice',
      'invoiceStatus',
      'createHodlLnInvoice',
      'claimHodlInvoice',
      'cancelHodlInvoice',
    ].forEach(hasMethod);
  });

  describe('APay + LSP', () => {
    [
      'apayNew',
      'apayNewWithAddress',
      'listPaymentsRaw',
      'createLsp',
      'getLspConfig',
    ].forEach(hasMethod);
  });
});
