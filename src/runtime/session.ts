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
import type { ResolvedRgbLibWebConfig } from '../config.js';
import { record, str } from './codec.js';
import { RgbLibWebError } from '../errors.js';
import type { RgbLibWebPublicKeys } from '../keys.js';
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

export interface SessionOptions {
  network: Network;
  dataDir: string;
  maxAllocationsPerUtxo: number;
  reuseAddresses: boolean;
}

// ── session ─────────────────────────────────────────────────────────────────

export class WasmSession {
  private online?: unknown;

  private constructor(
    private readonly runtime: RgbLibWasmRuntime,
    /** The WASM wallet; operations call it directly. */
    readonly wallet: RgbLibWasmWallet,
    /** The wallet's network as the runtime names it (`Regtest`, …). */
    readonly wasmNetwork: string,
    readonly identity: { id: string; network: string }
  ) {}

  /**
   * Derives the public keys from the mnemonic (checking given ones against
   * them) or opens watch-only from public keys, then opens the wallet and
   * restores its IndexedDB state.
   */
  static async open(
    runtime: RgbLibWasmRuntime,
    options: SessionOptions,
    mnemonic: string | null,
    given: Readonly<RgbLibWebPublicKeys> | undefined
  ): Promise<WasmSession> {
    const bridgeNetwork = BRIDGE_NETWORKS[options.network];
    const wasmNetwork = WASM_NETWORKS[options.network];
    let keys: RgbLibWebPublicKeys | undefined;
    if (mnemonic !== null) {
      const derived = record(
        runtime.restoreKeys(bridgeNetwork, mnemonic),
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
          `${bridgeNetwork}:taproot:${keys.accountXpubVanilla}:${keys.accountXpubColored}`
        )
      )
    );
    const wallet = await runtime.WasmWallet.create(
      JSON.stringify({
        dataDir: options.dataDir,
        bitcoinNetwork: wasmNetwork,
        databaseType: 'Sqlite',
        maxAllocationsPerUtxo: options.maxAllocationsPerUtxo,
        accountXpubVanilla: keys.accountXpubVanilla,
        accountXpubColored: keys.accountXpubColored,
        mnemonic,
        masterFingerprint: keys.masterFingerprint,
        vanillaKeychain: null,
        // Every schema this rgb-lib has; it rejects an empty list.
        supportedSchemas: ['Nia', 'Ifa', 'Bfa'],
        reuseAddresses: options.reuseAddresses,
      })
    );
    return new WasmSession(runtime, wallet, wasmNetwork, {
      id,
      network: bridgeNetwork,
    });
  }

  /** Writes pending state to IndexedDB, then releases the WASM wallet. */
  async close(): Promise<void> {
    await this.wallet.flush();
    this.online = undefined;
    this.wallet.free();
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

  /** Reads that sync first: the WASM reads themselves never sync. */
  async syncFirst(skipSync: boolean): Promise<void> {
    if (!skipSync) await this.wallet.sync(this.connected());
  }

  async goOnline(config: ResolvedRgbLibWebConfig): Promise<void> {
    const ids = Object.keys(config.evmRpcUrls);
    this.online = await this.wallet.goOnline({
      indexerConfig: { Esplora: { url: config.indexer.url } },
      skipConsistencyCheck: false,
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
    });
  }

  /**
   * Synchronous WASM mutations queue their IndexedDB save and return before
   * it commits; success is reported only once the state is stored.
   */
  async persisted<T>(value: T): Promise<T> {
    await this.wallet.flush();
    return value;
  }

  async sync(): Promise<void> {
    await this.wallet.sync(this.connected());
  }

  /** Signs a PSBT with the wallet keys (synchronous in the runtime). */
  sign(psbt: string): string {
    return this.wallet.signPsbt(psbt);
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
