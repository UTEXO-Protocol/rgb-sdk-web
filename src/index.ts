/**
 * `@utexo/rgb-sdk-web` — the browser RGB_L1 engine over `@utexo/rgb-lib-wasm`
 * (1.0.0-beta.4).
 *
 * For now the app imports `@utexo/rgb-lib-wasm`, awaits its default `init()`
 * and passes the module to `RgbLibWeb`. Loading the runtime inside the
 * package is ADR-0004 step 3.
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
} from './runtime.js';
