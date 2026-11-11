import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Network } from '@utexo/rgb-sdk-core';
import type { ResolvedRgbLibWebConfig } from './config.js';
import {
  decodeAssets,
  decodeBalance,
  decodeBtcBalance,
  decodeFeeEstimate,
  decodeIfa,
  decodeInvoice,
  decodeNia,
  decodeOperation,
  decodeReceive,
  decodeRefresh,
  decodeTransactions,
  decodeTransfers,
  decodeUnspents,
  encodeAssignment,
  bool,
  int,
  record,
  str,
} from './codec.js';
import type {
  AssetIfaExact,
  AssetNia,
  Assets,
  Balance,
  BtcBalance,
  Invoice,
  Operation,
  ReceiveData,
  Refreshed,
  Transfer,
  Unspent,
  WalletTransaction,
} from './codec.js';
import { RgbLibWebError } from './errors.js';
import type { RgbLibWebPublicKeys } from './keys.js';
import type { RgbLibWasmRuntime, RgbLibWasmWallet } from './runtime/types.js';

/**
 * One open rgb-lib-wasm wallet. It plays the part of the React Native bridge
 * (`RgbLibSessionStore.kt`): same operations, same rules. Results are decoded
 * by `codec.ts` into exact internal values (ADR-0002 step 3). Calls must be
 * serialized by the caller: the WASM wallet panics on overlapping calls.
 */

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

/** rgb-lib's own default: invoices without `exp` get one hour. */
const DEFAULT_SEND_EXPIRY_SECONDS = 3600n;
/** Time left to detect the ACK and broadcast before the invoice expires. */
const SEND_EXPIRY_MARGIN_SECONDS = 600n;

export interface SessionOptions {
  network: Network;
  dataDir: string;
  maxAllocationsPerUtxo: number;
  reuseAddresses: boolean;
}

function fail(message: string): never {
  throw new RgbLibWebError('INVALID_PARAMS', message);
}

// ── session ─────────────────────────────────────────────────────────────────

export class WasmSession {
  private online?: unknown;

  private constructor(
    private readonly runtime: RgbLibWasmRuntime,
    private readonly wallet: RgbLibWasmWallet,
    private readonly wasmNetwork: string,
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

  private connected(): unknown {
    if (this.online === undefined)
      throw new RgbLibWebError(
        'WALLET_OFFLINE',
        'Call unlock() before this operation'
      );
    return this.online;
  }

  /** Reads that sync first: the WASM reads themselves never sync. */
  private async syncFirst(skipSync: boolean) {
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
  private async persisted<T>(value: T): Promise<T> {
    await this.wallet.flush();
    return value;
  }

  async getAddress(): Promise<string> {
    return this.persisted(str(this.wallet.getAddress(), 'address'));
  }

  async getBtcBalance(skipSync: boolean): Promise<BtcBalance> {
    await this.syncFirst(skipSync);
    return decodeBtcBalance(this.wallet.getBtcBalance());
  }

  async getAssetBalance(assetId: string): Promise<Balance> {
    return decodeBalance(this.wallet.getAssetBalance(assetId));
  }

  async listAssets(schemas: string[]): Promise<Assets> {
    return decodeAssets(this.wallet.listAssets(schemas));
  }

  async listUnspents(skipSync: boolean): Promise<Unspent[]> {
    await this.syncFirst(skipSync);
    return decodeUnspents(this.wallet.listUnspents(false));
  }

  async listTransactions(skipSync: boolean): Promise<WalletTransaction[]> {
    await this.syncFirst(skipSync);
    return decodeTransactions(this.wallet.listTransactions());
  }

  async listTransfers(assetId: string | null): Promise<Transfer[]> {
    // AssetFilter is camelCase in this build: "any" or { id }.
    const filter = assetId === null ? 'any' : { id: assetId };
    return decodeTransfers(this.wallet.listTransfers(filter, null));
  }

  /** Begin, sign with the wallet keys, end. */
  async createUtxos(
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: string,
    skipSync: boolean
  ): Promise<number> {
    const online = this.connected();
    const psbt = await this.wallet.createUtxosBegin(
      online,
      upTo,
      num,
      size,
      BigInt(feeRate),
      skipSync
    );
    const signed = this.wallet.signPsbt(psbt);
    return int(
      await this.wallet.createUtxosEnd(online, signed, skipSync),
      'created UTXOs',
      'u8'
    );
  }

  async sendBtc(
    address: string,
    amount: string,
    feeRate: string,
    skipSync: boolean
  ): Promise<string> {
    const online = this.connected();
    const psbt = await this.wallet.sendBtcBegin(
      online,
      address,
      BigInt(amount),
      BigInt(feeRate),
      skipSync
    );
    const signed = this.wallet.signPsbt(psbt);
    return str(await this.wallet.sendBtcEnd(online, signed, skipSync), 'txid');
  }

  async receive(
    witness: boolean,
    assetId: string | null,
    kind: string,
    amount: string | null,
    expirationTimestamp: string,
    transportEndpoints: string[],
    minConfirmations: number
  ): Promise<ReceiveData> {
    const wireAssignment =
      kind === 'Fungible' || kind === 'InflationRight'
        ? { [kind]: BigInt(amount ?? fail(`${kind} receive requires amount`)) }
        : kind;
    const args = [
      this.connected(),
      assetId,
      wireAssignment,
      BigInt(expirationTimestamp),
      transportEndpoints,
      minConfirmations,
      null,
    ] as const;
    return decodeReceive(
      await (witness
        ? this.wallet.witnessReceive(...args)
        : this.wallet.blindReceive(...args))
    );
  }

  private parseInvoice(invoice: string) {
    const parsed = new this.runtime.WasmInvoice(invoice);
    try {
      return decodeInvoice(parsed.invoiceData());
    } finally {
      parsed.free();
    }
  }

  async decodeInvoice(invoice: string): Promise<Invoice> {
    return this.parseInvoice(invoice);
  }

  /** The Kotlin bridge's `send()`: invoice checks, then begin, sign, end. */
  async send(
    invoice: string,
    assetId: string | null,
    amount: string | null,
    witnessAmountSat: string | null,
    witnessBlinding: string | null,
    donation: boolean,
    feeRate: string,
    minConfirmations: number,
    senderTransportEndpoint: string
  ): Promise<Operation> {
    const online = this.connected();
    const dto = this.parseInvoice(invoice);
    if (dto.wasmNetwork !== this.wasmNetwork)
      fail('Invoice network does not match wallet');
    if (assetId !== null && dto.assetId !== null && assetId !== dto.assetId)
      fail('Asset override does not match invoice');
    const asset = dto.assetId ?? assetId ?? fail('Asset ID is required');
    const n = amount === null ? null : BigInt(amount);
    let wireAssignment: unknown;
    if (dto.assignment.type === 'Any') {
      if (n === null || n === 0n) fail('Amount is required');
      wireAssignment = { Fungible: n };
    } else if (dto.assignment.type === 'Fungible') {
      if (n !== null && n !== dto.assignment.amount)
        fail('Amount override does not match invoice');
      wireAssignment = encodeAssignment(dto.assignment);
    } else {
      if (n !== null) fail('Amount override is incompatible with invoice');
      wireAssignment = encodeAssignment(dto.assignment);
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    const invoiceExpiry = dto.expirationTimestamp;
    let expiry: bigint;
    if (invoiceExpiry === null) expiry = now + DEFAULT_SEND_EXPIRY_SECONDS;
    else if (invoiceExpiry <= now + SEND_EXPIRY_MARGIN_SECONDS)
      fail('Invoice expires too soon');
    else expiry = invoiceExpiry - SEND_EXPIRY_MARGIN_SECONDS;
    const recipient = {
      recipientId: dto.recipientId,
      witnessData:
        witnessAmountSat === null
          ? null
          : { amountSat: witnessAmountSat, blinding: witnessBlinding },
      assignment: wireAssignment,
      transportEndpoints: dto.transportEndpoints,
      publicKey: dto.publicKey,
      encryption: dto.encryption,
      expirationTimestamp: invoiceExpiry,
    };
    const begun = record(
      await this.wallet.sendBegin(
        online,
        { [asset]: [recipient] },
        donation,
        BigInt(feeRate),
        minConfirmations,
        expiry,
        senderTransportEndpoint,
        null,
        false
      ),
      'send begin result'
    );
    const signed = this.wallet.signPsbt(str(begun.psbt, 'PSBT'));
    return decodeOperation(await this.wallet.sendEnd(online, signed, false));
  }

  async issueAssetNia(
    ticker: string,
    name: string,
    precision: number,
    amounts: string[]
  ): Promise<AssetNia> {
    return this.persisted(
      decodeNia(
        this.wallet.issueAssetNia(
          ticker,
          name,
          precision,
          amounts.map((n) => BigInt(n))
        )
      )
    );
  }

  async issueAssetIfa(
    ticker: string,
    name: string,
    precision: number,
    amounts: string[],
    inflationAmounts: string[],
    rejectListUrl: string | null
  ): Promise<AssetIfaExact> {
    return this.persisted(
      decodeIfa(
        this.wallet.issueAssetIfa(
          ticker,
          name,
          precision,
          amounts.map((n) => BigInt(n)),
          inflationAmounts.map((n) => BigInt(n)),
          rejectListUrl,
          // As on React Native: no link right, not linked from a contract.
          false,
          null
        )
      )
    );
  }

  async inflate(
    assetId: string,
    amounts: string[],
    feeRate: string,
    minConfirmations: number
  ): Promise<Operation> {
    const online = this.connected();
    const psbt = await this.wallet.inflateBegin(
      online,
      assetId,
      amounts.map((n) => BigInt(n)),
      BigInt(feeRate),
      minConfirmations
    );
    const signed = this.wallet.signPsbt(psbt);
    return decodeOperation(await this.wallet.inflateEnd(online, signed));
  }

  async failTransfers(
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<boolean> {
    return bool(
      await this.wallet.failTransfers(
        this.connected(),
        batchTransferIdx,
        noAssetOnly,
        skipSync
      ),
      'fail transfers result'
    );
  }

  async refresh(skipSync: boolean): Promise<Refreshed[]> {
    return decodeRefresh(
      await this.wallet.refresh(this.connected(), null, [], skipSync)
    );
  }

  async sync(): Promise<void> {
    await this.wallet.sync(this.connected());
  }

  async estimateFeeRate(blocks: number): Promise<number> {
    return decodeFeeEstimate(
      await this.wallet.getFeeEstimation(this.connected(), blocks)
    );
  }
}
