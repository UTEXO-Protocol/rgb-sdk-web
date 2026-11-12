// Byte backup (BackupExportApi, BackupRestoreApi, ADR-0003 B3): exportBackup() and
// restoreBackup() and the restore window between init() and the first
// connection.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { RgbLibWeb } from '../../dist/index.mjs';
import { KEYS, createFakeRuntime } from '../fake-rgb-lib-wasm.mjs';

const ONLINE = {
  indexerUrl: 'http://127.0.0.1:3002',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};
const WATCH_ONLY = {
  accountXpubVanilla: KEYS.accountXpubVanilla,
  accountXpubColored: KEYS.accountXpubColored,
  masterFingerprint: KEYS.masterFingerprint,
};
/** A fresh wallet: nothing local that a restore would replace. */
const EMPTY = {
  listAssets: () => ({ nia: [], ifa: [], bfa: [] }),
  listTransfers: () => [],
  listUnspents: () => [],
  listTransactions: () => [],
};
const BYTES = () => new Uint8Array([1, 2, 3, 4]);

function create({ keys = KEYS.mnemonic, ...fake } = {}) {
  const runtime = createFakeRuntime(fake);
  const engine = new RgbLibWeb({
    network: 'regtest',
    ...ONLINE,
    vssUrl: null,
    keys,
    runtime,
  });
  const names = () => runtime.calls.map((c) => c.name);
  const args = (name) => runtime.calls.filter((c) => c.name === name);
  return { engine, runtime, names, args };
}

async function ready(options) {
  const env = create(options);
  await env.engine.init();
  return env;
}

async function rejects(promise, code, password) {
  await assert.rejects(promise, (error) => {
    assert.ok(isEngineError(error, code), `${error?.code}: ${error?.message}`);
    if (password) assert.ok(!JSON.stringify(error).includes(password));
    return true;
  });
}

describe('exportBackup()', () => {
  it('returns the runtime bytes, saved first, without connecting', async () => {
    const { engine, names, args } = await ready();
    const bytes = await engine.exportBackup({ password: 'pw' });
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(new TextDecoder().decode(bytes), 'backup:pw');
    assert.deepEqual(args('backup')[0].args, ['pw']);
    const calls = names();
    assert.ok(calls.indexOf('backup') < calls.lastIndexOf('flush'));
    assert.ok(!calls.includes('goOnline'));
  });

  it('returns a copy the caller owns', async () => {
    const source = new Uint8Array([9, 9]);
    const { engine } = await ready({ overrides: { backup: () => source } });
    const bytes = await engine.exportBackup({ password: 'pw' });
    bytes[0] = 0;
    assert.equal(source[0], 9);
  });

  it('works on a watch-only wallet', async () => {
    const { engine } = await ready({ keys: WATCH_ONLY });
    assert.ok((await engine.exportBackup({ password: 'pw' })).length > 0);
  });

  for (const params of [undefined, 'pw', {}, { password: '' }, { password: 1 }])
    it(`refuses ${JSON.stringify(params)} with INVALID_CONFIG before any call`, async () => {
      const { engine, names } = create();
      await rejects(engine.exportBackup(params), 'INVALID_CONFIG');
      assert.deepEqual(names(), []);
    });

  for (const value of [[1, 2], new Uint8Array(0), 'bytes'])
    it(`rejects a runtime value of ${JSON.stringify(value)}`, async () => {
      const { engine } = await ready({ overrides: { backup: () => value } });
      await rejects(
        engine.exportBackup({ password: 'pw' }),
        'INVALID_NATIVE_RESPONSE'
      );
    });

  it('is not a mutation: no automatic upload', async () => {
    const runtime = createFakeRuntime();
    const engine = new RgbLibWeb({
      network: 'regtest',
      ...ONLINE,
      keys: KEYS.mnemonic,
      runtime,
    });
    await engine.init();
    await engine.exportBackup({ password: 'pw' });
    await engine.getAddress();
    assert.ok(!runtime.calls.some((c) => c.name === 'ensureInitialBackup'));
  });
});

describe('restoreBackup()', () => {
  it('restores an empty wallet and saves it before resolving', async () => {
    const { engine, names, args } = await ready({ overrides: EMPTY });
    const bytes = BYTES();
    await engine.restoreBackup({ bytes, password: 'pw' });
    assert.deepEqual([...args('restoreBackup')[0].args[0]], [...bytes]);
    assert.equal(args('restoreBackup')[0].args[1], 'pw');
    const calls = names();
    assert.ok(calls.indexOf('restoreBackup') < calls.lastIndexOf('flush'));
    assert.ok(!calls.includes('goOnline'));
  });

  it('passes its own copy of the bytes', async () => {
    const { engine, args } = await ready({ overrides: EMPTY });
    const bytes = BYTES();
    const restoring = engine.restoreBackup({ bytes, password: 'pw' });
    bytes[0] = 0;
    await restoring;
    assert.equal(args('restoreBackup')[0].args[0][0], 1);
    assert.notEqual(args('restoreBackup')[0].args[0], bytes);
  });

  for (const source of Object.keys(EMPTY))
    it(`refuses local data (${source}) without overwrite`, async () => {
      const { [source]: _kept, ...others } = EMPTY;
      const { engine, names } = await ready({ overrides: others });
      await rejects(
        engine.restoreBackup({ bytes: BYTES(), password: 'pw' }),
        'WALLET_INVALID_STATE'
      );
      assert.ok(!names().includes('restoreBackup'));
    });

  it('overwrite: true replaces local data', async () => {
    const { engine, names } = await ready();
    await engine.restoreBackup({
      bytes: BYTES(),
      password: 'pw',
      overwrite: true,
    });
    assert.ok(names().includes('restoreBackup'));
    assert.ok(!names().includes('listAssets'), 'no local-data check');
  });

  it('rejects after unlock(), with no wallet call', async () => {
    const { engine, names } = await ready({ overrides: EMPTY });
    await engine.unlock();
    const before = names().length;
    await rejects(
      engine.restoreBackup({ bytes: BYTES(), password: 'pw' }),
      'WALLET_INVALID_STATE'
    );
    assert.deepEqual(names().slice(before), []);
  });

  it('rejects when unlock() was called first, without awaiting', async () => {
    const { engine, names } = await ready({ overrides: EMPTY });
    const unlocking = engine.unlock();
    await rejects(
      engine.restoreBackup({ bytes: BYTES(), password: 'pw' }),
      'WALLET_INVALID_STATE'
    );
    await unlocking;
    assert.ok(!names().includes('restoreBackup'));
  });

  it('before init() rejects with WALLET_NOT_INITIALIZED', async () => {
    const { engine } = create({ overrides: EMPTY });
    await rejects(
      engine.restoreBackup({ bytes: BYTES(), password: 'pw' }),
      'WALLET_NOT_INITIALIZED'
    );
  });

  it('works on a watch-only wallet', async () => {
    const { engine, names } = await ready({
      keys: WATCH_ONLY,
      overrides: EMPTY,
    });
    await engine.restoreBackup({ bytes: BYTES(), password: 'pw' });
    assert.ok(names().includes('restoreBackup'));
  });

  const invalid = [
    ['no params', undefined, 'INVALID_CONFIG'],
    ['bytes as an array', { bytes: [1, 2], password: 'pw' }, 'INVALID_CONFIG'],
    [
      'empty bytes',
      { bytes: new Uint8Array(0), password: 'pw' },
      'INVALID_CONFIG',
    ],
    ['no password', { bytes: BYTES() }, 'INVALID_CONFIG'],
    ['an empty password', { bytes: BYTES(), password: '' }, 'INVALID_CONFIG'],
    [
      'overwrite that is not a boolean',
      { bytes: BYTES(), password: 'pw', overwrite: 'yes' },
      'INVALID_PARAMS',
    ],
  ];
  for (const [label, params, code] of invalid)
    it(`refuses ${label} with ${code} before any call`, async () => {
      const { engine, names } = create();
      await rejects(engine.restoreBackup(params), code);
      assert.deepEqual(names(), []);
    });

  it('a runtime failure holds no password, frees nothing, and can be retried', async () => {
    let attempts = 0;
    const { engine, names } = await ready({
      overrides: {
        ...EMPTY,
        restoreBackup: () => {
          attempts += 1;
          if (attempts === 1) throw new Error('Invalid backup data');
        },
      },
    });
    await rejects(
      engine.restoreBackup({ bytes: BYTES(), password: 'secret-pw' }),
      'INVALID_PARAMS',
      'secret-pw'
    );
    assert.ok(!names().includes('free'));
    await engine.restoreBackup({ bytes: BYTES(), password: 'secret-pw' });
    assert.equal(attempts, 2);
  });

  it('a failed save fails the restore', async () => {
    let restored = false;
    const { engine } = await ready({
      overrides: {
        ...EMPTY,
        restoreBackup: () => {
          restored = true;
        },
        flush: async () => {
          if (restored) throw new Error('Persistence error: quota exceeded');
        },
      },
    });
    await rejects(
      engine.restoreBackup({ bytes: BYTES(), password: 'pw' }),
      'NATIVE_ERROR'
    );
  });
});
