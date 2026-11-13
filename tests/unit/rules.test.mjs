// The input rules of ADR-0002's parity list, through the public engine: the
// WASM arguments each rule produces (with a fixed clock), and that a refused
// call reaches no runtime method at all, not even the lazy connect.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { RgbLibWeb } from '../../dist/index.mjs';
import { ASSET_ID, KEYS, createFakeRuntime } from '../fake-rgb-lib-wasm.mjs';

const ONLINE = {
  indexerUrl: 'http://127.0.0.1:3002',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};
/** The fixed clock, in seconds. */
const NOW = 1_800_000_000;

function create({ keys = KEYS.mnemonic, ...fake } = {}) {
  const runtime = createFakeRuntime(fake);
  const engine = new RgbLibWeb({
    network: 'regtest',
    vssUrl: null,
    ...ONLINE,
    keys,
    runtime,
  });
  return { engine, runtime, names: () => runtime.calls.map((c) => c.name) };
}

async function ready(options) {
  const env = create(options);
  await env.engine.init();
  return env;
}

/** Fixes `Date.now()` for this test only. */
const clock = (t) => t.mock.timers.enable({ apis: ['Date'], now: NOW * 1000 });

const argsOf = (runtime, name) =>
  runtime.calls.find((c) => c.name === name)?.args;

/** Rejects with `code` (and `message`, when given) and calls nothing. */
async function refused(env, run, code, message) {
  const before = env.names().length;
  await assert.rejects(run(), (error) => {
    assert.ok(isEngineError(error, code), `${error?.code}: ${error?.message}`);
    if (message !== undefined) assert.equal(error.message, message);
    return true;
  });
  assert.deepEqual(env.names().slice(before), []);
}

const invoice = (over = {}) => ({
  recipientId: 'utxob:recipient',
  assetSchema: 'Nia',
  assetId: ASSET_ID,
  assignment: 'Any',
  assignmentName: null,
  network: 'Regtest',
  expirationTimestamp: BigInt(NOW + 7200),
  transportEndpoints: ['rpc://proxy'],
  publicKey: 'pk',
  encryption: 'Required',
  unknownQueryParams: {},
  ...over,
});

describe('receive assignment rules', () => {
  const accepted = [
    [{ amount: 10 }, { Fungible: 10n }],
    [{}, 'Any'],
    [{ assignmentKind: 'Fungible', amount: 10 }, { Fungible: 10n }],
    [{ assignmentKind: 'InflationRight', amount: 3 }, { InflationRight: 3n }],
    [{ assignmentKind: 'NonFungible' }, 'NonFungible'],
    [{ assignmentKind: 'MintRight' }, 'MintRight'],
    [{ assignmentKind: 'Any' }, 'Any'],
  ];
  for (const [params, assignment] of accepted)
    it(`${JSON.stringify(params)} → ${JSON.stringify(assignment, (_, v) => (typeof v === 'bigint' ? `${v}n` : v))}`, async () => {
      for (const method of ['blindReceive', 'witnessReceive']) {
        const { engine, runtime } = await ready();
        await engine[method]({ assetId: ASSET_ID, ...params });
        assert.deepEqual(argsOf(runtime, method)[2], assignment, method);
      }
    });

  const rejectedKinds = [
    [{ assignmentKind: 'Fungible' }, 'Fungible receive requires amount'],
    [
      { assignmentKind: 'InflationRight' },
      'InflationRight receive requires amount',
    ],
    [
      { assignmentKind: 'NonFungible', amount: 1 },
      'NonFungible receive takes no amount',
    ],
    [
      { assignmentKind: 'MintRight', amount: 1 },
      'MintRight receive takes no amount',
    ],
    [{ assignmentKind: 'Any', amount: 1 }, 'Any receive takes no amount'],
    [{ assignmentKind: 'Bogus', amount: 1 }, 'Unknown assignmentKind: Bogus'],
    // Inherited keys of the rule table are not kinds.
    [
      { assignmentKind: 'constructor', amount: 1 },
      'Unknown assignmentKind: constructor',
    ],
    [
      { assignmentKind: '__proto__', amount: 1 },
      'Unknown assignmentKind: __proto__',
    ],
    [
      { assignmentKind: 'toString', amount: 1 },
      'Unknown assignmentKind: toString',
    ],
  ];
  for (const [params, message] of rejectedKinds)
    it(`refuses ${JSON.stringify(params)} before any call`, async () => {
      const env = await ready();
      await refused(
        env,
        () => env.engine.blindReceive({ assetId: ASSET_ID, ...params }),
        'INVALID_PARAMS',
        message
      );
    });

  it('the expiry is now + durationSeconds (default one day)', async (t) => {
    clock(t);
    const a = await ready();
    await a.engine.blindReceive({ assetId: ASSET_ID, amount: 1 });
    assert.equal(argsOf(a.runtime, 'blindReceive')[3], BigInt(NOW + 86400));
    const b = await ready();
    await b.engine.witnessReceive({
      assetId: ASSET_ID,
      amount: 1,
      durationSeconds: 60,
    });
    assert.equal(argsOf(b.runtime, 'witnessReceive')[3], BigInt(NOW + 60));
  });

  it('passes the full wire arguments', async (t) => {
    clock(t);
    const { engine, runtime } = await ready();
    await engine.blindReceive({
      assetId: ASSET_ID,
      amount: 5,
      minConfirmations: 2,
    });
    assert.deepEqual(argsOf(runtime, 'blindReceive').slice(1), [
      ASSET_ID,
      { Fungible: 5n },
      BigInt(NOW + 86400),
      [ONLINE.proxyEndpoint],
      2,
      null,
    ]);
  });
});

describe('onchainSend invoice rules', () => {
  /** sendBegin's arguments after the online handle. */
  const begin = (runtime) => argsOf(runtime, 'sendBegin').slice(1);

  it('passes the full wire arguments for an Any invoice', async (t) => {
    clock(t);
    const { engine, runtime } = await ready({ invoice: invoice() });
    await engine.onchainSend({
      invoice: 'rgb:x',
      amount: 10,
      feeRate: 3,
      witnessData: { amountSat: 1000, blinding: 7 },
    });
    assert.deepEqual(begin(runtime), [
      {
        [ASSET_ID]: [
          {
            recipientId: 'utxob:recipient',
            witnessData: { amountSat: '1000', blinding: '7' },
            assignment: { Fungible: 10n },
            transportEndpoints: ['rpc://proxy'],
            publicKey: 'pk',
            encryption: 'Required',
            expirationTimestamp: BigInt(NOW + 7200),
          },
        ],
      },
      false,
      3n,
      1,
      BigInt(NOW + 7200 - 600),
      ONLINE.proxyEndpoint,
      null,
      false,
    ]);
  });

  it('an invoice without expiry gets the default of one hour', async (t) => {
    clock(t);
    const { engine, runtime } = await ready({
      invoice: invoice({ expirationTimestamp: undefined }),
    });
    await engine.onchainSend({ invoice: 'rgb:x', amount: 10 });
    const args = begin(runtime);
    assert.equal(args[0][ASSET_ID][0].expirationTimestamp, null);
    assert.equal(args[4], BigInt(NOW + 3600));
  });

  it('the expiry margin is 600 s: now + 601 passes, now + 600 is refused', async (t) => {
    clock(t);
    const ok = await ready({
      invoice: invoice({ expirationTimestamp: BigInt(NOW + 601) }),
    });
    await ok.engine.onchainSend({ invoice: 'rgb:x', amount: 10 });
    assert.equal(begin(ok.runtime)[4], BigInt(NOW + 1));

    const late = await ready({
      invoice: invoice({ expirationTimestamp: BigInt(NOW + 600) }),
    });
    await assert.rejects(
      late.engine.onchainSend({ invoice: 'rgb:x', amount: 10 }),
      (e) =>
        isEngineError(e, 'INVALID_PARAMS') &&
        e.message === 'Invoice expires too soon'
    );
    assert.ok(!late.names().includes('sendBegin'));
  });

  const refusals = [
    [
      'another network',
      { network: 'Mainnet' },
      {},
      'Invoice network does not match wallet',
    ],
    [
      'a different asset override',
      {},
      { assetId: 'rgb:other', amount: 1 },
      'Asset override does not match invoice',
    ],
    [
      'no asset anywhere',
      { assetId: undefined },
      { amount: 1 },
      'Asset ID is required',
    ],
    ['Any without amount', {}, {}, 'Amount is required'],
    [
      'a Fungible amount mismatch',
      { assignment: { Fungible: 10n } },
      { amount: 9 },
      'Amount override does not match invoice',
    ],
    [
      'an amount on a NonFungible invoice',
      { assignment: 'NonFungible' },
      { amount: 1 },
      'Amount override is incompatible with invoice',
    ],
  ];
  for (const [label, over, params, message] of refusals)
    it(`refuses ${label} without sendBegin`, async (t) => {
      clock(t);
      const { engine, names } = await ready({ invoice: invoice(over) });
      await assert.rejects(
        engine.onchainSend({ invoice: 'rgb:x', ...params }),
        (e) => isEngineError(e, 'INVALID_PARAMS') && e.message === message
      );
      assert.ok(!names().includes('sendBegin'));
    });

  const assignments = [
    [
      'a Fungible invoice without amount',
      { assignment: { Fungible: 10n } },
      {},
      { Fungible: 10n },
    ],
    [
      'a Fungible invoice with its amount',
      { assignment: { Fungible: 10n } },
      { amount: 10 },
      { Fungible: 10n },
    ],
    ['a NonFungible invoice', { assignment: 'NonFungible' }, {}, 'NonFungible'],
    [
      'an asset override on an invoice without asset',
      { assetId: undefined },
      { assetId: 'rgb:mine', amount: 2 },
      { Fungible: 2n },
    ],
  ];
  for (const [label, over, params, assignment] of assignments)
    it(`sends ${label}`, async (t) => {
      clock(t);
      const { engine, runtime } = await ready({ invoice: invoice(over) });
      await engine.onchainSend({ invoice: 'rgb:x', ...params });
      const [recipients] = begin(runtime);
      const [asset] = Object.keys(recipients);
      assert.equal(asset, params.assetId ?? ASSET_ID);
      assert.deepEqual(recipients[asset][0].assignment, assignment);
    });
});

describe('other parity rules', () => {
  it('an amount of 0 is refused by the u64 rule before any call', async () => {
    const env = await ready({ invoice: invoice() });
    await refused(
      env,
      () => env.engine.onchainSend({ invoice: 'rgb:x', amount: 0 }),
      'INVALID_AMOUNT',
      'amount is outside the supported u64 range'
    );
  });

  it('estimateFeeRate takes 1..65535 blocks', async () => {
    for (const blocks of [1, 65535]) {
      const { engine, runtime } = await ready();
      await engine.estimateFeeRate(blocks);
      assert.equal(argsOf(runtime, 'getFeeEstimation')[1], blocks);
    }
    // INVALID_CONFIG, as before ADR-0002: the bound check is shared with the
    // config (`integer()` in config.ts). Pinned here; see the ADR's open
    // questions before changing it.
    for (const blocks of [0, 65536, 1.5, -1]) {
      const env = await ready();
      await refused(
        env,
        () => env.engine.estimateFeeRate(blocks),
        'INVALID_CONFIG',
        'blocks must be an integer between 1 and 65535'
      );
    }
  });

  it('a watch-only wallet refuses every signing operation before any call', async () => {
    const env = create({
      keys: {
        accountXpubVanilla: KEYS.accountXpubVanilla,
        accountXpubColored: KEYS.accountXpubColored,
        masterFingerprint: KEYS.masterFingerprint,
      },
    });
    await env.engine.init();
    const calls = {
      createUtxos: () => env.engine.createUtxos({ num: 1 }),
      sendBtc: () =>
        env.engine.sendBtc({ address: 'a', amount: 1, feeRate: 1 }),
      inflate: () =>
        env.engine.inflate({ assetId: ASSET_ID, inflationAmounts: [1] }),
      onchainSend: () => env.engine.onchainSend({ invoice: 'rgb:x' }),
    };
    for (const run of Object.values(calls))
      await refused(env, run, 'UNSUPPORTED_CAPABILITY');
  });

  it('skipSync must be a boolean; true reads without connecting', async () => {
    const env = await ready();
    await refused(
      env,
      () => env.engine.getBtcBalance({ skipSync: 'yes' }),
      'INVALID_PARAMS'
    );
    await env.engine.getBtcBalance({ skipSync: true });
    assert.ok(!env.names().includes('goOnline'));
    assert.ok(!env.names().includes('sync'));
    await env.engine.getBtcBalance();
    assert.ok(env.names().includes('goOnline'));
  });
});
