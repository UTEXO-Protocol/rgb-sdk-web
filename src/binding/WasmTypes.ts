/**
 * Supplemental TypeScript types for rgb-lib WASM bindings.
 *
 * The generated `rgb_lib_wasm_bindings.d.ts` uses `any` for JSON-shaped values.
 * These definitions match the build compiled with the `camel_case` Cargo feature
 * (JSON field names use **camelCase**: `recipientId`, `dataDir`, …).
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
  dataDir: string;
  bitcoinNetwork: BitcoinNetworkName;
  databaseType: DatabaseType;
  maxAllocationsPerUtxo: number;
  accountXpubVanilla: string;
  accountXpubColored: string;
  mnemonic: string | null;
  masterFingerprint: string;
  vanillaKeychain: number | null;
  reuseAddresses: boolean;
  supportedSchemas: AssetSchema[];
}

export interface Keys {
  mnemonic: string;
  xpub: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
}

// ---------------------------------------------------------------------------
// Online & operations
// ---------------------------------------------------------------------------

export interface Online {
  id: number | bigint;
  indexerUrl: string;
}

export interface OperationResult {
  txid: string;
  batchTransferIdx: number;
}

export interface WitnessData {
  amountSat: number | bigint | string;
  blinding: number | bigint | null;
}

export interface Recipient {
  recipientId: string;
  witnessData: WitnessData | null;
  assignment: AssignmentJson;
  transportEndpoints: string[];
}

/** Map: assetId → list of recipients (input to `sendBegin`). */
export type RecipientMap = Record<string, Recipient[]>;

export interface RefreshFilter {
  status: RefreshTransferStatus;
  incoming: boolean;
}

/** Serialized `rgb_lib::Error` — structure varies by variant. */
export type RgbLibErrorJson = Record<string, unknown>;

export interface RefreshedTransfer {
  updatedStatus: TransferStatus | null;
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
  filePath: string;
  digest: string;
  mime: string;
}

export interface Metadata {
  assetSchema: AssetSchema;
  initialSupply: number | bigint;
  maxSupply: number | bigint;
  knownCirculatingSupply: number | bigint;
  timestamp: number;
  name: string;
  precision: number;
  ticker: string | null;
  details: string | null;
  rejectListUrl: string | null;
}

export interface AssetNIA {
  assetId: string;
  ticker: string;
  name: string;
  details: string | null;
  precision: number;
  issuedSupply: number | bigint;
  timestamp: number;
  addedAt: number;
  balance: Balance;
  media: Media | null;
}

export interface AssetIFA {
  assetId: string;
  ticker: string;
  name: string;
  details: string | null;
  precision: number;
  initialSupply: number | bigint;
  maxSupply: number | bigint;
  knownCirculatingSupply: number | bigint;
  timestamp: number;
  addedAt: number;
  balance: Balance;
  media: Media | null;
  rejectListUrl: string | null;
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
  recipientId: string;
  expirationTimestamp: number | null;
  batchTransferIdx: number;
}

export interface InvoiceData {
  recipientId: string;
  assetSchema: AssetSchema | null;
  assetId: string | null;
  assignment: AssignmentJson;
  assignmentName: string | null;
  network: BitcoinNetworkName;
  expirationTimestamp: number | null;
  transportEndpoints: string[];
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
  transactionType: TransactionType;
  txid: string;
  received: number | bigint;
  sent: number | bigint;
  fee: number | bigint;
  confirmationTime: BlockTime | null;
}

export interface TransferTransportEndpoint {
  endpoint: string;
  transportType: TransportType;
  used: boolean;
}

export interface Transfer {
  idx: number;
  batchTransferIdx: number;
  createdAt: number;
  updatedAt: number;
  status: TransferStatus;
  requestedAssignment: AssignmentJson | null;
  assignments: AssignmentJson[];
  kind: TransferKind;
  txid: string | null;
  recipientId: string | null;
  receiveUtxo: Outpoint | null;
  changeUtxo: Outpoint | null;
  expiration: number | null;
  transportEndpoints: TransferTransportEndpoint[];
  invoiceString: string | null;
  consignmentPath: string | null;
}

export interface RgbAllocation {
  assetId: string | null;
  assignment: AssignmentJson;
  settled: boolean;
}

export interface Utxo {
  outpoint: Outpoint;
  btcAmount: number | bigint;
  colorable: boolean;
  exists: boolean;
}

export interface Unspent {
  utxo: Utxo;
  rgbAllocations: RgbAllocation[];
  pendingBlinded: number;
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
  backupExists: boolean;
  serverVersion: number | null;
  backupRequired: boolean;
}

// ---------------------------------------------------------------------------
// Consignment validation (validateConsignmentOffchain)
// ---------------------------------------------------------------------------

export interface ConsignmentValidationResult {
  valid: boolean;
  warnings?: string[];
  error?: string;
  details?: string;
}

// ---------------------------------------------------------------------------
// Helpers: typed arguments for WasmWallet (use when the generated class still says `any`)
// ---------------------------------------------------------------------------

export type AssetSchemaFilterList = AssetSchema[];

export type U64Array = Array<number | bigint>;
