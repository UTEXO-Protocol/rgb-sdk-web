// How RgbLibWeb loads @utexo/rgb-lib-wasm when no runtime is passed.
// The module is replaced by a mock (node --experimental-test-module-mocks):
// its default export counts init() calls, its named exports are the fake
// runtime. Each case imports dist/ with its own query string, so each case
// starts with a fresh "page" (no loaded module).
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { KEYS, createFakeRuntime } from '../fake-rgb-lib-wasm.mjs';

const fake = createFakeRuntime();
const initCalls = [];
let initImpl = async () => undefined;

mock.module('@utexo/rgb-lib-wasm', {
  defaultExport: (arg) => {
    initCalls.push(arg);
    return initImpl(arg);
  },
  namedExports: {
    WasmWallet: fake.WasmWallet,
    WasmInvoice: fake.WasmInvoice,
    restoreKeys: fake.restoreKeys,
  },
});

let page = 0;
async function freshPage() {
  page += 1;
  initCalls.length = 0;
  initImpl = async () => undefined;
  const { RgbLibWeb } = await import(`../../dist/index.mjs?page=${page}`);
  return (params = {}, runtime) =>
    new RgbLibWeb({
      network: 'regtest',
      ...params,
      mnemonic: KEYS.mnemonic,
      runtime,
    });
}

async function rejects(promise, code, operation) {
  await assert.rejects(promise, (error) => {
    assert.ok(isEngineError(error, code), `${error?.code}: ${error?.message}`);
    assert.equal(error.operation, operation);
    return true;
  });
}

describe('RgbLibWeb loads @utexo/rgb-lib-wasm itself', () => {
  it('initializes the module once per page, for every wallet', async () => {
    const wallet = await freshPage();
    const a = wallet({ dataDir: 'a' });
    const b = wallet({ dataDir: 'b' });
    await Promise.all([a.init(), b.init()]);
    await wallet({ dataDir: 'c' }).init();
    assert.deepEqual(initCalls, [undefined]);
    assert.equal(typeof (await a.getAddress()), 'string');
  });

  it('passes wasmUrl to the module init', async () => {
    const wallet = await freshPage();
    const url = new URL('https://cdn.example/rgb_lib_wasm_bindings_bg.wasm');
    await wallet({ wasmUrl: url }).init();
    await wallet({ wasmUrl: url.href }).init();
    assert.deepEqual(initCalls, [{ module_or_path: url }]);
  });

  it('rejects a second, different wasmUrl on the same page', async () => {
    const wallet = await freshPage();
    await wallet({ wasmUrl: '/a.wasm' }).init();
    await rejects(
      wallet({ wasmUrl: '/b.wasm' }).init(),
      'INVALID_CONFIG',
      'init'
    );
    assert.equal(initCalls.length, 1);
  });

  it('a failed load is NATIVE_ERROR, and the next init loads again', async () => {
    const wallet = await freshPage();
    initImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    const engine = wallet();
    await rejects(engine.init(), 'NATIVE_ERROR', 'init');
    initImpl = async () => undefined;
    await engine.init();
    assert.equal(initCalls.length, 2);
  });

  it('does not load the module when a runtime is passed', async () => {
    const wallet = await freshPage();
    await wallet({}, createFakeRuntime()).init();
    assert.deepEqual(initCalls, []);
  });

  it('rejects runtime with wasmUrl, a bad runtime and a bad wasmUrl', async () => {
    const wallet = await freshPage();
    const isConfig = (e) => isEngineError(e, 'INVALID_CONFIG');
    assert.throws(
      () => wallet({ wasmUrl: '/x.wasm' }, createFakeRuntime()),
      isConfig
    );
    assert.throws(() => wallet({}, {}), isConfig);
    assert.throws(() => wallet({}, null), isConfig);
    assert.throws(() => wallet({ wasmUrl: '' }), isConfig);
    assert.throws(() => wallet({ wasmUrl: 42 }), isConfig);
  });
});
