/**
 * The part of `@utexo/rgb-lib-wasm` (1.0.0-beta.4) this engine calls,
 * described by shape. `init()` loads the real module (`load.ts`); tests and
 * custom builds can pass their own as the `runtime` constructor argument.
 *
 * Used by: `load.ts`, `session.ts`, `config.ts` (the `runtime` option).
 * `tests/types/` checks that the real module matches.
 * Values typed `unknown` are JS objects built by serde-wasm-bindgen; u64
 * values in them arrive as `bigint`.
 */
export interface RgbLibWasmRuntime {
  readonly WasmWallet: {
    /** Opens the wallet and restores its IndexedDB snapshot, if any. */
    create(walletDataJson: string): Promise<RgbLibWasmWallet>;
  };
  readonly WasmInvoice: new (invoice: string) => RgbLibWasmInvoice;
  restoreKeys(network: string, mnemonic: string): unknown;
}

export interface RgbLibWasmInvoice {
  invoiceData(): unknown;
  free(): void;
}

/** `WasmWallet` methods used by the 29 shared methods. */
export interface RgbLibWasmWallet {
  free(): void;
  flush(): Promise<void>;
  goOnline(onlineOptions: unknown): Promise<unknown>;
  sync(online: unknown): Promise<void>;
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
  getBtcBalance(): unknown;
  getAssetBalance(assetId: string): unknown;
  listAssets(filterAssetSchemas: unknown): unknown;
  listUnspents(settledOnly: boolean): unknown;
  listTransactions(): unknown;
  listTransfers(filter: unknown, txid?: string | null): unknown;
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
    linkedFromContract?: string | null
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
    num: number | null | undefined,
    size: number | null | undefined,
    feeRate: bigint,
    skipSync: boolean
  ): Promise<string>;
  createUtxosEnd(
    online: unknown,
    signedPsbt: string,
    skipSync: boolean
  ): Promise<number>;
  sendBtcBegin(
    online: unknown,
    address: string,
    amount: bigint,
    feeRate: bigint,
    skipSync: boolean
  ): Promise<string>;
  sendBtcEnd(
    online: unknown,
    signedPsbt: string,
    skipSync: boolean
  ): Promise<string>;
  sendBegin(
    online: unknown,
    recipientMap: unknown,
    donation: boolean,
    feeRate: bigint,
    minConfirmations: number,
    expirationTimestamp: unknown,
    senderTransportEndpoint: string | null | undefined,
    lockTime: number | null | undefined,
    dryRun: boolean
  ): Promise<unknown>;
  sendEnd(
    online: unknown,
    signedPsbt: string,
    skipSync: boolean
  ): Promise<unknown>;
  inflateBegin(
    online: unknown,
    assetId: string,
    inflationAmounts: unknown,
    feeRate: bigint,
    minConfirmations: number
  ): Promise<string>;
  inflateEnd(online: unknown, signedPsbt: string): Promise<unknown>;
  signPsbt(unsignedPsbt: string): string;
  refresh(
    online: unknown,
    assetId: string | null | undefined,
    filter: unknown,
    skipSync: boolean
  ): Promise<unknown>;
  failTransfers(
    online: unknown,
    batchTransferIdx: number | null | undefined,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<boolean>;
  getFeeEstimation(online: unknown, blocks: number): Promise<number>;
}
