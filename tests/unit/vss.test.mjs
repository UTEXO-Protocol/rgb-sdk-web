// VSS backup (ADR-0003 B1, B2): the identity derived on init(), the options,
// backupToVss(), the automatic upload after mutations, restoreFromVss() and the
// check for an unrestored server backup. The signing key is a secret: no
// error or log here may contain it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VSS_SERVER_URL,
  deriveVssSigningKeyFromMnemonic,
  getBackupStoreId,
  isEngineError,
  logger,
} from '@utexo/rgb-sdk-core';
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibWeb } from '../../dist/index.mjs';
import { KEYS, createFakeRuntime } from '../fake-rgb-lib-wasm.mjs';

const ONLINE = {
  indexerUrl: 'http://127.0.0.1:3002',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};
const KEY = deriveVssSigningKeyFromMnemonic(KEYS.mnemonic);
const EXPLICIT = {
  serverUrl: 'https://vss.example/vss',
  storeId: 'store-1',
  signingKey: 'ab'.repeat(32),
};
const WATCH_ONLY = {
  accountXpubVanilla: KEYS.accountXpubVanilla,
  accountXpubColored: KEYS.accountXpubColored,
  masterFingerprint: KEYS.masterFingerprint,
};
const NIA = { ticker: 'T', name: 'Token', amounts: [10], precision: 0 };

/** On regtest VSS is off without a server, so these tests name one. */
const LOCAL_VSS = 'http://127.0.0.1:8181/vss';

function create({ params = {}, keys = KEYS.mnemonic, ...fake } = {}) {
  const runtime = createFakeRuntime(fake);
  const named = 'vss' in params || 'vssUrl' in params;
  const engine = new RgbLibWeb({
    network: 'regtest',
    ...ONLINE,
    ...(named ? {} : { vssUrl: LOCAL_VSS }),
    ...params,
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

/** Neither the derived nor the explicit key may leak into a value. */
function noSecret(value) {
  const text = JSON.stringify(value, (_, v) =>
    v instanceof Error ? { message: v.message, ...v } : v
  );
  assert.ok(!text.includes(KEY), 'derived key leaked');
  assert.ok(!text.includes(EXPLICIT.signingKey), 'explicit key leaked');
}

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(isEngineError(error, code), `${error?.code}: ${error?.message}`);
    noSecret(error);
    return true;
  });
}

describe('VSS identity on init()', () => {
  it('derives it from the mnemonic, with the default server off regtest', async () => {
    const { args, names } = await ready({
      params: { network: 'testnet', vssUrl: undefined },
    });
    assert.deepEqual(args('configureVssBackup')[0].args, [
      DEFAULT_VSS_SERVER_URL,
      getBackupStoreId(KEYS.masterFingerprint),
      KEY,
    ]);
    // Nothing is uploaded on init(): a restore may still run before connect.
    assert.ok(!names().includes('vssBackup'));
    assert.ok(!names().includes('ensureInitialBackup'));
  });

  it('regtest without vssUrl or vss: off, and VSS calls say why', async () => {
    const { engine, names } = await ready({ params: { vssUrl: undefined } });
    assert.ok(!names().includes('configureVssBackup'));
    await assert.rejects(engine.backupToVss(), (error) => {
      assert.ok(isEngineError(error, 'INVALID_CONFIG'), error?.message);
      assert.match(error.message, /regtest without vssUrl/);
      return true;
    });
    await rejects(engine.restoreFromVss(), 'INVALID_CONFIG');
  });

  it('regtest with an explicit vss config: on', async () => {
    const { args } = await ready({ params: { vss: EXPLICIT } });
    assert.equal(args('configureVssBackup').length, 1);
  });

  it('uses vssUrl as the server', async () => {
    const { args } = await ready({
      params: { vssUrl: 'http://127.0.0.1:8081/vss' },
    });
    assert.equal(
      args('configureVssBackup')[0].args[0],
      'http://127.0.0.1:8081/vss'
    );
  });

  it('vssUrl: null turns VSS off', async () => {
    const { names } = await ready({ params: { vssUrl: null } });
    assert.ok(!names().includes('configureVssBackup'));
  });

  it('an explicit vss config is passed as it is', async () => {
    const { args } = await ready({ params: { vss: EXPLICIT } });
    assert.deepEqual(args('configureVssBackup')[0].args, [
      EXPLICIT.serverUrl,
      EXPLICIT.storeId,
      EXPLICIT.signingKey,
    ]);
  });

  it('a watch-only wallet gets VSS only with an explicit config', async () => {
    const off = await ready({ keys: WATCH_ONLY });
    assert.ok(!off.names().includes('configureVssBackup'));
    const on = await ready({ keys: WATCH_ONLY, params: { vss: EXPLICIT } });
    assert.equal(on.args('configureVssBackup').length, 1);
  });

  it('a configure failure fails init() and frees the wallet', async () => {
    const { engine, names } = create({
      overrides: {
        configureVssBackup: () => {
          throw new Error('Invalid signing key: malformed');
        },
      },
    });
    await rejects(engine.init(), 'INVALID_PARAMS');
    assert.ok(names().includes('free'));
  });
});

describe('VSS options', () => {
  const invalid = [
    ['vss and vssUrl together', { vss: EXPLICIT, vssUrl: null }],
    ['a vssUrl with another scheme', { vssUrl: 'ftp://vss.example' }],
    ['an empty vssUrl', { vssUrl: '' }],
    ['a vss that is not an object', { vss: 'x' }],
    ['a vss without storeId', { vss: { ...EXPLICIT, storeId: '' } }],
    ['a short signing key', { vss: { ...EXPLICIT, signingKey: 'ab' } }],
    [
      'a signing key that is not hex',
      { vss: { ...EXPLICIT, signingKey: 'zz'.repeat(32) } },
    ],
    [
      'a signing key one byte too long',
      { vss: { ...EXPLICIT, signingKey: 'ab'.repeat(33) } },
    ],
  ];
  for (const [label, params] of invalid)
    it(`refuses ${label} at construction, without the key in the message`, () => {
      assert.throws(
        () => create({ params }),
        (error) => {
          assert.ok(isEngineError(error, 'INVALID_CONFIG'), error?.message);
          noSecret(error);
          if (typeof params.vss?.signingKey === 'string')
            assert.ok(!error.message.includes(params.vss.signingKey));
          return true;
        }
      );
    });

  it('keeps its own copy of an explicit config', async () => {
    const vss = { ...EXPLICIT };
    const { engine, args } = create({ params: { vss } });
    vss.storeId = 'changed';
    await engine.init();
    assert.equal(args('configureVssBackup')[0].args[1], EXPLICIT.storeId);
  });
});

describe('backupToVss()', () => {
  it('uploads and returns the server version, without connecting', async () => {
    const { engine, names } = await ready();
    assert.equal(await engine.backupToVss(), 3);
    assert.ok(names().includes('vssBackup'));
    assert.ok(!names().includes('goOnline'));
  });

  it('with VSS off, rejects with INVALID_CONFIG before any call', async () => {
    const { engine, names } = create({ params: { vssUrl: null } });
    await rejects(engine.backupToVss(), 'INVALID_CONFIG');
    assert.deepEqual(names(), []);
  });

  it('on a watch-only wallet without vss, rejects with no wallet call', async () => {
    const { engine, names } = await ready({ keys: WATCH_ONLY });
    const before = names().length;
    await rejects(engine.backupToVss(), 'INVALID_CONFIG');
    assert.deepEqual(names().slice(before), []);
  });

  for (const version of [-1, 1.5, '3', null, 2 ** 53])
    it(`rejects a server version of ${String(version)}`, async () => {
      const { engine } = await ready({
        overrides: { vssBackup: async () => version },
      });
      await rejects(engine.backupToVss(), 'INVALID_NATIVE_RESPONSE');
    });

  it('a runtime failure is public and holds no key', async () => {
    const { engine } = await ready({
      overrides: {
        vssBackup: async () => {
          throw new Error('Network error: connection refused');
        },
      },
    });
    await assert.rejects(engine.backupToVss(), (error) => {
      assert.ok(isEngineError(error), String(error));
      assert.equal(error.operation, 'backupToVss');
      noSecret(error);
      return true;
    });
  });
});

describe('getVssBackupInfo()', () => {
  it('reads the server state, without connecting', async () => {
    const { engine, names } = await ready({
      overrides: {
        vssBackupInfo: async () => ({
          backup_exists: true,
          server_version: 7n,
          backup_required: false,
          last_backup_error: 'VSS error: HTTP error: 500',
        }),
      },
    });
    assert.deepEqual(await engine.getVssBackupInfo(), {
      backupExists: true,
      serverVersion: 7,
      backupRequired: false,
      lastBackupError: 'VSS error: HTTP error: 500',
    });
    assert.ok(!names().includes('goOnline'));
  });

  it('no server copy: version and error are null', async () => {
    const { engine } = await ready({
      overrides: {
        vssBackupInfo: async () => ({
          backup_exists: false,
          backup_required: true,
        }),
      },
    });
    assert.deepEqual(await engine.getVssBackupInfo(), {
      backupExists: false,
      serverVersion: null,
      backupRequired: true,
      lastBackupError: null,
    });
  });

  it('with VSS off, rejects with INVALID_CONFIG before any call', async () => {
    const { engine, names } = create({ params: { vssUrl: null } });
    await rejects(engine.getVssBackupInfo(), 'INVALID_CONFIG');
    assert.deepEqual(names(), []);
  });

  it('on a watch-only wallet without vss, rejects with no wallet call', async () => {
    const { engine, names } = await ready({ keys: WATCH_ONLY });
    const before = names().length;
    await rejects(engine.getVssBackupInfo(), 'INVALID_CONFIG');
    assert.deepEqual(names().slice(before), []);
  });

  const invalid = [
    null,
    'info',
    { backup_exists: 'yes', backup_required: true },
    { backup_exists: true, backup_required: 1 },
    { backup_exists: true, backup_required: true, server_version: -1n },
    { backup_exists: true, backup_required: true, server_version: 2n ** 53n },
    { backup_exists: true, backup_required: true, server_version: '3' },
    { backup_exists: true, backup_required: true, last_backup_error: 5 },
  ];
  for (const info of invalid)
    it(`rejects ${JSON.stringify(info, (_, v) => (typeof v === 'bigint' ? `${v}n` : v))}`, async () => {
      const { engine } = await ready({
        overrides: { vssBackupInfo: async () => info },
      });
      await rejects(engine.getVssBackupInfo(), 'INVALID_NATIVE_RESPONSE');
    });

  it('is not a mutation: no automatic upload', async () => {
    const { engine, args } = await ready();
    await engine.getVssBackupInfo();
    await engine.getAddress();
    assert.equal(args('ensureInitialBackup').length, 0);
  });
});

describe('automatic upload', () => {
  /** Waits until every queued task, uploads included, has run. */
  const drained = (engine) => engine.getAddress();

  it('runs after a mutation, as its own queued task', async () => {
    const { engine, names } = await ready();
    await engine.issueAssetNia(NIA);
    await drained(engine);
    const calls = names();
    const issue = calls.indexOf('issueAssetNia');
    const upload = calls.indexOf('ensureInitialBackup');
    assert.ok(issue >= 0 && upload > issue, calls.join(', '));
  });

  it('every mutation queues one', async () => {
    const mutations = {
      createUtxos: (e) => e.createUtxos({ num: 1 }),
      sendBtc: (e) => e.sendBtc({ address: 'bcrt1q', amount: 1, feeRate: 1 }),
      issueAssetNia: (e) => e.issueAssetNia(NIA),
      blindReceive: (e) => e.blindReceive({ amount: 1 }),
      failTransfers: (e) => e.failTransfers({}),
      refresh: (e) => e.refresh(),
      refreshWallet: (e) => e.refreshWallet(),
    };
    for (const [name, run] of Object.entries(mutations)) {
      const { engine, args } = await ready();
      await run(engine);
      await drained(engine);
      assert.equal(args('ensureInitialBackup').length, 1, name);
    }
  });

  it('reads queue none', async () => {
    const { engine, names } = await ready();
    await engine.getBtcBalance();
    await engine.listAssets();
    await engine.listTransfers();
    await engine.getAssetBalance('rgb:x');
    await drained(engine);
    assert.ok(!names().includes('ensureInitialBackup'));
  });

  it('two mutations in a row share one waiting upload', async () => {
    const { engine, args } = await ready();
    await Promise.all([engine.issueAssetNia(NIA), engine.issueAssetNia(NIA)]);
    await drained(engine);
    assert.equal(args('ensureInitialBackup').length, 1);
  });

  it('a failed mutation queues none', async () => {
    const { engine, names } = await ready({
      overrides: {
        issueAssetNia: () => {
          throw new Error('Invalid ticker: x');
        },
      },
    });
    await assert.rejects(engine.issueAssetNia(NIA));
    await drained(engine);
    assert.ok(!names().includes('ensureInitialBackup'));
  });

  it('with VSS off, none is queued', async () => {
    const { engine, names } = await ready({ params: { vssUrl: null } });
    await engine.issueAssetNia(NIA);
    await drained(engine);
    assert.ok(!names().includes('ensureInitialBackup'));
  });

  it('a failed upload is logged without the key and fails nothing', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => undefined);
    const { engine } = await ready({
      overrides: {
        ensureInitialBackup: async () => {
          throw new Error('Network error: VSS server unreachable');
        },
      },
    });
    const asset = await engine.issueAssetNia(NIA);
    assert.equal(asset.ticker, NIA.ticker);
    await drained(engine);
    assert.equal(warn.mock.callCount(), 1);
    const [message, details] = warn.mock.calls[0].arguments;
    assert.match(message, /automatic VSS backup failed/);
    assert.match(details.message, /unreachable/);
    noSecret(warn.mock.calls[0].arguments);
    // The queue still works.
    assert.equal(typeof (await engine.getAddress()), 'string');
  });

  it('destroy() waits for a queued upload before freeing', async () => {
    const { engine, names } = await ready();
    await engine.issueAssetNia(NIA);
    await engine.destroy();
    const calls = names();
    assert.ok(
      calls.indexOf('ensureInitialBackup') < calls.indexOf('free'),
      calls.join(', ')
    );
  });
});

/** A fresh wallet: nothing local that a restore would replace. */
const EMPTY = {
  listAssets: () => ({ nia: [], ifa: [], bfa: [] }),
  listTransfers: () => [],
  listUnspents: () => [],
  listTransactions: () => [],
};
const SERVER_HAS_BACKUP = {
  vssBackupInfo: async () => ({
    backup_exists: true,
    server_version: 5n,
    backup_required: true,
    last_backup_error: null,
  }),
};

describe('restoreFromVss()', () => {
  it('restores an empty wallet between init() and the first connection', async () => {
    const { engine, names } = await ready({ overrides: EMPTY });
    assert.equal(await engine.restoreFromVss(), undefined);
    assert.ok(names().includes('vssRestoreBackup'));
    assert.ok(!names().includes('goOnline'));
    await engine.unlock();
    const calls = names();
    assert.ok(calls.indexOf('vssRestoreBackup') < calls.indexOf('goOnline'));
  });

  for (const source of Object.keys(EMPTY))
    it(`refuses local data (${source}) without overwrite`, async () => {
      const { [source]: _kept, ...others } = EMPTY;
      const { engine, names } = await ready({ overrides: others });
      await rejects(engine.restoreFromVss(), 'WALLET_INVALID_STATE');
      assert.ok(!names().includes('vssRestoreBackup'));
    });

  it('overwrite: true replaces local data', async () => {
    const { engine, names } = await ready();
    await engine.restoreFromVss({ overwrite: true });
    assert.ok(names().includes('vssRestoreBackup'));
    assert.ok(!names().includes('listAssets'), 'no local-data check');
  });

  it('rejects after unlock(), with no wallet call', async () => {
    const { engine, names } = await ready({ overrides: EMPTY });
    await engine.unlock();
    const before = names().length;
    await rejects(engine.restoreFromVss(), 'WALLET_INVALID_STATE');
    assert.deepEqual(names().slice(before), []);
  });

  it('rejects after a lazy connect', async () => {
    const { engine, names } = await ready({ overrides: EMPTY });
    await engine.refreshWallet();
    await rejects(engine.restoreFromVss(), 'WALLET_INVALID_STATE');
    assert.ok(!names().includes('vssRestoreBackup'));
  });

  it('rejects when unlock() was called first, without awaiting', async () => {
    const { engine, names } = await ready({ overrides: EMPTY });
    const unlocking = engine.unlock();
    await rejects(engine.restoreFromVss(), 'WALLET_INVALID_STATE');
    await unlocking;
    assert.ok(!names().includes('vssRestoreBackup'));
  });

  it('before init() rejects with WALLET_NOT_INITIALIZED', async () => {
    const { engine } = create({ overrides: EMPTY });
    await rejects(engine.restoreFromVss(), 'WALLET_NOT_INITIALIZED');
  });

  it('with VSS off, rejects with INVALID_CONFIG before any call', async () => {
    const { engine, names } = create({ params: { vssUrl: null } });
    await rejects(engine.restoreFromVss(), 'INVALID_CONFIG');
    assert.deepEqual(names(), []);
  });

  it('on a watch-only wallet without vss, rejects with INVALID_CONFIG', async () => {
    const { engine, names } = await ready({ keys: WATCH_ONLY });
    await rejects(engine.restoreFromVss(), 'INVALID_CONFIG');
    assert.ok(!names().includes('vssRestoreBackup'));
  });

  for (const options of ['x', null, { overwrite: 'yes' }])
    it(`refuses options ${JSON.stringify(options)} before any call`, async () => {
      const { engine, names } = create();
      await rejects(engine.restoreFromVss(options), 'INVALID_PARAMS');
      assert.deepEqual(names(), []);
    });

  it('a runtime failure holds no key and frees nothing', async () => {
    const { engine, names } = await ready({
      overrides: {
        ...EMPTY,
        vssRestoreBackup: async () => {
          throw new Error('VSS error: backup not found');
        },
      },
    });
    await assert.rejects(engine.restoreFromVss(), (error) => {
      assert.ok(isEngineError(error), String(error));
      assert.equal(error.operation, 'restoreFromVss');
      noSecret(error);
      return true;
    });
    assert.ok(!names().includes('free'));
    assert.equal(typeof (await engine.getAddress()), 'string');
    // The gap is still open: a retry is allowed.
    await assert.rejects(engine.restoreFromVss(), /backup not found/);
  });

  it('queues no automatic upload', async () => {
    const { engine, names } = await ready({ overrides: EMPTY });
    await engine.restoreFromVss();
    await engine.getAddress();
    assert.ok(!names().includes('ensureInitialBackup'));
  });
});

describe('unrestored server backup', () => {
  const drained = (engine) => engine.getAddress();

  it('an empty wallet that skipped restore: warns once and holds uploads', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => undefined);
    const { engine, args } = await ready({
      overrides: { ...EMPTY, ...SERVER_HAS_BACKUP },
    });
    await engine.unlock();
    await engine.issueAssetNia(NIA);
    await engine.createUtxos({ num: 1 });
    await drained(engine);
    assert.equal(args('vssBackupInfo').length, 1);
    assert.equal(args('ensureInitialBackup').length, 0, 'upload held');
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /was not restored/);
    noSecret(warn.mock.calls[0].arguments);
    // An explicit backupToVss() replaces the server copy and lifts the hold.
    assert.equal(await engine.backupToVss(), 3);
    await engine.issueAssetNia(NIA);
    await drained(engine);
    assert.equal(args('ensureInitialBackup').length, 1);
  });

  it('runs before a mutation that waited for the connect', async () => {
    const { engine, names } = await ready({
      overrides: { ...EMPTY, ...SERVER_HAS_BACKUP },
    });
    await engine.createUtxos({ num: 1 });
    await drained(engine);
    const calls = names();
    assert.ok(
      calls.indexOf('vssBackupInfo') < calls.indexOf('createUtxosBegin')
    );
    assert.ok(!calls.includes('ensureInitialBackup'));
  });

  it('judges emptiness before the connect: its scan brings in chain data', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => undefined);
    // A new device: nothing local until goOnline() scans the chain, which
    // finds the UTXOs and transactions this mnemonic made on another device.
    let scanned = false;
    const chain = (rows) => () => (scanned ? rows : []);
    const { engine, args } = await ready({
      overrides: {
        ...EMPTY,
        ...SERVER_HAS_BACKUP,
        goOnline: async () => {
          scanned = true;
          return { id: 1n, indexerUrl: 'http://esplora' };
        },
        listUnspents: chain([{ utxo: {} }]),
        listTransactions: chain([{}]),
      },
    });
    await engine.unlock();
    await engine.refreshWallet();
    await drained(engine);
    assert.equal(args('vssBackupInfo').length, 1);
    assert.equal(args('ensureInitialBackup').length, 0, 'upload held');
    assert.equal(warn.mock.callCount(), 1);
  });

  it('a wallet with local data is not checked', async () => {
    const { engine, args } = await ready({ overrides: SERVER_HAS_BACKUP });
    await engine.unlock();
    await engine.issueAssetNia(NIA);
    await drained(engine);
    assert.equal(args('vssBackupInfo').length, 0);
    assert.equal(args('ensureInitialBackup').length, 1);
  });

  it('no server backup: nothing is held', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => undefined);
    const { engine, args } = await ready({ overrides: EMPTY });
    await engine.unlock();
    await engine.issueAssetNia(NIA);
    await drained(engine);
    assert.equal(args('vssBackupInfo').length, 1);
    assert.equal(args('ensureInitialBackup').length, 1);
    assert.equal(warn.mock.callCount(), 0);
  });

  it('a restored wallet is not checked', async () => {
    const { engine, args } = await ready({
      overrides: { ...EMPTY, ...SERVER_HAS_BACKUP },
    });
    await engine.restoreFromVss();
    await engine.unlock();
    await engine.issueAssetNia(NIA);
    await drained(engine);
    assert.equal(args('vssBackupInfo').length, 0);
    assert.equal(args('ensureInitialBackup').length, 1);
  });

  it('a failed check is logged and holds nothing', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => undefined);
    const { engine, args } = await ready({
      overrides: {
        ...EMPTY,
        vssBackupInfo: async () => {
          throw new Error('Network error: VSS server unreachable');
        },
      },
    });
    await engine.unlock();
    await engine.issueAssetNia(NIA);
    await drained(engine);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /could not check/);
    noSecret(warn.mock.calls[0].arguments);
    assert.equal(args('ensureInitialBackup').length, 1);
  });

  it('an invalid info value is a failed check', async (t) => {
    const warn = t.mock.method(logger, 'warn', () => undefined);
    const { engine } = await ready({
      overrides: { ...EMPTY, vssBackupInfo: async () => ({ exists: true }) },
    });
    await engine.unlock();
    await drained(engine);
    assert.equal(
      warn.mock.calls[0].arguments[1].code,
      'INVALID_NATIVE_RESPONSE'
    );
  });

  it('with VSS off, nothing is checked', async () => {
    const { engine, names } = await ready({
      params: { vssUrl: null },
      overrides: { ...EMPTY, ...SERVER_HAS_BACKUP },
    });
    await engine.unlock();
    await drained(engine);
    assert.ok(!names().includes('vssBackupInfo'));
  });
});

describe('VSS through the facade', () => {
  it('UTEXOWallet forwards restoreFromVss, backupToVss and getVssBackupInfo', async () => {
    const { engine, args } = create({ overrides: EMPTY });
    const wallet = new UTEXOWallet({ engine });
    await wallet.init();
    await wallet.restoreFromVss();
    assert.equal(args('vssRestoreBackup').length, 1);
    assert.equal(await wallet.backupToVss(), 3);
    assert.equal((await wallet.getVssBackupInfo()).backupExists, false);
  });
});
