/**
 * `@utexo/rgb-sdk-web` — the browser RGB_L1 engine over `@utexo/rgb-lib-wasm`
 * (1.0.0-beta.4).
 *
 * `RgbLibWeb.create({ network, mnemonic })` loads the WASM (once per page),
 * opens the wallet and returns it. `generateKeys` comes from
 * `@utexo/rgb-sdk-core` and needs no WASM.
 *
 * Exports only. Layout: `rgb-lib-web.ts` (public API) → `backend.ts`
 * (lifecycle, queue) → `operations.ts` (rules) → `runtime/` (everything tied
 * to the rgb-lib-wasm version). `config.ts`, `keys.ts` and `errors.ts` are
 * shared.
 */
export { RgbLibWeb } from './rgb-lib-web.js';
export { generateKeys } from '@utexo/rgb-sdk-core';
export type { GeneratedKeys } from '@utexo/rgb-sdk-core';
export { RgbLibWebError } from './errors.js';
export type { RgbLibWebErrorCode } from './errors.js';
export { DEFAULT_EVM_MINT_LOCK_BLOCKS } from './config.js';
export type {
  RgbLibWebConfig,
  RgbLibWebIndexer,
  RgbLibWebMintLockBlocks,
  RgbLibWebOptions,
  RgbLibWebParams,
  RgbLibWebUnlockParams,
} from './config.js';
export type {
  IRgbLibWebKeyProvider,
  RgbLibWebKeys,
  RgbLibWebMnemonicReader,
  RgbLibWebMnemonicResult,
  RgbLibWebPublicKeys,
} from './keys.js';
export type {
  RgbLibWasmInvoice,
  RgbLibWasmRuntime,
  RgbLibWasmWallet,
} from './runtime/types.js';
