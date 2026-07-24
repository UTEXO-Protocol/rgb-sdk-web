// Web-only RGB wire shapes.
//
// `Unspent`, `Utxo` and `RgbAllocation` are core's definitions (the single
// source of truth for what `listUnspents()` returns); what remains here is
// genuinely wire-shaped and web-specific.

/**
 * Raw assignment map as the wasm binding emits it, e.g. `{ Fungible: 100 }`.
 *
 * The domain equivalent is core's `Assignment` (`{ type, amount? }`). Use this
 * only when reading un-mapped binding output.
 */
export interface BindingAssignment {
  [key: string]: number;
}

/** Raw `decodeRgbInvoice` response from the wasm binding (un-mapped). */
export interface DecodeRgbInvoiceResponse {
  recipientId: string;
  assetSchema?: string;
  assetId?: string;
  network: string;
  assignment: BindingAssignment;
  assignmentName?: string;
  expirationTimestamp?: number;
  transportEndpoints: string[];
}
