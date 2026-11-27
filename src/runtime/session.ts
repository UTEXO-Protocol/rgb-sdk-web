/**
 * One open rgb-lib-wasm wallet: a thin wrapper that opens and closes it,
 * holds the online handle, syncs, signs and flushes (ADR-0002 step 4). It
 * takes and returns WASM values; the operations (`operations.ts`) build the
 * arguments and decode the results. Calls must be serialized by the caller:
 * the WASM wallet panics on overlapping calls. Nothing here enqueues work.
 *
 * Called by: `backend.ts` (open, connect, close) and `operations.ts` (the
 * wallet calls). Depends on: `types.ts`, `codec.ts` (scalars), `config.ts`,
 * `keys.ts`, `errors.ts`.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Network } from '@utexo/rgb-sdk-core';
import type {
  ResolvedRgbLibWebConfig,
  RgbLibWebWitnessVersion,
} from '../config.js';
import { record, str } from './codec.js';
import { RgbLibWebError } from '../errors.js';
import type { RgbLibWebPublicKeys } from '../keys.js';
import { acquireWalletLock, walletLockName } from './lock.js';
import type { WalletLease } from './lock.js';
import type { RgbLibWasmRuntime, RgbLibWasmWallet } from './types.js';

/** rgb-lib-wasm's `BitcoinNetwork` serde names. `utexo` is a signet. */
const WASM_NETWORKS: Readonly<Record<Network, string>> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet',
  testnet4: 'Testnet4',
  signet: 'Signet',
  utexo: 'Signet',
  regtest: 'Regtest',
};

/** The network names the React Native bridge uses, also in the wallet ID. */
const BRIDGE_NETWORKS: Readonly<Record<Network, string>> = {
  mainnet: 'mainnet',
  testnet: 'testnet',
  testnet4: 'testnet4',
  signet: 'signet',
  utexo: 'signet',
  regtest: 'regtest',
};

/** rgb-lib's `WitnessVersion` serde names, by the React Native option values. */
const WITNESS_VERSIONS: Readonly<Record<RgbLibWebWitnessVersion, string>> = {
  'taproot': 'Taproot',
  'segwit-v0': 'SegWitV0',
};

/**
 * What `goOnline` passes besides the connection, as on React Native: the
 * vanilla addresses a FastSync checks before the last used one, and how long
 * the script of a failed witness receive stays watched (one day).
 */
const VANILLA_SYNC_LOOKBACK = 20;
const FAILED_WITNESS_RECEIVE_GRACE_SECS = 86400;

/** Every schema this rgb-lib has; it rejects an empty list. */
const ALL_SCHEMAS = ['Nia', 'Ifa', 'Bfa'] as const;
/** The schemas rgb-lib allows on mainnet without `allowRecklessSchemas`. */
const MAINNET_SCHEMAS = ['Nia'] as const;

/**
 * The schemas a wallet opens with: rgb-lib refuses a mainnet wallet that
 * supports IFA or BFA unless `allowRecklessSchemas` is set, so without it a
 * mainnet wallet gets the mainnet schemas only.
 */
export function supportedSchemas(
  network: Network,
  allowRecklessSchemas: boolean
): readonly string[] {
  return network === 'mainnet' && !allowRecklessSchemas
    ? MAINNET_SCHEMAS
    : ALL_SCHEMAS;
}

export interface SessionOptions {
  network: Network;
  dataDir: string;
  witnessVersion: RgbLibWebWitnessVersion;
  maxAllocationsPerUtxo: number;
  allowRecklessSchemas: boolean;
}

// ── session ─────────────────────────────────────────────────────────────────

export class WasmSession {
  private online?: unknown;
  /**
   * The `AbortSignal` of the call running now, set by the backend around
   * each queued task (tasks never overlap). The long runtime calls take it.
   */
  signal: AbortSignal | undefined;

  private constructor(
    private readonly runtime: RgbLibWasmRuntime,
    /** The WASM wallet; operations call it directly. */
    readonly wallet: RgbLibWasmWallet,
    /** The wallet's network as the runtime names it (`Regtest`, …). */
    readonly wasmNetwork: string,
    readonly identity: { id: string; network: string },
    /** Names the VSS store (`wallet_<masterFingerprint>`). */
    readonly masterFingerprint: string,
    /** The Web Lock on this wallet's snapshot; released on close. */
    private readonly release: WalletLease
  ) {}

  /**
   * Derives the public keys from the mnemonic (checking given ones against
   * them) or opens watch-only from public keys, then opens the wallet and
   * restores its IndexedDB state. The wallet's Web Lock is taken first:
   * `WALLET_STORAGE_IN_USE` when it is already open elsewhere.
   */
  static async open(
    runtime: RgbLibWasmRuntime,
    options: SessionOptions,
    mnemonic: string | null,
    given: Readonly<RgbLibWebPublicKeys> | undefined
  ): Promise<WasmSession> {
    const bridgeNetwork = BRIDGE_NETWORKS[options.network];
    const wasmNetwork = WASM_NETWORKS[options.network];
    const witnessVersion = WITNESS_VERSIONS[options.witnessVersion];
    let keys: RgbLibWebPublicKeys | undefined;
    if (mnemonic !== null) {
      const derived = record(
        runtime.restoreKeys(bridgeNetwork, mnemonic, witnessVersion),
        'keys'
      );
      keys = {
        accountXpubVanilla: str(derived.accountXpubVanilla, 'vanilla xpub'),
        accountXpubColored: str(derived.accountXpubColored, 'colored xpub'),
        masterFingerprint: str(derived.masterFingerprint, 'fingerprint'),
      };
      if (
        given &&
        (given.accountXpubVanilla !== keys.accountXpubVanilla ||
          given.accountXpubColored !== keys.accountXpubColored ||
          given.masterFingerprint.toLowerCase() !==
            keys.masterFingerprint.toLowerCase())
      )
        throw new RgbLibWebError(
          'INVALID_CONFIG',
          'The public keys do not match the mnemonic'
        );
    } else {
      keys = given ? { ...given } : undefined;
    }
    if (!keys)
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        'A mnemonic or public keys are required'
      );
    // The same ID as the React Native engine for the same keys and network.
    const id = bytesToHex(
      sha256(
        utf8ToBytes(
          `${bridgeNetwork}:${options.witnessVersion}:${keys.accountXpubVanilla}:${keys.accountXpubColored}`
        )
      )
    );
    const release = await acquireWalletLock(
      walletLockName(options.dataDir, keys.masterFingerprint, bridgeNetwork)
    );
    let wallet: RgbLibWasmWallet;
    try {
      wallet = await runtime.WasmWallet.create(
        JSON.stringify({
          dataDir: options.dataDir,
          bitcoinNetwork: wasmNetwork,
          databaseType: 'Sqlite',
          maxAllocationsPerUtxo: options.maxAllocationsPerUtxo,
          supportedSchemas: supportedSchemas(
            options.network,
            options.allowRecklessSchemas
          ),
          allowRecklessSchemas: options.allowRecklessSchemas,
        }),
        JSON.stringify({
          accountXpubVanilla: keys.accountXpubVanilla,
          accountXpubColored: keys.accountXpubColored,
          masterFingerprint: keys.masterFingerprint,
          vanillaKeychain: null,
          witnessVersion,
          mnemonic,
        })
      );
    } catch (error) {
      release();
      throw error;
    }
    return new WasmSession(
      runtime,
      wallet,
      wasmNetwork,
      { id, network: bridgeNetwork },
      keys.masterFingerprint,
      release
    );
  }

  /**
   * Writes pending state to IndexedDB, then releases the WASM wallet and its
   * lock. A failed flush keeps both, so a retry can flush again.
   */
  async close(): Promise<void> {
    await this.wallet.flush();
    this.online = undefined;
    this.wallet.free();
    this.release();
  }

  /** The online handle; WALLET_OFFLINE before goOnline. */
  connected(): unknown {
    if (this.online === undefined)
      throw new RgbLibWebError(
        'WALLET_OFFLINE',
        'Call unlock() before this operation'
      );
    return this.online;
  }

  /**
   * The online handle for a read that syncs first unless `skipSync`; a read
   * that skips works offline (null).
   */
  readHandle(skipSync: boolean): unknown {
    return skipSync ? (this.online ?? null) : this.connected();
  }

  async goOnline(
    config: ResolvedRgbLibWebConfig,
    signal?: AbortSignal
  ): Promise<void> {
    const ids = Object.keys(config.evmRpcUrls);
    this.online = await this.wallet.goOnline(
      {
        indexerConfig: { Esplora: { url: config.indexer.url } },
        skipConsistencyCheck: false,
        failedWitnessReceiveGraceSecs: FAILED_WITNESS_RECEIVE_GRACE_SECS,
        vanillaSyncLookback: VANILLA_SYNC_LOOKBACK,
        proxyAuthKeys: { ...config.proxyAuthKeys },
        evmChains: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              rpcUrl: config.evmRpcUrls[id]!,
              minMintLockBlocks: BigInt(config.evmMintLockBlocks[id]!.min),
              maxMintLockBlocks: BigInt(config.evmMintLockBlocks[id]!.max),
            },
          ])
        ),
      },
      signal
    );
  }

  /**
   * Synchronous WASM mutations queue their IndexedDB save and return before
   * it commits; success is reported only once the state is stored.
   */
  async persisted<T>(value: T): Promise<T> {
    await this.wallet.flush();
    return value;
  }

  /**
   * Syncs both keychains with every revealed script, as `syncWallet()` does on
   * React Native: the colored one, then the vanilla one.
   */
  async sync(signal?: AbortSignal): Promise<void> {
    const online = this.connected();
    await this.wallet.sync(
      online,
      { keychain: 'Colored', strategy: 'FullSync' },
      signal
    );
    await this.wallet.sync(
      online,
      {
        keychain: { Vanilla: { lookback: VANILLA_SYNC_LOOKBACK } },
        strategy: 'FullSync',
      },
      signal
    );
  }

  /** Signs a PSBT with the wallet keys and the default options (synchronous). */
  sign(psbt: string): string {
    return this.wallet.signPsbt(psbt, null);
  }

  /** The raw `checkIndexerUrl()` result (`"Esplora"`) for this wallet's network. */
  checkIndexerUrl(url: string): Promise<unknown> {
    return this.runtime.checkIndexerUrl(url, this.identity.network);
  }

  /** The raw `inspectConsignment()` of consignment bytes (no wallet needed). */
  inspectConsignment(consignment: Uint8Array, bundleFilter: unknown): unknown {
    return this.runtime.inspectConsignment(consignment, bundleFilter);
  }

  /** The raw `invoiceData()` of an invoice string; the handle is freed. */
  invoiceData(invoice: string): unknown {
    const parsed = new this.runtime.WasmInvoice(invoice);
    try {
      return parsed.invoiceData();
    } finally {
      parsed.free();
    }
  }
}
