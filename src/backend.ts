/**
 * The engine's control layer (ADR-0002): one wallet profile, one queue.
 *
 * A wallet operation (`run`, `withOptions` or `checked`) goes through:
 * 1. synchronous checks on an owned copy of the params: the params object,
 *    `skipSync`, watch-only for operations that sign, then `prepare` from
 *    `operations.ts`. An invalid call queues nothing; the public method
 *    (`guarded()`) returns the error as a rejected Promise;
 * 2. admission (`run`): refused once `destroy()` was called;
 * 3. for online operations, lazy connect, before entering the queue (the
 *    connect queues its own call); the wallet must already be open (`init()`);
 * 4. `execute` as one task in the serial queue, so WASM calls never overlap.
 *
 * Not every method has every stage: reads without params have no `prepare`;
 * `listAssets` checks its schema filter inside the queued task, as on React
 * Native, so that error keeps its place after the admission checks; the
 * lifecycle methods (`init`, `unlock`, `destroy`) and the network getters
 * have their own paths.
 *
 * It owns the lifecycle (open, connect, `destroy()` waiting for accepted
 * work) and maps errors to the public codes. It holds no wallet rules and
 * reads no WASM values: those are in `operations.ts` and `runtime/codec.ts`. The
 * admission, queue and connect rules are ported from `@utexo/rgb-lib-rn`
 * (`rgb-lib/backend.ts`).
 *
 * Called by: `rgb-lib-web.ts`. Depends on: `operations.ts`, `runtime/`
 * (session, load), `config.ts`, `keys.ts`, `errors.ts`.
 */
import { ValidationError, logger } from '@utexo/rgb-sdk-core';
import type {
  FailTransfersRequest,
  InflateAssetIfaRequestModel,
  IssueAssetIfaRequestModel,
  IssueAssetNiaRequestModel,
  ListAssetsOptions,
  Network,
  OnchainReceiveParams,
  OnchainSendRequestModel,
  ReadOptions,
  ReceiveParams,
  RefreshTransfersResult,
  SendBtcBeginRequestModel,
  WalletIdentity,
} from '@utexo/rgb-sdk-core';
import {
  configEquals,
  resolveConfig,
  resolveVss,
  splitWalletParams,
  validateWalletParams,
} from './config.js';
import type {
  ResolvedRgbLibWebConfig,
  RgbLibWebOptions,
  RgbLibWebParams,
  RgbLibWebUnlockParams,
  VssSetting,
} from './config.js';
import {
  RgbLibWebError,
  toArgumentError,
  toBackendError,
  toPublicError,
} from './errors.js';
import { readMnemonic, resolveKeys } from './keys.js';
import type { ResolvedKeys, RgbLibWebKeys } from './keys.js';
import * as ops from './operations.js';
import { skipSyncOf, syncs } from './operations.js';
import { loadRgbLibWasm, normalizeWasmUrl } from './runtime/load.js';
import type { RgbLibWasmRuntime } from './runtime/types.js';
import { WasmSession } from './runtime/session.js';

/** A failed command must not poison the queue. */
class SerialExecutor {
  private tail: Promise<void> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

/** Owns queued inputs so later caller mutations cannot alter a pending call. */
function snapshot<T>(value: T): T {
  if (Array.isArray(value)) return value.map(snapshot) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, snapshot(item)])
    ) as T;
  }
  return value;
}

function definedOnly<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

/**
 * Operations that change the wallet state; each queues an automatic VSS
 * upload when it succeeds. The upload itself skips when nothing changed.
 */
const AUTO_BACKUP: ReadonlySet<string> = new Set([
  'createUtxos',
  'sendBtc',
  'issueAssetNia',
  'issueAssetIfa',
  'inflate',
  'blindReceive',
  'witnessReceive',
  'onchainReceive',
  'onchainSend',
  'failTransfers',
  'refresh',
  'refreshWallet',
]);

/** One backend owns one WASM wallet, one queue and one wallet profile. */
export class RgbLibWebBackend {
  private readonly queue = new SerialExecutor();
  /** `wasmUrl` is kept as its normalized href. */
  private readonly params: Readonly<
    Omit<RgbLibWebOptions, 'wasmUrl'> & { wasmUrl?: string }
  >;
  private readonly configuredOnline?: Readonly<RgbLibWebUnlockParams>;
  private readonly keys: ResolvedKeys;
  private session?: WasmSession;
  private online?: ResolvedRgbLibWebConfig;
  private identity?: WalletIdentity;
  private opening?: Promise<void>;
  private connecting?: {
    config: ResolvedRgbLibWebConfig;
    promise: Promise<void>;
  };
  private stopping?: Promise<void>;
  /** Accepted, unsettled operations; destroy() waits for all of them. */
  private readonly accepted = new Set<Promise<unknown>>();
  private disposeRequested = false;
  private disposed = false;
  /** The VSS options, resolved before init(); holds no derived key. */
  private readonly vss: VssSetting;
  /** VSS is configured on the open wallet (set by init()). */
  private vssOn = false;
  /** An automatic upload is queued and has not started yet. */
  private backupWaiting = false;
  /**
   * Automatic uploads are held: the first connection found a server backup
   * that this empty wallet did not restore, and an upload would replace it.
   * Cleared by `restoreFromVss()` or an explicit `backupNow()`.
   */
  private backupHeld = false;
  /** The unrestored-backup check ran or is queued (once per session). */
  private cloudChecked = false;

  constructor(
    params: RgbLibWebParams,
    keys: RgbLibWebKeys,
    /** Undefined: `init()` loads `@utexo/rgb-lib-wasm` itself. */
    private readonly runtime: RgbLibWasmRuntime | undefined
  ) {
    validateWalletParams(params);
    if (
      runtime !== undefined &&
      (!runtime ||
        typeof runtime.WasmWallet?.create !== 'function' ||
        typeof runtime.WasmInvoice !== 'function' ||
        typeof runtime.restoreKeys !== 'function')
    ) {
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        'runtime must be the @utexo/rgb-lib-wasm module, initialized; omit it to let init() load the module'
      );
    }
    if (runtime !== undefined && params.wasmUrl !== undefined) {
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        'Pass either runtime or wasmUrl: wasmUrl is used only when init() loads the module itself'
      );
    }
    this.keys = resolveKeys(keys, params.network);
    const { options, connection } = splitWalletParams(params);
    // A URL object stays the caller's and can change; keep its normalized href.
    // The VSS options live only in `this.vss`, resolved and owned.
    this.vss = resolveVss(options);
    const { wasmUrl, vss: _vss, vssUrl: _vssUrl, ...fixed } = options;
    this.params = Object.freeze({
      ...fixed,
      ...(wasmUrl !== undefined ? { wasmUrl: normalizeWasmUrl(wasmUrl) } : {}),
    });
    if (connection) {
      const owned = Object.freeze(snapshot(connection));
      // Invalid endpoints fail here, not on the first online operation.
      resolveConfig(owned, params.network, 'constructor');
      this.configuredOnline = owned;
    }
  }

  private get watchOnly(): boolean {
    return !this.keys.readMnemonic;
  }

  get canSignTransactions(): boolean {
    return !this.watchOnly;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get network(): Network {
    return this.params.network;
  }

  private assertAccepting() {
    if (this.disposeRequested || this.disposed) {
      throw new RgbLibWebError(
        'WALLET_DISPOSED',
        'This wallet session is disposed'
      );
    }
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.accepted.add(promise);
    const settle = () => {
      this.accepted.delete(promise);
    };
    void promise.then(settle, settle);
    return promise;
  }

  /** A synchronous throw while reading arguments becomes a rejection. */
  guarded<T>(operation: string, call: () => Promise<T>): Promise<T> {
    try {
      return call();
    } catch (error) {
      return Promise.reject(toArgumentError(error, operation));
    }
  }

  private publicly<T>(operation: string, promise: Promise<T>): Promise<T> {
    return promise.catch((error: unknown) => {
      throw toPublicError(error, operation);
    });
  }

  /** Public entry: admission check, then the tracked operation. */
  private run<T>(
    operation: string,
    requiresOnline: boolean,
    action: (session: WasmSession) => Promise<T>
  ): Promise<T> {
    try {
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(toPublicError(error, operation));
    }
    // A mutation queues its upload from inside its own task, once it
    // succeeded: so the upload is queued before the operation settles (and
    // before a destroy()'s close), in a fixed order.
    const task = AUTO_BACKUP.has(operation)
      ? async (session: WasmSession) => {
          const result = await action(session);
          this.scheduleBackup();
          return result;
        }
      : action;
    return this.publicly(
      operation,
      this.track(this.execute(operation, requiresOnline, task))
    );
  }

  /**
   * Queues one automatic VSS upload after a mutation, unless one is already
   * waiting (it will include this change). It runs as its own task, so the
   * mutation resolves without waiting for the network; destroy() waits for
   * it. A failed upload is logged, without the key, and fails nothing.
   */
  private scheduleBackup(): void {
    if (!this.vssOn || this.backupWaiting || this.disposed) return;
    this.backupWaiting = true;
    const upload = this.queue
      .run(async () => {
        this.backupWaiting = false;
        if (this.session && !this.backupHeld)
          await ops.autoBackup.execute(this.session);
      })
      .catch((error: unknown) => {
        const e = toBackendError(error, 'vssBackup');
        logger.warn('RgbLibWeb: automatic VSS backup failed', {
          code: e.code,
          message: e.message,
        });
      });
    this.track(upload);
  }

  private execute<T>(
    operation: string,
    requiresOnline: boolean,
    action: (session: WasmSession) => Promise<T>
  ): Promise<T> {
    // Connect before entering the queue: the connect step queues its own call.
    const ready = requiresOnline
      ? this.connectLazily(operation)
      : Promise.resolve();
    return ready.then(() =>
      this.queue.run(async () => {
        if (!this.session) {
          throw new RgbLibWebError(
            'WALLET_NOT_INITIALIZED',
            'Call init() before this operation',
            operation
          );
        }
        if (requiresOnline && !this.online) {
          throw new RgbLibWebError(
            'WALLET_OFFLINE',
            'Call unlock() before this operation',
            operation
          );
        }
        try {
          return await action(this.session);
        } catch (error) {
          // toPublicError keeps core ValidationErrors as INVALID_PARAMS.
          throw toPublicError(error, operation);
        }
      })
    );
  }

  /**
   * The first operation that needs a connection makes one with the
   * constructor's connection settings, then the network defaults. Regtest is
   * never guessed.
   */
  private async connectLazily(operation: string): Promise<void> {
    const pending = () => this.connecting?.promise;
    if (this.online) return;
    if (pending()) return pending();
    if (this.opening) await this.opening.catch(() => undefined);
    if (this.online || !this.session) return;
    if (pending()) return pending();
    let defaults: ResolvedRgbLibWebConfig | undefined;
    if (this.configuredOnline) {
      defaults = resolveConfig(
        this.configuredOnline,
        this.params.network,
        operation
      );
    } else if (this.params.network !== 'regtest') {
      try {
        defaults = resolveConfig({}, this.params.network, operation);
      } catch {
        defaults = undefined;
      }
    }
    if (!defaults) {
      throw new RgbLibWebError(
        'WALLET_OFFLINE',
        `${operation} needs a connection; on ${this.params.network} call unlock(params) with an Esplora indexer and a proxy first, or pass them to the constructor`,
        operation
      );
    }
    return this.connect(defaults);
  }

  private withOptions<O, T>(
    operation: string,
    requiresOnline: boolean | ((owned: O | undefined) => boolean),
    options: O | undefined,
    action: (session: WasmSession, owned: O | undefined) => Promise<T>
  ): Promise<T> {
    if (options != null && typeof options !== 'object')
      throw new ValidationError(
        `${operation} options must be an object`,
        'options'
      );
    const owned = snapshot(options);
    const online =
      typeof requiresOnline === 'function'
        ? requiresOnline(owned)
        : requiresOnline;
    return this.run(operation, online, (session) => action(session, owned));
  }

  /**
   * A public operation with a params object. Before admission, and so before
   * any connect or WASM call: the params are owned, a signing operation on a
   * watch-only wallet is refused, and `prepare` validates them once.
   */
  private checked<P, T, R>(
    operation: string,
    requiresOnline: boolean,
    params: P,
    // Required: `action` gets what `prepare` returned, never a missing value.
    rules: { signs?: boolean; prepare: (owned: P) => R },
    action: (session: WasmSession, owned: P, prepared: R) => Promise<T>
  ): Promise<T> {
    if (typeof params !== 'object' || params === null)
      throw new ValidationError(`${operation} needs a params object`, 'params');
    const owned = snapshot(params);
    skipSyncOf((owned as { skipSync?: unknown }).skipSync);
    if (rules.signs && this.watchOnly)
      throw new RgbLibWebError(
        'UNSUPPORTED_CAPABILITY',
        `${operation} needs the mnemonic; this RGB_L1 wallet was opened watch-only from public keys`,
        operation
      );
    const prepared = rules.prepare(owned);
    return this.run(operation, requiresOnline, (session) =>
      action(session, owned, prepared)
    );
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  init(): Promise<void> {
    try {
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(toPublicError(error, 'init'));
    }
    return this.publicly('init', this.track(this.open()));
  }

  private open(): Promise<void> {
    if (this.opening) return this.opening;
    if (this.session) return Promise.resolve();
    const opening = this.queue.run(async () => {
      let mnemonic: string | null = null;
      try {
        // Load first: the mnemonic is read only when the wallet can open now.
        const runtime =
          this.runtime ?? (await loadRgbLibWasm(this.params.wasmUrl, 'init'));
        if (this.keys.readMnemonic) {
          mnemonic = await readMnemonic(this.keys.readMnemonic, 'init');
        }
        const session = await WasmSession.open(
          runtime,
          {
            network: this.params.network,
            dataDir: this.params.dataDir ?? ':memory:',
            maxAllocationsPerUtxo: this.params.maxAllocationsPerUtxo ?? 5,
            reuseAddresses: this.params.reuseAddresses ?? false,
          },
          mnemonic,
          this.keys.publicKeys
        );
        try {
          // No upload here: a restore (ADR-0003 B2) may still run before the
          // wallet connects, and an upload now would replace the cloud copy.
          this.vssOn = ops.configureVss(session, this.vss, mnemonic);
        } catch (error) {
          await session.close().catch(() => undefined);
          throw error;
        }
        this.session = session;
      } catch (error) {
        throw toBackendError(error, 'init');
      } finally {
        mnemonic = null;
      }
      this.identity = {
        id: this.session.identity.id,
        network: this.params.network,
        protocol: 'RGB_L1',
      };
    });
    this.opening = opening;
    const clear = () => {
      if (this.opening === opening) this.opening = undefined;
    };
    void opening.then(clear, clear);
    return opening;
  }

  /** rgb-lib's goOnline; the contract's unlock() is the same call. */
  unlock(
    params: RgbLibWebUnlockParams | undefined,
    operation: 'unlock' | 'goOnline'
  ): Promise<void> {
    let config: ResolvedRgbLibWebConfig;
    try {
      config = this.readConfig(params, operation);
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(toPublicError(error, operation));
    }
    return this.publicly(operation, this.track(this.connect(config)));
  }

  private readConfig(
    params: RgbLibWebUnlockParams | undefined,
    operation: string
  ): ResolvedRgbLibWebConfig {
    try {
      return resolveConfig(
        this.withConfigured(params === undefined ? {} : snapshot(params)),
        this.params.network,
        operation
      );
    } catch (error) {
      throw toArgumentError(error, operation);
    }
  }

  /** Explicit fields override the constructor's connection settings one by one. */
  private withConfigured(owned: RgbLibWebUnlockParams): RgbLibWebUnlockParams {
    if (!this.configuredOnline || owned === null) return owned;
    const explicit = definedOnly(owned);
    const base: Record<string, unknown> = { ...this.configuredOnline };
    if ('indexer' in explicit || 'indexerUrl' in explicit) {
      delete base.indexer;
      delete base.indexerUrl;
    }
    return { ...base, ...explicit } as RgbLibWebUnlockParams;
  }

  private connect(config: ResolvedRgbLibWebConfig): Promise<void> {
    if (this.connecting) {
      return configEquals(this.connecting.config, config)
        ? this.connecting.promise
        : Promise.reject(
            new RgbLibWebError(
              'WALLET_CONFIG_MISMATCH',
              'A different online configuration is already connecting'
            )
          );
    }
    if (this.online) {
      return configEquals(this.online, config)
        ? Promise.resolve()
        : Promise.reject(
            new RgbLibWebError(
              'WALLET_CONFIG_MISMATCH',
              'Destroy and recreate the wallet to change its online configuration'
            )
          );
    }
    const connecting = this.execute('unlock', false, async (session) => {
      await session.goOnline(config);
      this.online = config;
      // Queued here, so it runs before any work that waited for the connect.
      this.checkCloudBackup();
    });
    this.connecting = { config, promise: connecting };
    const clear = () => {
      if (this.connecting?.promise === connecting) this.connecting = undefined;
    };
    void connecting.then(clear, clear);
    return connecting;
  }

  /** Terminal. Waits for accepted work, then flushes and frees the wallet. */
  destroy(): Promise<void> {
    this.disposeRequested = true;
    if (this.disposed) return Promise.resolve();
    if (this.stopping) return this.publicly('destroy', this.stopping);
    const accepted = [...this.accepted];
    const stopping = Promise.allSettled(accepted).then(() =>
      this.queue.run(async () => {
        // A failed flush keeps the wallet, so a retry can flush again.
        if (this.session) await this.session.close();
        this.session = undefined;
        this.identity = undefined;
        this.online = undefined;
        this.disposed = true;
      })
    );
    this.stopping = stopping;
    const clear = () => {
      if (this.stopping === stopping) this.stopping = undefined;
    };
    void stopping.then(clear, clear);
    return this.publicly('destroy', stopping);
  }

  // ── network ───────────────────────────────────────────────────────────────

  getWalletIdentity(): Promise<WalletIdentity> {
    return this.run('getWalletIdentity', false, async () => ({
      ...this.identity!,
    }));
  }

  /** rgb-lib-wasm has no block-height call: `blockHeight` is left out, as on React Native. */
  getNetworkInfo() {
    return this.run('getNetworkInfo', true, async () => ({
      network: this.params.network,
    }));
  }

  // ── bitcoin ───────────────────────────────────────────────────────────────

  getAddress(): Promise<string> {
    return this.run('getAddress', false, (s) => ops.getAddress.execute(s));
  }

  getBtcBalance(options?: ReadOptions) {
    return this.withOptions('getBtcBalance', syncs, options, (s, owned) =>
      ops.getBtcBalance.execute(s, skipSyncOf(owned?.skipSync))
    );
  }

  listUnspents(options?: ReadOptions) {
    return this.withOptions('listUnspents', syncs, options, (s, owned) =>
      ops.listUnspents.execute(s, skipSyncOf(owned?.skipSync))
    );
  }

  createUtxos(
    params: {
      upTo?: boolean;
      num?: number;
      size?: number;
      feeRate?: number;
    } & ReadOptions
  ): Promise<number> {
    return this.checked(
      'createUtxos',
      true,
      params,
      { signs: true, prepare: ops.createUtxos.prepare },
      (s, _p, v) => ops.createUtxos.execute(s, v)
    );
  }

  sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    return this.checked(
      'sendBtc',
      true,
      params,
      { signs: true, prepare: ops.sendBtc.prepare },
      (s, _p, v) => ops.sendBtc.execute(s, v)
    );
  }

  estimateFeeRate(blocks: number) {
    const checked = ops.estimateFeeRate.prepare(blocks);
    return this.run('estimateFeeRate', true, (s) =>
      ops.estimateFeeRate.execute(s, checked)
    );
  }

  // ── rgb assets ────────────────────────────────────────────────────────────

  listAssets(options?: ListAssetsOptions) {
    return this.withOptions('listAssets', false, options, async (s, owned) =>
      ops.listAssets.execute(s, owned)
    );
  }

  getAssetBalance(assetId: string) {
    return this.run('getAssetBalance', false, async (s) =>
      ops.getAssetBalance.execute(s, assetId)
    );
  }

  issueAssetNia(params: IssueAssetNiaRequestModel) {
    return this.checked(
      'issueAssetNia',
      false,
      params,
      { prepare: ops.issueAssetNia.prepare },
      (s, _p, v) => ops.issueAssetNia.execute(s, v)
    );
  }

  issueAssetIfa(params: IssueAssetIfaRequestModel) {
    return this.checked(
      'issueAssetIfa',
      false,
      params,
      { prepare: ops.issueAssetIfa.prepare },
      (s, _p, v) => ops.issueAssetIfa.execute(s, v)
    );
  }

  inflate(params: InflateAssetIfaRequestModel) {
    return this.checked(
      'inflate',
      true,
      params,
      { signs: true, prepare: ops.inflate.prepare },
      (s, _p, v) => ops.inflate.execute(s, v)
    );
  }

  receive(
    operation: 'blindReceive' | 'witnessReceive' | 'onchainReceive',
    witness: boolean | undefined,
    params: ReceiveParams & { witness?: boolean }
  ) {
    return this.checked(
      operation,
      true,
      params,
      { prepare: (p) => ops.receive.prepare(p, witness) },
      (s, _p, v) => ops.receive.execute(s, v, this.onlineContext())
    );
  }

  onchainReceive(params: OnchainReceiveParams) {
    return this.receive('onchainReceive', undefined, params);
  }

  decodeRGBInvoice(params: { invoice: string }) {
    const invoice = ops.decodeRGBInvoice.prepare(params);
    return this.run('decodeRGBInvoice', false, async (s) =>
      ops.decodeRGBInvoice.execute(s, invoice)
    );
  }

  onchainSend(params: OnchainSendRequestModel) {
    return this.checked(
      'onchainSend',
      true,
      params,
      { signs: true, prepare: ops.onchainSend.prepare },
      (s, _p, v) => ops.onchainSend.execute(s, v, this.onlineContext())
    );
  }

  failTransfers(params: FailTransfersRequest) {
    return this.checked(
      'failTransfers',
      true,
      params,
      { prepare: ops.failTransfers.prepare },
      (s, _p, v) => ops.failTransfers.execute(s, v)
    );
  }

  // ── history ───────────────────────────────────────────────────────────────

  listTransfers(assetId?: string) {
    const filter = ops.listTransfers.prepare(assetId);
    return this.run('listTransfers', false, async (s) =>
      ops.listTransfers.execute(s, filter)
    );
  }

  listTransactions(options?: ReadOptions) {
    return this.withOptions('listTransactions', syncs, options, (s, owned) =>
      ops.listTransactions.execute(s, skipSyncOf(owned?.skipSync))
    );
  }

  refresh(options?: ReadOptions): Promise<RefreshTransfersResult> {
    return this.withOptions(
      'refresh',
      // Always online; the flag is checked here, before any connect.
      (owned) => (skipSyncOf(owned?.skipSync), true),
      options,
      (s, owned) => ops.refresh.execute(s, skipSyncOf(owned?.skipSync))
    );
  }

  refreshWallet(): Promise<void> {
    return this.run('refreshWallet', true, (s) =>
      ops.refresh.execute(s, false)
    ).then(() => undefined);
  }

  syncWallet(): Promise<void> {
    return this.run('syncWallet', true, (s) => s.sync());
  }

  // ── VSS backup (ADR-0003) ────────────────────────────────────────────────

  /** Uploads now and returns the server version. No indexer connection needed. */
  backupNow(): Promise<number> {
    if (this.vss.kind === 'off')
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        'VSS backup is off (vssUrl: null)',
        'backupNow'
      );
    return this.run('backupNow', false, async (s) => {
      if (!this.vssOn)
        throw new RgbLibWebError(
          'INVALID_CONFIG',
          'VSS backup needs the mnemonic or an explicit vss config; this wallet was opened watch-only',
          'backupNow'
        );
      const version = await ops.backupNow.execute(s);
      // An explicit upload replaces the cloud copy on purpose.
      this.backupHeld = false;
      return version;
    });
  }

  /**
   * Restores the wallet from its VSS backup (ADR-0003 B2). Allowed only after
   * `init()` and before the first connection; a wallet with local data needs
   * `{ overwrite: true }`. The restored state is flushed before it resolves.
   */
  restoreFromVss(options?: { overwrite?: boolean }): Promise<void> {
    const prepared = ops.restoreFromVss.prepare(snapshot(options));
    if (this.vss.kind === 'off')
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        'VSS backup is off (vssUrl: null)',
        'restoreFromVss'
      );
    return this.run('restoreFromVss', false, async (s) => {
      if (!this.vssOn)
        throw new RgbLibWebError(
          'INVALID_CONFIG',
          'VSS restore needs the mnemonic or an explicit vss config; this wallet was opened watch-only',
          'restoreFromVss'
        );
      // In the task: a connect queued ahead of this one (unlock() called
      // first, without awaiting) has finished by now and counts too.
      if (this.online) throw this.restoreTooLate();
      await ops.restoreFromVss.execute(s, prepared);
      // The local state is now the server copy: nothing to protect.
      this.cloudChecked = true;
      this.backupHeld = false;
    });
  }

  private restoreTooLate(): RgbLibWebError {
    return new RgbLibWebError(
      'WALLET_INVALID_STATE',
      'restoreFromVss() runs only between init() and the first connection; destroy the wallet, create it again and restore before unlock()',
      'restoreFromVss'
    );
  }

  /**
   * Once, after the first connection: if this wallet is empty, was not
   * restored, and the server has a backup, the backup belongs to this mnemonic
   * from another device. Warn, and hold automatic uploads so the first
   * mutation does not replace it. A failed check is logged and holds nothing.
   */
  private checkCloudBackup(): void {
    if (!this.vssOn || this.cloudChecked) return;
    this.cloudChecked = true;
    const check = this.queue
      .run(async () => {
        const s = this.session;
        if (!s || ops.hasLocalData(s)) return;
        if (!(await ops.vssBackupExists.execute(s))) return;
        this.backupHeld = true;
        logger.warn(
          'RgbLibWeb: a VSS backup exists for this wallet but was not restored; automatic backups are held. Restore it (destroy, create again, restoreFromVss() before unlock()) or call backupNow() to replace it with this wallet'
        );
      })
      .catch((error: unknown) => {
        const e = toBackendError(error, 'vssBackupInfo');
        logger.warn('RgbLibWeb: could not check for an unrestored VSS backup', {
          code: e.code,
          message: e.message,
        });
      });
    this.track(check);
  }

  /** Read inside a queued task of an online operation: the connection is set. */
  private onlineContext(): ops.OnlineContext {
    return { proxyEndpoint: this.online!.proxyEndpoint };
  }
}
