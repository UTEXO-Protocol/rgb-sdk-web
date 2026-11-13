/**
 * Raw capture for fixtures (ADR-0002 step 0): a runtime that forwards to the
 * real `@utexo/rgb-lib-wasm` and records each `WasmWallet` result and each
 * `WasmInvoice.invoiceData()` before RgbLibWeb decodes it — so before any
 * JSON step. Values are kept as source text (`toSource`), with their types.
 */
import { describeTypes, toSource } from '../../fixtures/source.mjs';

/** Not values the engine decodes: handles, PSBTs, void. */
const SKIP = new Set(['free', 'flush', 'sync', 'goOnline', 'signPsbt']);

export function recordingRuntime(mod, sink) {
  const record = (method, value) => {
    try {
      sink({
        method,
        ok: true,
        source: toSource(value),
        types: describeTypes(value),
      });
    } catch (error) {
      // writeFixtures() fails on this unless the method is in ALLOWED_SKIPS.
      sink({ method, ok: true, skipped: String(error?.message ?? error) });
    }
  };
  const fail = (method, error) =>
    sink({
      method,
      ok: false,
      error:
        typeof error === 'string' ? error : String(error?.message ?? error),
      errorKind:
        typeof error === 'string'
          ? 'string'
          : (error?.constructor?.name ?? typeof error),
    });

  const wrapWallet = (wallet) =>
    new Proxy(wallet, {
      get(target, prop) {
        const member = target[prop];
        if (typeof member !== 'function') return member;
        if (SKIP.has(prop)) return member.bind(target);
        return (...args) => {
          let result;
          try {
            result = member.apply(target, args);
          } catch (error) {
            fail(prop, error);
            throw error;
          }
          if (result instanceof Promise) {
            return result.then(
              (value) => {
                record(prop, value);
                return value;
              },
              (error) => {
                fail(prop, error);
                throw error;
              }
            );
          }
          record(prop, result);
          return result;
        };
      },
    });

  return {
    WasmWallet: {
      create: async (json) => wrapWallet(await mod.WasmWallet.create(json)),
    },
    // Called with `new`; returning an object replaces the instance.
    WasmInvoice: function WasmInvoice(invoice) {
      const real = new mod.WasmInvoice(invoice);
      return {
        invoiceData() {
          try {
            const data = real.invoiceData();
            record('invoiceData', data);
            return data;
          } catch (error) {
            fail('invoiceData', error);
            throw error;
          }
        },
        free: () => real.free(),
      };
    },
    restoreKeys: (network, mnemonic) => mod.restoreKeys(network, mnemonic),
  };
}
