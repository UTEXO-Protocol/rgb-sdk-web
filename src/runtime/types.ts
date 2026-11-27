/**
 * The part of `@utexo/rgb-lib-wasm` (1.0.0-beta.7) this engine calls,
 * described by shape. `init()` loads the real module (`load.ts`); tests and
 * custom builds can pass their own as the `runtime` constructor argument.
 *
 * Used by: `load.ts`, `session.ts`, `config.ts` (the `runtime` option).
 * `tests/types/` checks that the real module matches.
 * Values typed `unknown` are JS objects built by serde-wasm-bindgen; u64
 * values in them arrive as `bigint`.
 *
 * `signal` is the optional `AbortSignal` of the long calls: when it fires,
 * the call stops its requests and rejects with `Aborted`, after the wallet
 * is restored as on any failure.
 */
export interface RgbLibWasmRuntime {
  readonly WasmWallet: {
    /**
     * Opens the wallet and restores its IndexedDB snapshot, if any.
     * `walletDataJson` is a `WalletData`, `keysJson` a `SinglesigKeys`.
     */
    create(walletDataJson: string, keysJson: string): Promise<RgbLibWasmWallet>;
  };
  readonly WasmInvoice: new (invoice: string) => RgbLibWasmInvoice;
  /** `witnessVersion` is `Taproot` or `SegWitV0`. */
  restoreKeys(
    network: string,
    mnemonic: string,
    witnessVersion: string
  ): unknown;
  /** The indexer protocol behind `indexerUrl` (`"Esplora"`), checked for `network`. */
  checkIndexerUrl(indexerUrl: string, network: string): Promise<unknown>;
  /** A `ConsignmentInspection`; `bundleFilter` is `"All"`, `"Terminals"` or `{ Witness }`. */
  inspectConsignment(consignment: Uint8Array, bundleFilter: unknown): unknown;
}

export interface RgbLibWasmInvoice {
  invoiceData(): unknown;
  free(): void;
}

type Signal = AbortSignal | null | undefined;

/** `WasmWallet` methods used by the engine. */
export interface RgbLibWasmWallet {
  free(): void;
  flush(): Promise<void>;
  goOnline(onlineOptions: unknown, signal?: Signal): Promise<unknown>;
  /** One keychain: `{ keychain: "Colored" | { Vanilla: { lookback } }, strategy }`. */
  sync(online: unknown, options: unknown, signal?: Signal): Promise<void>;
  getAddress(): string;
  /** VSS (ADR-0003). The key is a 64-hex secret key; checked by the binding. */
  configureVssBackup(
    serverUrl: string,
    storeId: string,
    signingKeyHex: string
  ): void;
  disableVssBackup(): void;
  /** The new server version, as a JS number. */
  vssBackup(): Promise<unknown>;
  /** Uploads only when the wallet changed since the last backup; else null. */
  ensureInitialBackup(): Promise<unknown>;
  /** Encrypted backup of the wallet state. */
  backup(password: string): Uint8Array;
  /** Replaces the local state; only queues its save. */
  restoreBackup(bytes: Uint8Array, password: string): void;
  /** Replaces the local state with the server copy, then flushes it. */
  vssRestoreBackup(): Promise<void>;
  /** `{ backup_exists, server_version, backup_required, last_backup_error }`. */
  vssBackupInfo(): Promise<unknown>;
  /** Syncs first unless `skipSync`; `online` may be null when it skips. */
  getBtcBalance(online: unknown, skipSync: boolean): Promise<unknown>;
  getAssetBalance(assetId: string): unknown;
  /** The contract's `Metadata`; `AssetNotFound` for an unknown asset. */
  getAssetMetadata(assetId: string): unknown;
  listAssets(filterAssetSchemas: unknown): unknown;
  listUnspents(
    online: unknown,
    settledOnly: boolean,
    skipSync: boolean
  ): Promise<unknown>;
  listTransactions(online: unknown, skipSync: boolean): Promise<unknown>;
  /**
   * `assetFilter`: `"AnyOrNone"`, `"None"` or `{ Id }`; `scope`: `"All"`,
   * `{ Txid }` or `{ BatchTransfer }`.
   */
  listTransfers(assetFilter: unknown, scope: unknown): unknown;
  getReceivedMint(recipientId: string): unknown;
  /**
   * The consignment of the transfer with this `idx` (`Uint8Array`), or `null`:
   * sent for a send, burn, link or mint; received and validated for a receive
   * (also a mint waiting for its lock); `null` for an inflation, a receive
   * before its consignment arrives and a failed receive.
   */
  getConsignment(transferIdx: number): unknown;
  issueAssetNia(
    ticker: string,
    name: string,
    precision: number,
    amounts: unknown
  ): unknown;
  issueAssetIfa(
    ticker: string,
    name: string,
    precision: number,
    amounts: unknown,
    inflationAmounts: unknown,
    rejectListUrl: string | null | undefined,
    linkRight: boolean,
    linkedFromContract: string | null | undefined,
    skipContractChecks: boolean
  ): unknown;
  blindReceive(
    online: unknown,
    assetId: string | null | undefined,
    assignment: unknown,
    expirationTimestamp: unknown,
    transportEndpoints: unknown,
    minConfirmations: number,
    encryption?: string | null
  ): Promise<unknown>;
  witnessReceive(
    online: unknown,
    assetId: string | null | undefined,
    assignment: unknown,
    expirationTimestamp: unknown,
    transportEndpoints: unknown,
    minConfirmations: number,
    encryption?: string | null
  ): Promise<unknown>;
  createUtxosBegin(
    online: unknown,
    upTo: boolean,
    exact: boolean,
    num: number | null | undefined,
    size: number | null | undefined,
    feeRate: bigint,
    skipSync: boolean,
    dryRun: boolean,
    signal?: Signal
  ): Promise<string>;
  createUtxosEnd(online: unknown, signedPsbt: string): Promise<number>;
  sendBtcBegin(
    online: unknown,
    address: string,
    amount: bigint,
    feeRate: bigint,
    skipSync: boolean,
    dryRun: boolean,
    signal?: Signal
  ): Promise<string>;
  sendBtcEnd(online: unknown, signedPsbt: string): Promise<string>;
  sendBegin(
    online: unknown,
    recipientMap: unknown,
    donation: boolean,
    feeRate: bigint,
    minConfirmations: number,
    expirationTimestamp: unknown,
    senderTransportEndpoint: string | null | undefined,
    lockTime: number | null | undefined,
    dryRun: boolean,
    signal?: Signal
  ): Promise<unknown>;
  sendEnd(online: unknown, signedPsbt: string): Promise<unknown>;
  /** An `InflateBeginResult`: `{ psbt, batchTransferIdx, details }`. */
  inflateBegin(
    online: unknown,
    assetId: string,
    inflationAmounts: unknown,
    feeRate: bigint,
    minConfirmations: number,
    dryRun: boolean,
    signal?: Signal
  ): Promise<unknown>;
  inflateEnd(online: unknown, signedPsbt: string): Promise<unknown>;
  burnBegin(
    online: unknown,
    assetId: string,
    amount: bigint,
    burnReason: string | null,
    feeRate: bigint,
    minConfirmations: number,
    dryRun: boolean,
    signal?: Signal
  ): Promise<unknown>;
  burnEnd(online: unknown, signedPsbt: string): Promise<unknown>;
  signPsbt(unsignedPsbt: string, signOptions?: null): string;
  refresh(
    online: unknown,
    assetId: string | null | undefined,
    filter: unknown,
    skipSync: boolean,
    signal?: Signal
  ): Promise<unknown>;
  failTransfers(
    online: unknown,
    batchTransferIdx: number | null | undefined,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<boolean>;
  getFeeEstimation(online: unknown, blocks: number): Promise<number>;
}
