// Public API: the RgbLibWeb class, the 29 SharedWalletApi methods and the
// backup extensions (BackupExportApi, BackupRestoreApi, VssBackupApi,
// VssRestoreApi, VssBackupInfoApi). Each method passes through `backend.guarded()`
// (synchronous argument errors become rejected Promises) to RgbLibWebBackend;
// no wallet logic here.
// Called by: apps and the UTEXOWallet facade. Depends on: `backend.ts`, `config.ts`.

import type {
  EngineCapabilities,
  FailTransfersRequest,
  InflateAssetIfaRequestModel,
  IssueAssetIfaRequestModel,
  IssueAssetNiaRequestModel,
  ListAssetsOptions,
  OnchainReceiveParams,
  OnchainSendRequestModel,
  ReadOptions,
  ReceiveParams,
  SendBtcBeginRequestModel,
  BackupExportApi,
  BackupRestoreApi,
  SharedWalletApi,
  VssBackupApi,
  VssBackupInfo,
  VssBackupInfoApi,
  VssRestoreApi,
} from '@utexo/rgb-sdk-core';
import { RgbLibWebBackend } from './backend.js';
import { splitConfig } from './config.js';
import type { RgbLibWebConfig, RgbLibWebUnlockParams } from './config.js';

/**
 * The RGB_L1 engine for browsers, over `@utexo/rgb-lib-wasm`. It implements
 * the 29 `SharedWalletApi` methods and the backup extensions (ADR-0003):
 * `exportBackup()`, `restoreBackup()` (bytes) and `backupToVss()`,
 * `restoreFromVss()`, `getVssBackupInfo()` (VSS).
 *
 * ```ts
 * import { RgbLibWeb, generateKeys } from '@utexo/rgb-sdk-web';
 *
 * const { mnemonic } = await generateKeys('testnet');
 * const wallet = await RgbLibWeb.create({ network: 'testnet', mnemonic });
 * const balance = await wallet.getBtcBalance();
 * ```
 *
 * Behind the platform-neutral facade:
 *
 * ```ts
 * import { UTEXOWallet } from '@utexo/rgb-sdk';
 *
 * const wallet = new UTEXOWallet({
 *   engine: new RgbLibWeb({ network: 'testnet', mnemonic }),
 * });
 * await wallet.init();
 * ```
 *
 * Construction validates the config only. `init()` loads
 * `@utexo/rgb-lib-wasm` once per page (from `wasmUrl` if set), then opens the
 * wallet and restores its IndexedDB state. Pass `runtime` to use a module the
 * app has already initialized, or a test double. The first operation that needs the network
 * connects with the constructor's connection settings, then the network
 * defaults (regtest has none); `unlock(params)` connects explicitly.
 * Methods the runtime cannot perform reject with `UNSUPPORTED_CAPABILITY`
 * (ADR-0001).
 */
export class RgbLibWeb
  implements
    SharedWalletApi<RgbLibWebUnlockParams | undefined>,
    BackupExportApi,
    BackupRestoreApi,
    VssBackupApi,
    VssRestoreApi,
    VssBackupInfoApi
{
  /** Embedded, never read from core: a newer core must not make this engine claim more. */
  readonly contractVersion = '1' as const;
  readonly protocol = 'RGB_L1' as const;
  readonly psbt = undefined;
  readonly beginEnd = undefined;
  private readonly backend: RgbLibWebBackend;

  /**
   * Constructs and opens the wallet: `new RgbLibWeb(config)`, then `init()`.
   * The first network operation connects; call `unlock()` first only to pass
   * connection settings that differ from the config's. If `init()` fails, the
   * instance is destroyed and the error is rethrown.
   */
  static async create(config: RgbLibWebConfig): Promise<RgbLibWeb> {
    const wallet = new RgbLibWeb(config);
    try {
      await wallet.init();
    } catch (error) {
      await wallet.destroy().catch(() => undefined);
      throw error;
    }
    return wallet;
  }

  constructor(config: RgbLibWebConfig) {
    const { params, keys, runtime } = splitConfig(config);
    this.backend = new RgbLibWebBackend(params, keys, runtime);
  }

  get capabilities(): EngineCapabilities {
    return {
      psbtSigning: this.psbt !== undefined,
      beginEndFlows: this.beginEnd !== undefined,
      canSignTransactions: this.backend.canSignTransactions,
    };
  }

  init() {
    return this.backend.init();
  }
  /** Connects to the indexer and proxy. Explicit fields override the constructor's. */
  unlock(params?: RgbLibWebUnlockParams) {
    return this.backend.guarded('unlock', () =>
      this.backend.unlock(params, 'unlock')
    );
  }
  /** rgb-lib's name for {@link unlock}. */
  goOnline(params?: RgbLibWebUnlockParams) {
    return this.backend.guarded('goOnline', () =>
      this.backend.unlock(params, 'goOnline')
    );
  }
  destroy() {
    return this.backend.destroy();
  }
  isDisposed() {
    return this.backend.isDisposed;
  }

  getNetwork() {
    return this.backend.network;
  }
  getNetworkInfo() {
    return this.backend.getNetworkInfo();
  }
  getWalletIdentity() {
    return this.backend.getWalletIdentity();
  }

  getAddress() {
    return this.backend.getAddress();
  }
  getBtcBalance(options?: ReadOptions) {
    return this.backend.guarded('getBtcBalance', () =>
      this.backend.getBtcBalance(options)
    );
  }
  listUnspents(options?: ReadOptions) {
    return this.backend.guarded('listUnspents', () =>
      this.backend.listUnspents(options)
    );
  }
  sendBtc(params: SendBtcBeginRequestModel) {
    return this.backend.guarded('sendBtc', () => this.backend.sendBtc(params));
  }
  createUtxos(
    params: {
      upTo?: boolean;
      num?: number;
      size?: number;
      feeRate?: number;
    } & ReadOptions
  ) {
    return this.backend.guarded('createUtxos', () =>
      this.backend.createUtxos(params)
    );
  }
  estimateFeeRate(blocks: number) {
    return this.backend.guarded('estimateFeeRate', () =>
      this.backend.estimateFeeRate(blocks)
    );
  }

  listAssets(options?: ListAssetsOptions) {
    return this.backend.guarded('listAssets', () =>
      this.backend.listAssets(options)
    );
  }
  getAssetBalance(assetId: string) {
    return this.backend.guarded('getAssetBalance', () =>
      this.backend.getAssetBalance(assetId)
    );
  }
  issueAssetNia(params: IssueAssetNiaRequestModel) {
    return this.backend.guarded('issueAssetNia', () =>
      this.backend.issueAssetNia(params)
    );
  }
  issueAssetIfa(params: IssueAssetIfaRequestModel) {
    return this.backend.guarded('issueAssetIfa', () =>
      this.backend.issueAssetIfa(params)
    );
  }
  inflate(params: InflateAssetIfaRequestModel) {
    return this.backend.guarded('inflate', () => this.backend.inflate(params));
  }
  blindReceive(params: ReceiveParams) {
    return this.backend.guarded('blindReceive', () =>
      this.backend.receive('blindReceive', false, params)
    );
  }
  witnessReceive(params: ReceiveParams) {
    return this.backend.guarded('witnessReceive', () =>
      this.backend.receive('witnessReceive', true, params)
    );
  }
  decodeRGBInvoice(params: { invoice: string }) {
    return this.backend.guarded('decodeRGBInvoice', () =>
      this.backend.decodeRGBInvoice(params)
    );
  }
  failTransfers(params: FailTransfersRequest) {
    return this.backend.guarded('failTransfers', () =>
      this.backend.failTransfers(params)
    );
  }

  onchainReceive(params: OnchainReceiveParams) {
    return this.backend.guarded('onchainReceive', () =>
      this.backend.onchainReceive(params)
    );
  }
  onchainSend(params: OnchainSendRequestModel) {
    return this.backend.guarded('onchainSend', () =>
      this.backend.onchainSend(params)
    );
  }

  listTransfers(assetId?: string) {
    return this.backend.guarded('listTransfers', () =>
      this.backend.listTransfers(assetId)
    );
  }
  listTransactions(options?: ReadOptions) {
    return this.backend.guarded('listTransactions', () =>
      this.backend.listTransactions(options)
    );
  }
  /** Refreshes pending transfers; `skipSync: true` skips the sync first. */
  refresh(options?: ReadOptions) {
    return this.backend.guarded('refresh', () => this.backend.refresh(options));
  }
  /** `refresh()` without the result. */
  refreshWallet() {
    return this.backend.refreshWallet();
  }
  syncWallet() {
    return this.backend.syncWallet();
  }

  // ── VSS backup (ADR-0003) ─────────────────────────────────────────────────

  /**
   * Restores the wallet from its VSS backup (ADR-0003). Call it after
   * `init()` and before `unlock()` or any online operation. A wallet that
   * already has local data is refused unless `overwrite: true`.
   */
  restoreFromVss(options?: { overwrite?: boolean }): Promise<void> {
    return this.backend.guarded('restoreFromVss', () =>
      this.backend.restoreFromVss(options)
    );
  }

  /**
   * Uploads an encrypted backup to the VSS server now; resolves with the new
   * server version. VSS is on by default (see `vssUrl`): every successful
   * mutation also queues an upload, so this is for an explicit checkpoint.
   * Rejects with `INVALID_CONFIG` when VSS is off.
   */
  backupToVss(): Promise<number> {
    return this.backend.guarded('backupToVss', () =>
      this.backend.backupToVss()
    );
  }

  /**
   * What the VSS server holds for this wallet: whether a backup exists, its
   * version, whether local changes wait for upload, and the last upload
   * error. Rejects with `INVALID_CONFIG` when VSS is off.
   */
  getVssBackupInfo(): Promise<VssBackupInfo> {
    return this.backend.guarded('getVssBackupInfo', () =>
      this.backend.getVssBackupInfo()
    );
  }

  /**
   * The encrypted backup of the whole wallet state, as bytes the app stores
   * where it wants. Needs a nonempty password; works offline.
   */
  exportBackup(params: { password: string }): Promise<Uint8Array> {
    return this.backend.guarded('exportBackup', () =>
      this.backend.exportBackup(params)
    );
  }

  /**
   * Restores from `exportBackup()` bytes. Call it after `init()` and before
   * `unlock()` or any online operation; a wallet with local data is refused
   * unless `overwrite: true`. The restored state is saved before it resolves.
   */
  restoreBackup(params: {
    bytes: Uint8Array;
    password: string;
    overwrite?: boolean;
  }): Promise<void> {
    return this.backend.guarded('restoreBackup', () =>
      this.backend.restoreBackup(params)
    );
  }
}
