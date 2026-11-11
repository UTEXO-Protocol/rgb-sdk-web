// Loads @utexo/rgb-lib-wasm once per page, shared by every copy of this
// package, from the module's default URL or the `wasmUrl` option.
// Called by: `backend.ts` on init(). Depends on: `types.ts`, `errors.ts`.

import initRgbLibWasm, * as rgbLibWasm from '@utexo/rgb-lib-wasm';
import { RgbLibWebError, asCause } from '../errors.js';
import type { RgbLibWasmRuntime } from './types.js';

interface Load {
  readonly promise: Promise<RgbLibWasmRuntime>;
  /** The normalized URL the load uses; undefined is the module's default URL. */
  readonly from: string | undefined;
}

/**
 * Loads keyed by the module's init function, on `globalThis`, so every copy
 * of this package on the page shares them. Two copies that import the same
 * `@utexo/rgb-lib-wasm` must not run its init twice at once: the second
 * instance would replace the first under wallets already open.
 */
const LOADS = Symbol.for('@utexo/rgb-sdk-web/rgb-lib-wasm-loads');

function loads(): WeakMap<object, Load> {
  const store = globalThis as { [LOADS]?: WeakMap<object, Load> };
  return (store[LOADS] ??= new WeakMap());
}

/**
 * The absolute form of a `wasmUrl`, so `/rgb.wasm` and its full address are
 * one URL. Outside a page (no `location`) the string is kept as it is.
 */
export function normalizeWasmUrl(wasmUrl: string | URL): string {
  const href = String(wasmUrl);
  const page =
    (
      globalThis as {
        location?: { href?: string };
        document?: { baseURI?: string };
      }
    ).document?.baseURI ??
    (globalThis as { location?: { href?: string } }).location?.href;
  if (!page) return href;
  try {
    return new URL(href, page).href;
  } catch {
    return href;
  }
}

/**
 * Initializes `@utexo/rgb-lib-wasm` once per runtime instance and returns the
 * module. Every wallet of every copy of this package that loads the same
 * module shares one load.
 *
 * `wasmUrl` is already normalized (`normalizeWasmUrl`). Without it, the module
 * fetches `rgb_lib_wasm_bindings_bg.wasm` next to its own JS file. The first
 * load picks the URL; a later call with another URL is `INVALID_CONFIG`.
 * A failed load is forgotten, so the next call loads again.
 */
export function loadRgbLibWasm(
  wasmUrl: string | undefined,
  operation: string
): Promise<RgbLibWasmRuntime> {
  const key = initRgbLibWasm as object;
  const current = loads().get(key);
  if (current) {
    if (wasmUrl !== undefined && wasmUrl !== current.from) {
      return Promise.reject(
        new RgbLibWebError(
          'INVALID_CONFIG',
          `@utexo/rgb-lib-wasm is already loaded from ${current.from ?? 'its default URL'}; one runtime is loaded once`,
          operation
        )
      );
    }
    return current.promise;
  }
  const promise = initRgbLibWasm(
    wasmUrl === undefined ? undefined : { module_or_path: wasmUrl }
  ).then(
    (): RgbLibWasmRuntime => rgbLibWasm,
    (error: unknown) => {
      if (loads().get(key)?.promise === promise) loads().delete(key);
      throw new RgbLibWebError(
        'NATIVE_ERROR',
        `Could not load @utexo/rgb-lib-wasm from ${wasmUrl ?? 'its default URL'}: ${
          error instanceof Error ? error.message : describe(error)
        }`,
        operation,
        asCause(error)
      );
    }
  );
  loads().set(key, { promise, from: wasmUrl });
  return promise;
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
