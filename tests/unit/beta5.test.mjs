// What rgb-lib-wasm 1.0.0-beta.5 added to RgbLibWeb: the witness version,
// the optional AbortSignal (ABORTED), the indexer check,
// and the Web Lock on an open wallet (WALLET_STORAGE_IN_USE).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { RgbLibWeb } from '../../dist/index.mjs';
import {
  ASSET_ID,
  KEYS,
  TXID,
  createFakeRuntime,
} from '../fake-rgb-lib-wasm.mjs';
import { REAL_LOCKS } from '../support/no-web-locks.mjs';

const ONLINE = {
  indexerUrl: 'http://127.0.0.1:3002',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};

function create({ params = {}, keys = KEYS.mnemonic, ...fake } = {}) {
  const runtime = createFakeRuntime(fake);
  const engine = new RgbLibWeb({
    network: 'regtest',
    vssUrl: null,
    ...ONLINE,
    ...params,
    keys,
    runtime,
  });
  const names = () => runtime.calls.map((c) => c.name);
  const args = (name) => runtime.calls.find((c) => c.name === name)?.args;
  return { engine, runtime, names, args };
}

async function ready(options) {
  const env = create(options);
  await env.engine.init();
  return env;
}

async function rejects(promise, code, operation) {
  await assert.rejects(promise, (error) => {
    assert.ok(isEngineError(error, code), `${error?.code}: ${error?.message}`);
    if (operation) assert.equal(error.operation, operation);
    return true;
  });
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('witnessVersion', () => {
  it('is taproot by default', async () => {
    const { args } = await ready();
    assert.equal(args('restoreKeys')[2], 'Taproot');
    assert.equal(args('create')[1].witnessVersion, 'Taproot');
  });

  it('segwit-v0 derives and opens SegWitV0 keys, with the RN wallet ID', async () => {
    const { engine, args } = await ready({
      params: { witnessVersion: 'segwit-v0' },
    });
    assert.equal(args('restoreKeys')[2], 'SegWitV0');
    assert.equal(args('create')[1].witnessVersion, 'SegWitV0');
    const id = createHash('sha256')
      .update(
        `regtest:segwit-v0:${KEYS.accountXpubVanilla}:${KEYS.accountXpubColored}`
      )
      .digest('hex');
    assert.equal((await engine.getWalletIdentity()).id, id);
  });

  it('refuses another value at construction', () => {
    assert.throws(
      () => create({ params: { witnessVersion: 'legacy' } }),
      (error) =>
        isEngineError(error, 'INVALID_CONFIG') &&
        /Unsupported witnessVersion/.test(error.message)
    );
  });
});

describe('AbortSignal', () => {
  it('passes the signal to the long runtime calls', async () => {
    const { engine, args } = await ready();
    const { signal } = new AbortController();
    await engine.createUtxos({ num: 1, feeRate: 1, signal });
    assert.equal(args('createUtxosBegin')[8], signal);
    await engine.refresh({ signal });
    assert.equal(args('refresh')[4], signal);
  });

  it('syncs both keychains with the signal, as on React Native', async () => {
    const { engine, runtime } = await ready();
    const { signal } = new AbortController();
    await engine.syncWallet({ signal });
    const syncs = runtime.calls.filter((c) => c.name === 'sync');
    assert.deepEqual(
      syncs.map((c) => c.args[1]),
      [
        { keychain: 'Colored', strategy: 'FullSync' },
        { keychain: { Vanilla: { lookback: 20 } }, strategy: 'FullSync' },
      ]
    );
    assert.ok(syncs.every((c) => c.args[2] === signal));
  });

  it('a fired signal rejects with ABORTED before any runtime call', async () => {
    const { engine, names } = await ready();
    await engine.unlock();
    const before = names().length;
    await rejects(
      engine.sendBtc({
        address: 'bcrt1q',
        amount: 1,
        feeRate: 1,
        signal: AbortSignal.abort(),
      }),
      'ABORTED',
      'sendBtc'
    );
    assert.equal(names().length, before);
  });

  it('a call still queued rejects at once and never runs', async () => {
    let release;
    const { engine, names } = await ready({
      overrides: {
        getFeeEstimation: () =>
          new Promise((resolve) => {
            release = () => resolve(2);
          }),
      },
    });
    await engine.unlock();
    const first = engine.estimateFeeRate(1);
    await tick();
    const controller = new AbortController();
    const queued = engine.createUtxos({
      num: 1,
      feeRate: 1,
      signal: controller.signal,
    });
    controller.abort();
    await rejects(queued, 'ABORTED', 'createUtxos');
    release();
    assert.deepEqual(await first, { feeRate: 2 });
    assert.ok(!names().includes('createUtxosBegin'));
  });

  it('a running call that the runtime aborts rejects with ABORTED', async () => {
    const { engine } = await ready({
      overrides: {
        createUtxosBegin: (...args) =>
          new Promise((_, reject) => {
            args[8].addEventListener('abort', () => reject('Aborted'));
          }),
      },
    });
    await engine.unlock();
    const controller = new AbortController();
    const call = engine.createUtxos({
      num: 1,
      feeRate: 1,
      signal: controller.signal,
    });
    await tick();
    controller.abort();
    await rejects(call, 'ABORTED', 'createUtxos');
  });

  it('a running call is not reported as aborted when it completes', async () => {
    let finish;
    const controller = new AbortController();
    const { engine } = await ready({
      overrides: {
        createUtxosEnd: () =>
          new Promise((resolve) => {
            finish = () => resolve(3);
          }),
      },
    });
    await engine.unlock();
    const call = engine.createUtxos({
      num: 1,
      feeRate: 1,
      signal: controller.signal,
    });
    while (!finish) await tick();
    controller.abort();
    finish();
    assert.equal(await call, 3);
  });

  it('refuses a signal that is not an AbortSignal', async () => {
    const { engine, names } = await ready();
    const before = names().length;
    await rejects(
      engine.createUtxos({ num: 1, feeRate: 1, signal: { aborted: false } }),
      'INVALID_PARAMS',
      'createUtxos'
    );
    assert.equal(names().length, before);
  });
});

describe('checkIndexerUrl', () => {
  it('returns the protocol for the wallet network', async () => {
    const { engine, args } = await ready();
    assert.deepEqual(await engine.checkIndexerUrl('http://esplora.test/api'), {
      indexerProtocol: 'esplora',
    });
    assert.deepEqual(args('checkIndexerUrl'), [
      'http://esplora.test/api',
      'regtest',
    ]);
  });

  it('refuses an Electrum URL in the browser', async () => {
    const { engine, names } = await ready();
    await rejects(
      engine.checkIndexerUrl('ssl://electrum.test:50002'),
      'UNSUPPORTED_CAPABILITY',
      'checkIndexerUrl'
    );
    assert.ok(!names().includes('checkIndexerUrl'));
  });
});

const realLocks = globalThis[REAL_LOCKS];

describe('Web Lock', { skip: !realLocks && 'no Web Locks API' }, () => {
  /** Runs `fn` with the real navigator.locks, then turns it off again. */
  async function withLocks(fn) {
    navigator.locks = realLocks;
    try {
      await fn();
    } finally {
      navigator.locks = undefined;
    }
  }

  it('a second open of the same wallet is WALLET_STORAGE_IN_USE until the first is destroyed', () =>
    withLocks(async () => {
      const first = await ready();
      const second = create();
      await rejects(second.engine.init(), 'WALLET_STORAGE_IN_USE');
      assert.ok(!second.names().includes('create'));
      await first.engine.destroy();
      const third = await ready();
      await third.engine.destroy();
    }));

  it('another wallet or data directory opens alongside', () =>
    withLocks(async () => {
      const a = await ready();
      const b = await ready({ params: { dataDir: 'other' } });
      const c = await ready({
        keys: {
          accountXpubVanilla: KEYS.accountXpubVanilla,
          accountXpubColored: KEYS.accountXpubColored,
          masterFingerprint: 'deadbeef',
        },
      });
      await Promise.all([a, b, c].map((e) => e.engine.destroy()));
    }));

  it('a failed open releases the lock', () =>
    withLocks(async () => {
      let fail = true;
      const runtime = createFakeRuntime();
      const create_ = runtime.WasmWallet.create;
      runtime.WasmWallet.create = async (...args) => {
        if (fail) throw new Error('open failed');
        return create_(...args);
      };
      const engine = () =>
        new RgbLibWeb({
          network: 'regtest',
          vssUrl: null,
          ...ONLINE,
          keys: KEYS.mnemonic,
          runtime,
        });
      await assert.rejects(engine().init());
      fail = false;
      const opened = engine();
      await opened.init();
      await opened.destroy();
    }));
});

describe('allowRecklessSchemas on mainnet', () => {
  const MAINNET = {
    network: 'mainnet',
    indexerUrl: 'https://esplora.example/api',
    proxyEndpoint: 'rpcs://proxy.example/json-rpc',
  };

  it('opens a mainnet wallet with NIA only by default', async () => {
    const { engine, args } = await ready({ params: MAINNET });
    const [data] = args('create');
    assert.deepEqual(data.supportedSchemas, ['Nia']);
    assert.equal(data.allowRecklessSchemas, false);
    assert.deepEqual(await engine.getBfaCapabilities(), {
      burn: false,
      consignment: false,
      bfa: false,
    });
  });

  it('refuses the IFA and BFA operations before any runtime call', async () => {
    const { engine, names } = await ready({ params: MAINNET });
    const before = names().length;
    const refused = [
      [
        'issueAssetIfa',
        engine.issueAssetIfa({
          ticker: 'IFA',
          name: 'I',
          precision: 0,
          amounts: [1],
          inflationAmounts: [1],
          rejectListUrl: null,
        }),
      ],
      [
        'inflate',
        engine.inflate({
          assetId: ASSET_ID,
          inflationAmounts: [1],
          feeRate: 1,
        }),
      ],
      [
        'burn',
        engine.burn({
          assetId: ASSET_ID,
          amount: '1',
          feeRate: 1,
          minConfirmations: 1,
        }),
      ],
      [
        'burnBegin',
        engine.beginEnd.burnBegin({
          assetId: ASSET_ID,
          amount: '1',
          feeRate: 1,
          minConfirmations: 1,
        }),
      ],
      ['getConsignment', engine.getConsignment(ASSET_ID, TXID)],
      ['getReceivedMint', engine.getReceivedMint('bc:utxob:rid')],
    ];
    for (const [operation, promise] of refused) {
      await assert.rejects(promise, (error) => {
        assert.ok(isEngineError(error, 'UNSUPPORTED_CAPABILITY'), operation);
        assert.equal(error.operation, operation);
        assert.match(error.message, /allowRecklessSchemas/);
        return true;
      });
    }
    assert.equal(names().length, before);
    // NIA and bitcoin still work.
    assert.equal(typeof (await engine.getAddress()), 'string');
  });

  it('opens with every schema when allowRecklessSchemas is true', async () => {
    const { engine, args } = await ready({
      params: { ...MAINNET, allowRecklessSchemas: true },
    });
    const [data] = args('create');
    assert.deepEqual(data.supportedSchemas, ['Nia', 'Ifa', 'Bfa']);
    assert.equal(data.allowRecklessSchemas, true);
    assert.equal((await engine.getBfaCapabilities()).bfa, true);
  });

  it('other networks always have every schema', async () => {
    const { args } = await ready({ params: { network: 'testnet' } });
    assert.deepEqual(args('create')[0].supportedSchemas, ['Nia', 'Ifa', 'Bfa']);
  });

  it('refuses a value that is not a boolean', () => {
    assert.throws(
      () => create({ params: { ...MAINNET, allowRecklessSchemas: 'yes' } }),
      (error) => isEngineError(error, 'INVALID_CONFIG')
    );
  });
});

describe('getAssetMetadata', () => {
  it('maps the contract metadata with exact supplies, as on React Native', async () => {
    const { engine, args } = await ready();
    assert.deepEqual(await engine.getAssetMetadata(ASSET_ID), {
      assetSchema: 'Ifa',
      name: 'Inflatable',
      precision: 2,
      ticker: 'IFA',
      timestamp: 1700000000,
      initialSupply: '100',
      maxSupply: '18446744073709551615',
      knownCirculatingSupply: '100',
      rejectListUrl: 'https://reject.example',
    });
    assert.deepEqual(args('getAssetMetadata'), [ASSET_ID]);
  });

  it('maps an unknown asset to ASSET_NOT_FOUND', async () => {
    const { engine } = await ready({
      overrides: {
        getAssetMetadata: () => {
          throw 'Asset with id rgb:x not found';
        },
      },
    });
    await rejects(
      engine.getAssetMetadata('rgb:x'),
      'ASSET_NOT_FOUND',
      'getAssetMetadata'
    );
  });

  it('refuses an empty asset ID before any runtime call', async () => {
    const { engine, names } = await ready();
    await rejects(engine.getAssetMetadata(''), 'INVALID_PARAMS');
    assert.ok(!names().includes('getAssetMetadata'));
  });
});
