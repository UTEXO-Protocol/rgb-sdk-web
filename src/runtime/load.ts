import initRgbLibWasm, * as rgbLibWasm from '@utexo/rgb-lib-wasm';
import { RgbLibWebError } from '../errors.js';
import type { RgbLibWasmRuntime } from './types.js';

/** One load per page, shared by every wallet; cleared after a failure so a retry loads again. */
let loading: Promise<RgbLibWasmRuntime> | undefined;
let loadedFrom: string | undefined;

/**
 * Initializes `@utexo/rgb-lib-wasm` once per page and returns the module.
 *
 * Without `wasmUrl`, the module fetches `rgb_lib_wasm_bindings_bg.wasm` next
 * to its own JS file; the app's bundler decides where that is. The first call
 * picks the URL. A later call with another URL is `INVALID_CONFIG`, because a
 * page holds one WASM instance.
 */
export function loadRgbLibWasm(
  wasmUrl: string | URL | undefined,
  operation: string
): Promise<RgbLibWasmRuntime> {
  const from = wasmUrl === undefined ? undefined : String(wasmUrl);
  if (loading) {
    if (from !== undefined && from !== loadedFrom) {
      return Promise.reject(
        new RgbLibWebError(
          'INVALID_CONFIG',
          `@utexo/rgb-lib-wasm is already loaded from ${loadedFrom ?? 'its default URL'}; a page holds one WASM instance`,
          operation
        )
      );
    }
    return loading;
  }
  loadedFrom = from;
  const promise = initRgbLibWasm(
    wasmUrl === undefined ? undefined : { module_or_path: wasmUrl }
  ).then(
    (): RgbLibWasmRuntime => rgbLibWasm,
    (error: unknown) => {
      if (loading === promise) {
        loading = undefined;
        loadedFrom = undefined;
      }
      throw new RgbLibWebError(
        'NATIVE_ERROR',
        `Could not load @utexo/rgb-lib-wasm from ${from ?? 'its default URL'}: ${error instanceof Error ? error.message : String(error)}`,
        operation,
        error instanceof Error ? error : undefined
      );
    }
  );
  loading = promise;
  return promise;
}
