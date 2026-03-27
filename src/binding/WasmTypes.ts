/**
 * Supplemental TypeScript types for rgb-lib WASM bindings.
 *
 * The generated `rgb_lib_wasm_bindings.d.ts` uses `any` for JSON-shaped values.
 * These definitions match the default Rust build **without** the `camel_case` Cargo feature
 * (JSON field names use **snake_case**: `recipient_id`, `data_dir`, …).
 *
 * If you compile `rgb-lib-wasm` with `--features camel_case`, enable the alternate names
 * by passing `RgbLibJsonFieldStyle` (see below) or duplicate these interfaces with camelCase fields.
 *
 * u64 values crossing the WASM boundary may be `number` or `bigint` depending on magnitude
 * (serde_wasm_bindgen uses BigInt for large integers).
 */

/** JSON field naming for WalletData / Recipient / etc. Default build: snake_case. */
export type RgbLibJsonFieldStyle = 'snake_case' | 'camelCase';

// ---------------------------------------------------------------------------
// Enums (serde externally tagged where applicable)
// ---------------------------------------------------------------------------

/** RGB assignment (serde default: variant name as key for newtype variants). */
export type AssignmentJson =
  | { Fungible: number | bigint }
  | { InflationRight: number | bigint }
  | 'NonFungible'
  | 'ReplaceRight'
  | 'Any';

export type AssetSchema = 'Nia' | 'Ifa';

export type BitcoinNetworkName =
  | 'Mainnet'
  | 'Testnet'
  | 'Testnet4'
  | 'Signet'
  | 'Regtest'
  | string;

export type DatabaseType = 'Sqlite';

export type RefreshTransferStatus =
  | 'WaitingCounterparty'
  | 'WaitingConfirmations';

export type TransferStatus =
  | 'WaitingCounterparty'
  | 'WaitingConfirmations'
  | 'Settled'
  | 'Failed';

export type TransferKind =
  | 'Issuance'
  | 'ReceiveBlind'
  | 'ReceiveWitness'
  | 'Send'
  | 'Inflation';

export type TransactionType = 'RgbSend' | 'Drain' | 'CreateUtxos' | 'User';

export type TransportType = 'JsonRpc';

// ---------------------------------------------------------------------------
// WalletData & keys
// ---------------------------------------------------------------------------

export interface WalletData {
  data_dir: string;
  bitcoin_network: BitcoinNetworkName;
  database_type: DatabaseType;
  max_allocations_per_utxo: number;
  account_xpub_vanilla: string;
  account_xpub_colored: string;
  mnemonic: string | null;
  master_fingerprint: string;
  vanilla_keychain: number | null;
  supported_schemas: AssetSchema[];
}

export interface Keys {
  mnemonic: string;
  xpub: string;
  account_xpub_vanilla: string;
  account_xpub_colored: string;
  master_fingerprint: string;
}

// ---------------------------------------------------------------------------
// Online & operations
// ---------------------------------------------------------------------------

export interface Online {
  id: number | bigint;
  indexer_url: string;
}

export interface OperationResult {
  txid: string;
  batch_transfer_idx: number;
}

export interface WitnessData {
  amount_sat: number | bigint | string;
  blinding: number | bigint | null;
}

export interface Recipient {
  recipient_id: string;
  witness_data: WitnessData | null;
  assignment: AssignmentJson;
  transport_endpoints: string[];
}

/** Map: asset_id → list of recipients (input to `send_begin`). */
export type RecipientMap = Record<string, Recipient[]>;

export interface RefreshFilter {
  status: RefreshTransferStatus;
  incoming: boolean;
}

/** Serialized `rgb_lib::Error` — structure varies by variant. */
export type RgbLibErrorJson = Record<string, unknown>;

export interface RefreshedTransfer {
  updated_status: TransferStatus | null;
  failure: RgbLibErrorJson | null;
}

/** Batch transfer index → refresh outcome (object keys are numeric strings in JSON). */
export type RefreshResult = Record<string, RefreshedTransfer>;

// ---------------------------------------------------------------------------
// Balances & assets
// ---------------------------------------------------------------------------

export interface Balance {
  settled: number | bigint;
  future: number | bigint;
  spendable: number | bigint;
}

export interface BtcBalance {
  vanilla: Balance;
  colored: Balance;
}

export interface Media {
  file_path: string;
  digest: string;
  mime: string;
}

export interface Metadata {
  asset_schema: AssetSchema;
  initial_supply: number | bigint;
  max_supply: number | bigint;
  known_circulating_supply: number | bigint;
  timestamp: number;
  name: string;
  precision: number;
  ticker: string | null;
  details: string | null;
  reject_list_url: string | null;
}

export interface AssetNIA {
  asset_id: string;
  ticker: string;
  name: string;
  details: string | null;
  precision: number;
  issued_supply: number | bigint;
  timestamp: number;
  added_at: number;
  balance: Balance;
  media: Media | null;
}

export interface AssetIFA {
  asset_id: string;
  ticker: string;
  name: string;
  details: string | null;
  precision: number;
  initial_supply: number | bigint;
  max_supply: number | bigint;
  known_circulating_supply: number | bigint;
  timestamp: number;
  added_at: number;
  balance: Balance;
  media: Media | null;
  reject_list_url: string | null;
}

export interface Assets {
  nia: AssetNIA[] | null;
  ifa: AssetIFA[] | null;
}

// ---------------------------------------------------------------------------
// Receive / invoice
// ---------------------------------------------------------------------------

export interface ReceiveData {
  invoice: string;
  recipient_id: string;
  expiration_timestamp: number | null;
  batch_transfer_idx: number;
}

export interface InvoiceData {
  recipient_id: string;
  asset_schema: AssetSchema | null;
  asset_id: string | null;
  assignment: AssignmentJson;
  assignment_name: string | null;
  network: BitcoinNetworkName;
  expiration_timestamp: number | null;
  transport_endpoints: string[];
}

// ---------------------------------------------------------------------------
// Transfers & UTXOs
// ---------------------------------------------------------------------------

export interface Outpoint {
  txid: string;
  vout: number;
}

export interface BlockTime {
  height: number;
  timestamp: number | bigint;
}

export interface Transaction {
  transaction_type: TransactionType;
  txid: string;
  received: number | bigint;
  sent: number | bigint;
  fee: number | bigint;
  confirmation_time: BlockTime | null;
}

export interface TransferTransportEndpoint {
  endpoint: string;
  transport_type: TransportType;
  used: boolean;
}

export interface Transfer {
  idx: number;
  batch_transfer_idx: number;
  created_at: number;
  updated_at: number;
  status: TransferStatus;
  requested_assignment: AssignmentJson | null;
  assignments: AssignmentJson[];
  kind: TransferKind;
  txid: string | null;
  recipient_id: string | null;
  receive_utxo: Outpoint | null;
  change_utxo: Outpoint | null;
  expiration: number | null;
  transport_endpoints: TransferTransportEndpoint[];
  invoice_string: string | null;
  consignment_path: string | null;
}

export interface RgbAllocation {
  asset_id: string | null;
  assignment: AssignmentJson;
  settled: boolean;
}

export interface Utxo {
  outpoint: Outpoint;
  btc_amount: number | bigint;
  colorable: boolean;
  exists: boolean;
}

export interface Unspent {
  utxo: Utxo;
  rgb_allocations: RgbAllocation[];
  pending_blinded: number;
}

/**
 * BDK `LocalOutput` — serialized from Rust; shape follows bdk_wallet.
 * Narrow further if you depend on a fixed bdk version.
 */
export type LocalOutput = Record<string, unknown>;

// ---------------------------------------------------------------------------
// VSS backup
// ---------------------------------------------------------------------------

export interface VssBackupInfo {
  backup_exists: boolean;
  server_version: number | null;
  backup_required: boolean;
}

// ---------------------------------------------------------------------------
// Helpers: typed arguments for WasmWallet (use when the generated class still says `any`)
// ---------------------------------------------------------------------------

export type AssetSchemaFilterList = AssetSchema[];

export type U64Array = Array<number | bigint>;
