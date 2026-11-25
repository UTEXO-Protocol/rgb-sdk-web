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
 * A call with an `AbortSignal` (`signal`, ADR-0002 addendum) that fires while
 * it waits for its turn rejects at once with `ABORTED` and never runs. Once it
 * runs, the signal goes to the runtime calls that can stop (goOnline, sync,
 * refresh and the begins): they stop and reject with `ABORTED` after the
 * wallet is restored. What runs after the begin (signing, the end, a
 * broadcast) is not stopped.
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
 * admission, queue and connect rules are ported from `@utexo/rgb-sdk-rn`
 * (`rgb-lib/backend.ts`).
 *
 * Called by: `rgb-lib-web.ts`. Depends on: `operations.ts`, `runtime/`
 * (session, load), `config.ts`, `keys.ts`, `errors.ts`.
 */
import { ValidationError, logger } from '@utexo/rgb-sdk-core';
import type {
  BfaCapabilities,
  BurnParams,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  IssueAssetIfaRequestModel,
  IssueAssetNiaRequestModel,
  ListAssetsOptions,
  Network,
  OnchainReceiveParams,
  OnchainSendRequestModel,
  ReadOptions,
  ReceivedMint,
  ReceivedMintOptions,
  ReceiveParams,
  RefreshTransfersResult,
  SendAssetEndRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  VssBackupInfo,
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

/**
 * Options of the calls the runtime can stop. Only this engine has them: on
 * React Native the same calls take no signal.
 */
export interface RgbLibWebCallOptions {
  /** Stops the call: it rejects with `ABORTED` and leaves the wallet as before. */
  signal?: AbortSignal;
}

/** The `signal` option, checked; any other value is INVALID_PARAMS. */
function signalOf(value: unknown): AbortSignal | undefined {
  if (value === undefined || value === null) return undefined;
  const v = value as { aborted?: unknown; addEventListener?: unknown };
  // By shape: a signal from another realm (an iframe) is not instanceof here.
  if (
    typeof v === 'object' &&
    typeof v.aborted === 'boolean' &&
    typeof v.addEventListener === 'function'
  )
    return value as AbortSignal;
  throw new ValidationError('signal must be an AbortSignal', 'signal');
}

/**
 * Splits `signal` off a params or options object before it is owned:
 * `snapshot()` would turn the signal into a plain object.
 */
function splitSignal<T>(value: T): { rest: T; signal?: AbortSignal } {
  if (value === null || typeof value !== 'object' || !('signal' in value))
    return { rest: value };
  const { signal, ...rest } = value as T & { signal?: unknown };
  return { rest: rest as T, signal: signalOf(signal) };
}

function abortedError(operation: string): RgbLibWebError {
  return new RgbLibWebError(
    'ABORTED',
    `${operation} was aborted by its signal`,
    operation
  );
}

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
  'createUtxosBegin',
  'createUtxosEnd',
  'sendBtc',
  'sendBtcBegin',
  'sendBtcEnd',
  'issueAssetNia',
  'issueAssetIfa',
  'inflate',
  'inflateBegin',
  'inflateEnd',
  'burn',
  'burnBegin',
  'burnEnd',
  'blindReceive',
  'witnessReceive',
  'onchainReceive',
  'onchainSend',
  'onchainSendBegin',
  'onchainSendEnd',
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
   * Cleared by `restoreFromVss()` or an explicit `backupToVss()`.
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

  /** IFA and BFA are off: mainnet without `allowRecklessSchemas`. */
  private get recklessRefused(): boolean {
    return (
      this.params.network === 'mainnet' &&
      !(this.params.allowRecklessSchemas ?? false)
    );
  }

  /** Rejects an IFA or BFA operation the wallet was opened without. */
  private refuseReckless(operation: string): void {
    if (this.recklessRefused)
      throw new RgbLibWebError(
        'UNSUPPORTED_CAPABILITY',
        `${operation} needs IFA or BFA, which rgb-lib refuses on mainnet unless allowRecklessSchemas is true`,
        operation
      );
  }

  /** `run`, after the IFA/BFA rule: the rejection is the public error. */
  private reckless<T>(operation: string, start: () => Promise<T>): Promise<T> {
    try {
      this.refuseReckless(operation);
    } catch (error) {
      return Promise.reject(toPublicError(error, operation));
    }
    return start();
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

  /**
   * Public entry: admission check, then the tracked operation. With a
   * signal, a call that has not started when it fires rejects at once.
   */
  private run<T>(
    operation: string,
    requiresOnline: boolean,
    action: (session: WasmSession) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    try {
      this.assertAccepting();
      if (signal?.aborted) throw abortedError(operation);
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
    let started = false;
    const result = this.publicly(
      operation,
      this.track(
        this.execute(operation, requiresOnline, task, signal, () => {
          started = true;
        })
      )
    );
    return signal
      ? this.abortable(operation, result, signal, () => started)
      : result;
  }

  /** `result`, or ABORTED as soon as `signal` fires before the task started. */
  private abortable<T>(
    operation: string,
    result: Promise<T>,
    signal: AbortSignal,
    started: () => boolean
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        // The task sees the fired signal when its turn comes and skips.
        if (!started()) reject(abortedError(operation));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      result.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    });
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
    action: (session: WasmSession) => Promise<T>,
    signal?: AbortSignal,
    onStart?: () => void
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
        if (signal?.aborted) throw abortedError(operation);
        onStart?.();
        const session = this.session;
        session.signal = signal;
        try {
          return await action(session);
        } catch (error) {
          // toPublicError keeps core ValidationErrors as INVALID_PARAMS.
          throw toPublicError(error, operation);
        } finally {
          session.signal = undefined;
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
    action: (session: WasmSession, owned: O | undefined) => Promise<T>,
    /** Whether the options take a `signal`. */
    abortable = false
  ): Promise<T> {
    if (options != null && typeof options !== 'object')
      throw new ValidationError(
        `${operation} options must be an object`,
        'options'
      );
    const { rest, signal } = abortable
      ? splitSignal(options)
      : { rest: options, signal: undefined };
    const owned = snapshot(rest);
    const online =
      typeof requiresOnline === 'function'
        ? requiresOnline(owned)
        : requiresOnline;
    return this.run(
      operation,
      online,
      (session) => action(session, owned),
      signal
    );
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
    rules: {
      signs?: boolean;
      abortable?: boolean;
      /** An IFA or BFA operation (see `refuseReckless`). */
      reckless?: boolean;
      prepare: (owned: P) => R;
    },
    action: (session: WasmSession, owned: P, prepared: R) => Promise<T>
  ): Promise<T> {
    if (typeof params !== 'object' || params === null)
      throw new ValidationError(`${operation} needs a params object`, 'params');
    const { rest, signal } = rules.abortable
      ? splitSignal(params)
      : { rest: params, signal: undefined };
    const owned = snapshot(rest);
    skipSyncOf((owned as { skipSync?: unknown }).skipSync);
    if (rules.reckless) this.refuseReckless(operation);
    if (rules.signs && this.watchOnly)
      throw new RgbLibWebError(
        'UNSUPPORTED_CAPABILITY',
        `${operation} needs the mnemonic; this RGB_L1 wallet was opened watch-only from public keys`,
        operation
      );
    const prepared = rules.prepare(owned);
    return this.run(
      operation,
      requiresOnline,
      (session) => action(session, owned, prepared),
      signal
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
            witnessVersion: this.params.witnessVersion ?? 'taproot',
            maxAllocationsPerUtxo: this.params.maxAllocationsPerUtxo ?? 5,
            reuseAddresses: this.params.reuseAddresses ?? false,
            allowRecklessSchemas: this.params.allowRecklessSchemas ?? false,
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

  /**
   * rgb-lib's goOnline; the contract's unlock() is the same call. A signal
   * stops the connection attempt, for every caller waiting on it.
   */
  unlock(
    params: RgbLibWebUnlockParams | undefined,
    operation: 'unlock' | 'goOnline',
    options?: RgbLibWebCallOptions
  ): Promise<void> {
    let config: ResolvedRgbLibWebConfig;
    let signal: AbortSignal | undefined;
    try {
      config = this.readConfig(params, operation);
      if (options != null && typeof options !== 'object')
        throw new ValidationError(
          `${operation} options must be an object`,
          'options'
        );
      signal = signalOf(options?.signal);
      this.assertAccepting();
      if (signal?.aborted) throw abortedError(operation);
    } catch (error) {
      return Promise.reject(toPublicError(error, operation));
    }
    return this.publicly(operation, this.track(this.connect(config, signal)));
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

  private connect(
    config: ResolvedRgbLibWebConfig,
    signal?: AbortSignal
  ): Promise<void> {
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
    const connecting = this.execute(
      'unlock',
      false,
      async (session) => {
        // Read before goOnline(): its full scan brings in the chain UTXOs and
        // transactions of this mnemonic, so a new device no longer looks empty.
        const empty =
          this.cloudCheckDue() && !(await ops.hasLocalData(session));
        await session.goOnline(config, session.signal);
        this.online = config;
        // Queued here, so it runs before any work that waited for the connect.
        if (empty) this.checkCloudBackup();
      },
      signal
    );
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
    } & ReadOptions &
      RgbLibWebCallOptions
  ): Promise<number> {
    return this.checked(
      'createUtxos',
      true,
      params,
      { signs: true, abortable: true, prepare: ops.createUtxos.prepare },
      (s, _p, v) => ops.createUtxos.execute(s, v)
    );
  }

  sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    return this.checked(
      'sendBtc',
      true,
      params,
      { signs: true, abortable: true, prepare: ops.sendBtc.prepare },
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

  getAssetMetadata(assetId: string) {
    const id = ops.getAssetMetadata.prepare(assetId);
    return this.run('getAssetMetadata', false, async (s) =>
      ops.getAssetMetadata.execute(s, id)
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
      { reckless: true, prepare: ops.issueAssetIfa.prepare },
      (s, _p, v) => ops.issueAssetIfa.execute(s, v)
    );
  }

  inflate(params: InflateAssetIfaRequestModel) {
    return this.checked(
      'inflate',
      true,
      params,
      {
        signs: true,
        abortable: true,
        reckless: true,
        prepare: ops.inflate.prepare,
      },
      (s, _p, v) => ops.inflate.execute(s, v)
    );
  }

  burn(params: BurnParams) {
    return this.checked(
      'burn',
      true,
      params,
      {
        signs: true,
        abortable: true,
        reckless: true,
        prepare: ops.burn.prepare,
      },
      (s, _p, v) => ops.burn.execute(s, v)
    );
  }

  // ── externally approved flows ─────────────────────────────────────────────
  // No `signs` rule: the keys may be elsewhere, so a watch-only wallet can run
  // these. Each begin reserves its inputs until the end or `failTransfers`.

  createUtxosBegin(params: CreateUtxosBeginRequestModel) {
    return this.checked(
      'createUtxosBegin',
      true,
      params,
      { abortable: true, prepare: ops.createUtxosBegin.prepare },
      (s, _p, v) => ops.createUtxosBegin.execute(s, v)
    );
  }

  createUtxosEnd(params: CreateUtxosEndRequestModel) {
    return this.checked(
      'createUtxosEnd',
      true,
      params,
      { prepare: ops.createUtxosEnd.prepare },
      (s, _p, v) => ops.createUtxosEnd.execute(s, v)
    );
  }

  sendBtcBegin(params: SendBtcBeginRequestModel) {
    return this.checked(
      'sendBtcBegin',
      true,
      params,
      { abortable: true, prepare: ops.sendBtcBegin.prepare },
      (s, _p, v) => ops.sendBtcBegin.execute(s, v)
    );
  }

  sendBtcEnd(params: SendBtcEndRequestModel) {
    return this.checked(
      'sendBtcEnd',
      true,
      params,
      { prepare: ops.sendBtcEnd.prepare },
      (s, _p, v) => ops.sendBtcEnd.execute(s, v)
    );
  }

  onchainSendBegin(params: OnchainSendRequestModel) {
    return this.checked(
      'onchainSendBegin',
      true,
      params,
      { abortable: true, prepare: ops.onchainSendBegin.prepare },
      (s, _p, v) => ops.onchainSendBegin.execute(s, v, this.onlineContext())
    );
  }

  onchainSendEnd(params: SendAssetEndRequestModel) {
    return this.checked(
      'onchainSendEnd',
      true,
      params,
      { prepare: ops.onchainSendEnd.prepare },
      (s, _p, v) => ops.onchainSendEnd.execute(s, v)
    );
  }

  inflateBegin(params: InflateAssetIfaRequestModel) {
    return this.checked(
      'inflateBegin',
      true,
      params,
      { abortable: true, reckless: true, prepare: ops.inflateBegin.prepare },
      (s, _p, v) => ops.inflateBegin.execute(s, v)
    );
  }

  inflateEnd(params: InflateEndRequestModel) {
    return this.checked(
      'inflateEnd',
      true,
      params,
      { reckless: true, prepare: ops.inflateEnd.prepare },
      (s, _p, v) => ops.inflateEnd.execute(s, v)
    );
  }

  burnBegin(params: BurnParams) {
    return this.checked(
      'burnBegin',
      true,
      params,
      { abortable: true, reckless: true, prepare: ops.burnBegin.prepare },
      (s, _p, v) => ops.burnBegin.execute(s, v)
    );
  }

  burnEnd(params: { signedPsbt: string }) {
    return this.checked(
      'burnEnd',
      true,
      params,
      { reckless: true, prepare: ops.burnEnd.prepare },
      (s, _p, v) => ops.burnEnd.execute(s, v)
    );
  }

  /** Signs with the wallet keys; the carrier is absent on a watch-only wallet. */
  signPsbt(psbt: string, mnemonic?: string): Promise<string> {
    const prepared = ops.signPsbt.prepare(psbt, mnemonic);
    return this.run('signPsbt', false, async (s) =>
      ops.signPsbt.execute(s, prepared)
    );
  }

  estimateFee(psbt: string) {
    return this.run('estimateFee', false, async () => ops.estimateFee(psbt));
  }

  /**
   * What this wallet can do now. Burning signs, so a watch-only wallet cannot;
   * the consignment of an ended burn is exported on any open wallet.
   */
  getBfaCapabilities(): BfaCapabilities {
    const open =
      !this.disposed && !this.disposeRequested && !this.recklessRefused;
    return { burn: open && !this.watchOnly, consignment: open, bfa: open };
  }

  /** `ConsignmentApi`: the consignment of an ended burn, as base64. Offline. */
  getConsignment(assetId: string, txid: string): Promise<string> {
    return this.reckless('getConsignment', () => {
      const prepared = ops.getConsignment.prepare(assetId, txid);
      return this.run('getConsignment', false, async (s) =>
        ops.getConsignment.execute(s, prepared)
      );
    });
  }

  /** `IndexerCheckApi`: the protocol of an indexer URL. Needs `init()`. */
  checkIndexerUrl(url: string) {
    const prepared = ops.checkIndexerUrl.prepare(url);
    return this.run('checkIndexerUrl', false, (s) =>
      ops.checkIndexerUrl.execute(s, prepared)
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
      { signs: true, abortable: true, prepare: ops.onchainSend.prepare },
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

  refresh(
    options?: ReadOptions & RgbLibWebCallOptions
  ): Promise<RefreshTransfersResult> {
    return this.withOptions(
      'refresh',
      // Always online; the flag is checked here, before any connect.
      (owned) => (skipSyncOf(owned?.skipSync), true),
      options,
      (s, owned) => ops.refresh.execute(s, skipSyncOf(owned?.skipSync)),
      true
    );
  }

  refreshWallet(options?: RgbLibWebCallOptions): Promise<void> {
    return this.withOptions(
      'refreshWallet',
      true,
      options,
      (s) => ops.refresh.execute(s, false),
      true
    ).then(() => undefined);
  }

  /** Both keychains, every revealed script (FullSync), as on React Native. */
  syncWallet(options?: RgbLibWebCallOptions): Promise<void> {
    return this.withOptions(
      'syncWallet',
      true,
      options,
      (s) => s.sync(s.signal),
      true
    );
  }

  // ── VSS backup (ADR-0003) ────────────────────────────────────────────────

  /** Uploads now and returns the server version. No indexer connection needed. */
  backupToVss(): Promise<number> {
    return this.runVss('backupToVss', 'VSS backup', async (s) => {
      const version = await ops.backupToVss.execute(s);
      // An explicit upload replaces the cloud copy on purpose.
      this.backupHeld = false;
      return version;
    });
  }

  /** What the VSS server holds for this wallet. No indexer connection needed. */
  getVssBackupInfo(): Promise<VssBackupInfo> {
    return this.runVss('getVssBackupInfo', 'VSS backup info', (s) =>
      ops.vssBackupInfo.execute(s)
    );
  }

  /** VSS off, or watch-only without `vss`: INVALID_CONFIG, else queued. */
  private runVss<T>(
    operation: string,
    what: string,
    task: (s: WasmSession) => Promise<T>
  ): Promise<T> {
    this.assertVssConfigured(operation);
    return this.run(operation, false, async (s) => {
      this.assertVssOn(operation, what);
      return task(s);
    });
  }

  private assertVssConfigured(operation: string): void {
    if (this.vss.kind === 'off')
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        `VSS backup is off (${this.vss.reason}); pass vssUrl or vss to turn it on`,
        operation
      );
  }

  /** Inside the task: the identity is set by the open task. */
  private assertVssOn(operation: string, what: string): void {
    if (!this.vssOn)
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        `${what} needs the mnemonic or an explicit vss config; this wallet was opened watch-only`,
        operation
      );
  }

  /**
   * Restores the wallet from its VSS backup (ADR-0003 B2). Allowed only after
   * `init()` and before the first connection; a wallet with local data needs
   * `{ overwrite: true }`. The restored state is flushed before it resolves.
   */
  restoreFromVss(options?: { overwrite?: boolean }): Promise<void> {
    const prepared = ops.restoreFromVss.prepare(snapshot(options));
    return this.runVss('restoreFromVss', 'VSS restore', async (s) => {
      // In the task: a connect queued ahead of this one (unlock() called
      // first, without awaiting) has finished by now and counts too.
      if (this.online) throw this.restoreTooLate('restoreFromVss');
      await ops.restoreFromVss.execute(s, prepared);
      // The local state is now the server copy: nothing to protect.
      this.cloudChecked = true;
      this.backupHeld = false;
    });
  }

  private restoreTooLate(operation: string): RgbLibWebError {
    return new RgbLibWebError(
      'WALLET_INVALID_STATE',
      `${operation}() runs only between init() and the first connection; destroy the wallet, create it again and restore before unlock()`,
      operation
    );
  }

  // ── byte backup (BackupExportApi, BackupRestoreApi, ADR-0003 B3) ───────────────────────────

  /** The encrypted backup as bytes. Works offline, on any wallet. */
  getReceivedMint(
    recipientId: string,
    options?: ReceivedMintOptions & RgbLibWebCallOptions
  ): Promise<ReceivedMint | undefined> {
    return this.reckless('getReceivedMint', () => {
      const id = ops.getReceivedMint.prepare(recipientId);
      const signal = signalOf(options?.signal);
      // Offline unless it refreshes incoming transfers first.
      const refreshIncoming = options?.refreshIncoming === true;
      return this.run(
        'getReceivedMint',
        refreshIncoming,
        (s) => ops.getReceivedMint.execute(s, id, refreshIncoming),
        signal
      );
    });
  }

  exportBackup(params: { password: string }): Promise<Uint8Array> {
    const prepared = ops.exportBackup.prepare(params);
    return this.run('exportBackup', false, (s) =>
      ops.exportBackup.execute(s, prepared)
    );
  }

  /**
   * Restores from `exportBackup()` bytes, with the rules of
   * `restoreFromVss()`: after `init()`, before the first connection, and
   * `overwrite` for a wallet with local data. Flushed before it resolves.
   */
  restoreBackup(params: {
    bytes: Uint8Array;
    password: string;
    overwrite?: boolean;
  }): Promise<void> {
    // Not snapshot(): it would turn the Uint8Array into a plain object.
    // prepare() copies the bytes.
    const prepared = ops.restoreBackup.prepare(params);
    return this.run('restoreBackup', false, async (s) => {
      if (this.online) throw this.restoreTooLate('restoreBackup');
      await ops.restoreBackup.execute(s, prepared);
    });
  }

  private cloudCheckDue(): boolean {
    return this.vssOn && !this.cloudChecked;
  }

  /**
   * Once, after the first connection of a wallet that was empty before it
   * (checked by the caller) and was not restored: if the server has a backup,
   * it belongs to this mnemonic from another device. Warn, and hold automatic
   * uploads so the first mutation does not replace it. A failed check is
   * logged and holds nothing.
   */
  private checkCloudBackup(): void {
    if (!this.cloudCheckDue()) return;
    this.cloudChecked = true;
    const check = this.queue
      .run(async () => {
        const s = this.session;
        if (!s) return;
        if (!(await ops.vssBackupInfo.execute(s)).backupExists) return;
        this.backupHeld = true;
        logger.warn(
          'RgbLibWeb: a VSS backup exists for this wallet but was not restored; automatic backups are held. Restore it (destroy, create again, restoreFromVss() before unlock()) or call backupToVss() to replace it with this wallet'
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
