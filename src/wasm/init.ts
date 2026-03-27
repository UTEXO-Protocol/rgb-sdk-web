import initWasmModule from '@utexo/rgb-lib-wasm';

let initPromise: Promise<void> | null = null;

/**
 * Initialize the WASM module. Must be called once before using any
 * WasmWallet, generate_keys, or restore_keys.
 *
 * Safe to call multiple times — subsequent calls return the same promise.
 */
export function initWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = initWasmModule().then(() => undefined);
  }
  return initPromise;
}
