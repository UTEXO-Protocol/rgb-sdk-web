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

/** Opaque object returned by wallet.goOnlineValue() — pass back to every network call. */
export type RlnOnline = object;

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
  assetId?: string;
  ticker?: string;
  name?: string;
  precision?: number;
  issued_supply?: number | bigint;
  issuedSupply?: number | bigint;
  timestamp?: number;
  added_at?: number;
  addedAt?: number;
  balance?: RlnRawBalance;
  details?: string | null;
}

export interface RlnRawAssetCfa {
  asset_id?: string;
  assetId?: string;
  name?: string;
  precision?: number;
  issued_supply?: number | bigint;
  issuedSupply?: number | bigint;
  timestamp?: number;
  added_at?: number;
  addedAt?: number;
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
  transportType?: string;
  used?: boolean;
}

export interface RlnRawTransfer {
  idx?: number;
  batch_transfer_idx?: number;
  batchTransferIdx?: number;
  created_at?: number;
  createdAt?: number;
  updated_at?: number;
  updatedAt?: number;
  status?: string;
  requested_assignment?: unknown;
  requestedAssignment?: unknown;
  assignments?: unknown[];
  kind?: string;
  txid?: string;
  recipient_id?: string;
  recipientId?: string;
  receive_utxo?: unknown;
  receiveUtxo?: unknown;
  change_utxo?: unknown;
  changeUtxo?: unknown;
  expiration?: number | null;
  transport_endpoints?: RlnRawTransportEndpoint[];
  transportEndpoints?: RlnRawTransportEndpoint[];
  invoice_string?: string;
  invoiceString?: string;
}

export interface RlnRawConfirmationTime {
  height?: number;
  timestamp?: number;
}

export interface RlnRawTransaction {
  transaction_type?: string;
  transactionType?: string;
  txid?: string;
  received?: number | bigint;
  sent?: number | bigint;
  fee?: number | bigint;
  confirmation_time?: RlnRawConfirmationTime | null;
  confirmationTime?: RlnRawConfirmationTime | null;
}

// ─── Receive (blind / witness) ────────────────────────────────────────────────

export interface RlnRawInvoiceReceiveData {
  invoice?: string;
  invoice_string?: string;
  invoiceString?: string;
  recipient_id?: string;
  recipientId?: string;
  expiration_timestamp?: number | null;
  expirationTimestamp?: number | null;
  batch_transfer_idx?: number;
  batchTransferIdx?: number;
}

// ─── Unspents ─────────────────────────────────────────────────────────────────

export interface RlnRawOutpoint {
  txid?: string;
  vout?: number;
}

export interface RlnRawUtxo {
  outpoint?: RlnRawOutpoint;
  btc_amount?: number | bigint;
  btcAmount?: number | bigint;
  colorable?: boolean;
  exists?: boolean;
}

export interface RlnRawAllocation {
  asset_id?: string | null;
  assetId?: string | null;
  assignment?: unknown;
  settled?: boolean;
}

export interface RlnRawUnspent {
  utxo?: RlnRawUtxo;
  rgb_allocations?: RlnRawAllocation[];
  rgbAllocations?: RlnRawAllocation[];
  pending_blinded?: number;
  pendingBlinded?: number;
}

// ─── Send result ──────────────────────────────────────────────────────────────

export interface RlnRawSendResult {
  txid?: string;
  batch_transfer_idx?: number;
  batchTransferIdx?: number;
}

// ─── Asset balance ────────────────────────────────────────────────────────────

export interface RlnRawAssetBalance {
  settled?: number | bigint;
  future?: number | bigint;
  spendable?: number | bigint;
  offchain_outbound?: number | bigint;
  offchainOutbound?: number | bigint;
  offchain_inbound?: number | bigint;
  offchainInbound?: number | bigint;
}

// ─── Lightning ────────────────────────────────────────────────────────────────

export interface RlnRawChannel {
  channel_id?: string;
  channelId?: string;
  peer_pubkey?: string;
  peerPubkey?: string;
  capacity_sat?: number | bigint;
  capacitySat?: number | bigint;
  local_balance_msat?: number | bigint;
  localBalanceMsat?: number | bigint;
  remote_balance_msat?: number | bigint;
  remoteBalanceMsat?: number | bigint;
  is_public?: boolean;
  isPublic?: boolean;
  public?: boolean;
  is_active?: boolean;
  isActive?: boolean;
  ready?: boolean;
  asset_id?: string | null;
  assetId?: string | null;
  asset_local_amount?: number | bigint | null;
  assetLocalAmount?: number | bigint | null;
}

export interface RlnRawPayment {
  payment_hash?: string;
  paymentHash?: string;
  amt_msat?: bigint | number | null;
  amtMsat?: bigint | number | null;
  status?: string;
  asset_id?: string | null;
  assetId?: string | null;
  asset_amount?: bigint | number | null;
  assetAmount?: bigint | number | null;
  invoice?: string | null;
  inbound?: boolean;
}

export interface RlnRawInvoice {
  invoice?: string;
  payment_hash?: string;
  paymentHash?: string;
  expiry_sec?: number;
  expirySec?: number;
  amt_msat?: bigint | number | null;
  amtMsat?: bigint | number | null;
  asset_id?: string | null;
  assetId?: string | null;
  asset_amount?: bigint | number | null;
  assetAmount?: bigint | number | null;
}

export interface RlnRawPeer {
  pubkey?: string;
  address?: string | null;
}

export interface RlnRawNodeInfo {
  pubkey?: string;
  num_channels?: number;
  numChannels?: number;
  num_usable_channels?: number;
  numUsableChannels?: number;
  local_balance_msat?: number | bigint;
  localBalanceMsat?: number | bigint;
}

export interface RlnRawNetworkInfo {
  network?: string;
  block_height?: number;
  blockHeight?: number;
}

// ─── Recipient map (sendBegin input) ─────────────────────────────────────────

export interface RlnRawRecipient {
  recipient_id: string;
  witness_data: null | { amount_sat: string | number; blinding?: number | null };
  assignment: { Fungible: number | bigint };
  transport_endpoints: string[];
}

export type RlnRawRecipientMap = Record<string, RlnRawRecipient[]>;
