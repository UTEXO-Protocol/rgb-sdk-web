import init from '@utexo/rln-wasm';

let initPromise: Promise<void> | null = null;

/**
 * Initialize the RLN WASM module. Must be called once before using any
 * RlnWasmSdk, RlnWasmWallet, or RlnWasmNode.
 *
 * Safe to call multiple times — subsequent calls return the same promise.
 * Independent from initWasm() — the two WASM bundles have separate memory spaces.
 */
export function initRlnWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = init().then(() => undefined);
  }
  return initPromise;
}
