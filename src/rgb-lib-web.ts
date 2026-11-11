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
  SharedWalletApi,
} from '@utexo/rgb-sdk-core';
import { RgbLibWebBackend } from './backend.js';
import { splitConfig } from './config.js';
import type { RgbLibWebConfig, RgbLibWebUnlockParams } from './config.js';

/**
 * The RGB_L1 engine for browsers, over `@utexo/rgb-lib-wasm`. It implements
 * the 29 `SharedWalletApi` methods and no extension.
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
export class RgbLibWeb implements SharedWalletApi<
  RgbLibWebUnlockParams | undefined
> {
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
}
