// Web-only RGB wire shapes.
//
// `Unspent`, `Utxo` and `RgbAllocation` used to be declared here and re-exported
// from `src/index.ts`, shadowing core's definitions of the same names — with
// *different* shapes (`pendingBlinded` sat on `Utxo` here but on `Unspent` in
// core; `assignment` was a raw map rather than the `Assignment` union).
//
// They were never what this SDK actually returns: `listUnspents()` resolves
// core's `Unspent`. So the exported types disagreed with the runtime values.
// They are gone; core's definitions are the single source of truth.
//
// What remains is genuinely wire-shaped and web-specific.

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
