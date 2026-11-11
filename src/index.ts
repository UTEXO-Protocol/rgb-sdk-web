/**
 * `@utexo/rgb-sdk-web` — the browser RGB_L1 engine over `@utexo/rgb-lib-wasm`
 * (1.0.0-beta.4).
 *
 * `RgbLibWeb.init()` loads the WASM itself, once per page; the `wasmUrl`
 * option points it at the `.wasm` file when the bundler does not.
 */
export { RgbLibWeb } from './rgb-lib-web.js';
export { RgbLibWebError } from './errors.js';
export type { RgbLibWebErrorCode } from './errors.js';
export { DEFAULT_EVM_MINT_LOCK_BLOCKS } from './config.js';
export type {
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
