/**
 * Raw JSON shapes returned by RlnWasmWallet / RlnWasmSdkNodeHandle *Json() methods.
 *
 * These are internal translation-layer types and are NOT exported from the package.
 * All fields may arrive as snake_case or camelCase depending on serde config;
 * normalizers in RlnWasmBinding handle both.
 */

// ─── Network ──────────────────────────────────────────────────────────────────

export type RlnBitcoinNetwork =
  | 'Mainnet'
  | 'Testnet'
  | 'Testnet4'
  | 'Signet'
  | 'Regtest'
  | string;

export type RlnDatabaseType = 'Sqlite';

export type RlnAssetSchema = 'Nia' | 'Cfa' | 'Uda' | string;

// ─── Wallet data (input to sdk.createWallet / sdk.newWallet) ─────────────────

export interface RlnWalletData {
  data_dir: string;
  bitcoin_network: RlnBitcoinNetwork;
  database_type: RlnDatabaseType;
  max_allocations_per_utxo: number;
  account_xpub_vanilla: string;
  account_xpub_colored: string;
  mnemonic: string;
  master_fingerprint: string;
  vanilla_keychain: number | null;
  supported_schemas: RlnAssetSchema[];
}

// ─── Online reference (opaque JS object from goOnlineValue) ──────────────────

/** Returned by wallet.goOnlineValue() (wasm WasmOnlineData) — pass back to every network call. */
export interface RlnOnline {
  id: string;
  indexer_url: string;
}

// ─── Balances ─────────────────────────────────────────────────────────────────

export interface RlnRawBalance {
  settled: number | bigint;
  future: number | bigint;
  spendable: number | bigint;
}

export interface RlnRawBtcBalance {
  vanilla: RlnRawBalance;
  colored: RlnRawBalance;
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export interface RlnRawAssetNia {
  asset_id?: string;
  ticker?: string;
  name?: string;
  precision?: number;
  issued_supply?: number | bigint;
  timestamp?: number;
  added_at?: number;
  balance?: RlnRawBalance;
  details?: string | null;
}

export interface RlnRawAssetCfa {
  asset_id?: string;
  name?: string;
  precision?: number;
  issued_supply?: number | bigint;
  timestamp?: number;
  added_at?: number;
  balance?: RlnRawBalance;
  details?: string | null;
}

export interface RlnRawListAssets {
  nia?: RlnRawAssetNia[];
  cfa?: RlnRawAssetCfa[];
  uda?: unknown[];
}

// ─── Transfers & Transactions ─────────────────────────────────────────────────

export interface RlnRawTransportEndpoint {
  endpoint?: string;
  transport_type?: string;
  used?: boolean;
}

/** rgb-lib `Transfer` (snake_case). */
export interface RlnRawTransfer {
  idx?: number;
  batch_transfer_idx?: number;
  created_at?: number;
  updated_at?: number;
  status?: string;
  requested_assignment?: unknown;
  assignments?: unknown[];
  kind?: string;
  txid?: string;
  recipient_id?: string;
  receive_utxo?: unknown;
  change_utxo?: unknown;
  expiration?: number | null;
  transport_endpoints?: RlnRawTransportEndpoint[];
  invoice_string?: string;
}

export interface RlnRawConfirmationTime {
  height?: number;
  timestamp?: number;
}

export interface RlnRawTransaction {
  transaction_type?: string;
  txid?: string;
  received?: number | bigint;
  sent?: number | bigint;
  fee?: number | bigint;
  confirmation_time?: RlnRawConfirmationTime | null;
}

// ─── Receive (blind / witness) ────────────────────────────────────────────────

/** rgb-lib `ReceiveData` (snake_case). */
export interface RlnRawInvoiceReceiveData {
  invoice?: string;
  recipient_id?: string;
  expiration_timestamp?: number | null;
  batch_transfer_idx?: number;
}

// ─── Unspents ─────────────────────────────────────────────────────────────────

export interface RlnRawOutpoint {
  txid?: string;
  vout?: number;
}

export interface RlnRawUtxo {
  outpoint?: RlnRawOutpoint;
  btc_amount?: number | bigint;
  colorable?: boolean;
  exists?: boolean;
}

export interface RlnRawAllocation {
  asset_id?: string | null;
  assignment?: unknown;
  settled?: boolean;
}

export interface RlnRawUnspent {
  utxo?: RlnRawUtxo;
  rgb_allocations?: RlnRawAllocation[];
  pending_blinded?: number;
}

// ─── Send result ──────────────────────────────────────────────────────────────

export interface RlnRawSendResult {
  txid?: string;
  batch_transfer_idx?: number;
}

// ─── Asset balance ────────────────────────────────────────────────────────────

export interface RlnRawAssetBalance {
  settled?: number | bigint;
  future?: number | bigint;
  spendable?: number | bigint;
  offchain_outbound?: number | bigint;
  offchain_inbound?: number | bigint;
}

// ─── Lightning ────────────────────────────────────────────────────────────────

/**
 * Shape of one entry from `RlnWasmNode.listChannelsJson()` — the serde
 * serialization of `RlnWasmNodeChannelData` (snake_case, no rename). The wasm
 * exposes only `outbound_msat` for balances; there is no inbound/remote field.
 */
export interface RlnRawChannel {
  temporary_channel_id?: string;
  channel_id?: string;
  peer_pubkey?: string;
  status?: string;
  ready?: boolean;
  is_usable?: boolean;
  public?: boolean;
  capacity_sat?: number | bigint;
  asset_id?: string | null;
  asset_local_amount?: number | bigint | null;
  virtual_open_mode?: string | null;
  /** This node's spendable outbound BTC capacity, in msat. */
  outbound_msat?: number | bigint;
  /** Largest single outbound HTLC currently sendable, in msat. */
  next_outbound_htlc_limit_msat?: number | bigint;
}

/**
 * `RlnWasmNodePaymentData` (snake_case). `invoice` is not part of that struct —
 * it is only present on the synthetic record `sendPayment()` constructs.
 */
export interface RlnRawPayment {
  payment_hash?: string;
  amt_msat?: bigint | number | null;
  status?: string;
  asset_id?: string | null;
  asset_amount?: bigint | number | null;
  invoice?: string | null;
  inbound?: boolean;
}

export interface RlnRawInvoice {
  invoice?: string;
  payment_hash?: string;
  expiry_sec?: number;
  amt_msat?: bigint | number | null;
  asset_id?: string | null;
  asset_amount?: bigint | number | null;
}

/** `RlnWasmNodePeerData`. */
export interface RlnRawPeer {
  pubkey?: string;
  peer_addr?: string | null;
  started?: boolean;
}

/** `RlnWasmNodeInfoData` (counters only; pubkey is filled from nodePubkey()). */
export interface RlnRawNodeInfo {
  pubkey?: string;
  runtime?: string;
  ldk_over_websocket?: boolean;
  num_peers?: number;
  num_channels?: number;
  num_usable_channels?: number;
}

/** `RlnWasmNodeNetworkInfoData`. */
export interface RlnRawNetworkInfo {
  network?: string;
  height?: number;
}

// ─── Recipient map (sendBegin input) ─────────────────────────────────────────

export interface RlnRawRecipient {
  recipient_id: string;
  witness_data: null | {
    amount_sat: string | number;
    blinding?: number | null;
  };
  assignment: { Fungible: number | bigint };
  transport_endpoints: string[];
}

export type RlnRawRecipientMap = Record<string, RlnRawRecipient[]>;
