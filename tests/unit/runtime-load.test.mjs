// How RgbLibWeb loads @utexo/rgb-lib-wasm when no runtime is passed.
// The module is replaced by a mock (node --experimental-test-module-mocks):
// its default export counts init() calls, its named exports are the fake
// runtime. Each case clears the shared load registry and imports dist/ with
// its own query string: a fresh page with one copy of the package. A second
// query string in the same case is a second copy of the package on that page.
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

const LOADS = Symbol.for('@utexo/rgb-sdk-web/rgb-lib-wasm-loads');
let copy = 0;

/** One more copy of the package on the current page. */
async function packageCopy() {
  copy += 1;
  const { RgbLibWeb } = await import(`../../dist/index.mjs?copy=${copy}`);
  return (params = {}, runtime) =>
    new RgbLibWeb({
      network: 'regtest',
      mnemonic: KEYS.mnemonic,
      ...params,
      ...(runtime === undefined ? {} : { runtime }),
    });
}

async function freshPage() {
  delete globalThis[LOADS];
  initCalls.length = 0;
  initImpl = async () => undefined;
  return packageCopy();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function rejects(promise, code, operation) {
  let caught;
  await assert.rejects(promise, (error) => {
    assert.ok(isEngineError(error, code), `${error?.code}: ${error?.message}`);
    assert.equal(error.operation, operation);
    caught = error;
    return true;
  });
  return caught;
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

  it('two copies of the package share one load of the same module', async () => {
    const first = await freshPage();
    const second = await packageCopy();
    const gate = deferred();
    initImpl = () => gate.promise;
    const a = first({ dataDir: 'a' }).init();
    const b = second({ dataDir: 'b' }).init();
    gate.resolve();
    await Promise.all([a, b]);
    assert.equal(initCalls.length, 1);
  });

  it('passes wasmUrl to the module init as a string', async () => {
    const wallet = await freshPage();
    const url = new URL('https://cdn.example/rgb_lib_wasm_bindings_bg.wasm');
    await wallet({ wasmUrl: url }).init();
    await wallet({ wasmUrl: url.href }).init();
    assert.deepEqual(initCalls, [{ module_or_path: url.href }]);
  });

  it('keeps the wasmUrl it was given when the URL object changes later', async () => {
    const wallet = await freshPage();
    const url = new URL('https://cdn.example/a.wasm');
    const engine = wallet({ wasmUrl: url });
    url.pathname = '/b.wasm';
    await engine.init();
    assert.deepEqual(initCalls, [
      { module_or_path: 'https://cdn.example/a.wasm' },
    ]);
  });

  it('a relative wasmUrl and its absolute form are one URL on a page', async () => {
    const wallet = await freshPage();
    globalThis.location = { href: 'https://app.example/wallet/' };
    try {
      await wallet({ wasmUrl: '/rgb.wasm' }).init();
      await wallet({ wasmUrl: 'https://app.example/rgb.wasm' }).init();
      assert.deepEqual(initCalls, [
        { module_or_path: 'https://app.example/rgb.wasm' },
      ]);
    } finally {
      delete globalThis.location;
    }
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
    const error = await rejects(engine.init(), 'NATIVE_ERROR', 'init');
    assert.equal(error.cause?.message, 'Failed to fetch');
    initImpl = async () => undefined;
    await engine.init();
    assert.equal(initCalls.length, 2);
  });

  it('keeps a non-Error rejection of the load as the cause', async () => {
    const wallet = await freshPage();
    const rejection = { why: 'offline', retryAfter: 10 };
    initImpl = async () => {
      throw rejection;
    };
    const error = await rejects(wallet().init(), 'NATIVE_ERROR', 'init');
    assert.equal(error.cause?.rejection, rejection);
    assert.match(error.message, /"why":"offline"/);

    initImpl = async () => {
      throw 'no network';
    };
    const text = await rejects(wallet().init(), 'NATIVE_ERROR', 'init');
    assert.equal(text.cause?.rejection, 'no network');
    assert.match(text.message, /no network$/);
  });

  it('reads the mnemonic only after the module has loaded', async () => {
    const wallet = await freshPage();
    const gate = deferred();
    initImpl = () => gate.promise;
    let reads = 0;
    const engine = wallet({
      mnemonic: undefined,
      keys: () => {
        reads += 1;
        return KEYS.mnemonic;
      },
    });
    const opening = engine.init();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(reads, 0);
    gate.resolve();
    await opening;
    assert.equal(reads, 1);
  });

  it('does not read the mnemonic when the load fails', async () => {
    const wallet = await freshPage();
    initImpl = async () => {
      throw new Error('404');
    };
    let reads = 0;
    const engine = wallet({
      mnemonic: undefined,
      keys: () => {
        reads += 1;
        return KEYS.mnemonic;
      },
    });
    await rejects(engine.init(), 'NATIVE_ERROR', 'init');
    assert.equal(reads, 0);
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
