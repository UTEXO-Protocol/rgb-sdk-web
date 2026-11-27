// Prepare, approve and submit as separate steps: the beginEnd and psbt carriers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { RgbLibWeb } from '../../dist/index.mjs';
import { ASSET_ID, KEYS, createFakeRuntime } from '../fake-rgb-lib-wasm.mjs';
import * as sendBeginFixtures from '../fixtures/rgb-lib-wasm-1.0.0-beta.7/sendBegin.mjs';

/** The PSBTs rgb-lib-wasm built on the stand: 309 and 511 sat of fee. */
function fixturePsbts() {
  const found = [];
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object')
      for (const [key, item] of Object.entries(value)) {
        if (key === 'psbt' && typeof item === 'string') found.push(item);
        else walk(item);
      }
  };
  walk({ ...sendBeginFixtures });
  return found;
}
const [PSBT] = fixturePsbts();

/** The txid of a PSBT, computed here without the code under test. */
function txidOf(psbt) {
  const bytes = Buffer.from(psbt, 'base64');
  // Magic (5), key length (1), key type (1), then the value's CompactSize.
  const wide = bytes[7] === 0xfd;
  const length = wide ? bytes.readUInt16LE(8) : bytes[7];
  const start = wide ? 10 : 8;
  const hash = (data) => createHash('sha256').update(data).digest();
  return hash(hash(bytes.subarray(start, start + length)))
    .reverse()
    .toString('hex');
}
const TXID = txidOf(PSBT);

const ONLINE = {
  indexerUrl: 'http://127.0.0.1:3002',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};
const BURN = {
  assetId: ASSET_ID,
  amount: '3',
  feeRate: 2,
  minConfirmations: 1,
};
const INVOICE = {
  recipientId: 'utxob:recipient',
  assetSchema: 'Nia',
  assetId: ASSET_ID,
  assignment: { Fungible: 10n },
  assignmentName: null,
  network: 'Regtest',
  expirationTimestamp: null,
  transportEndpoints: ['rpc://proxy'],
  publicKey: 'pk',
  encryption: 'Required',
  unknownQueryParams: {},
};

async function ready({ keys = KEYS.mnemonic, overrides = {}, invoice } = {}) {
  const runtime = createFakeRuntime({
    invoice,
    overrides: {
      burnBegin: async () => ({
        psbt: PSBT,
        batchTransferIdx: 4,
        details: { fascia: [], minConfirmations: 1, entropy: 5n },
      }),
      burnEnd: async () => ({ txid: TXID, batchTransferIdx: 4, entropy: 5n }),
      sendBegin: async () => ({
        psbt: PSBT,
        batchTransferIdx: 9,
        details: {},
      }),
      sendEnd: async () => ({ txid: TXID, batchTransferIdx: 9, entropy: 7n }),
      ...overrides,
    },
  });
  const engine = new RgbLibWeb({
    network: 'regtest',
    vssUrl: null,
    ...ONLINE,
    keys,
    runtime,
  });
  await engine.init();
  return { engine, runtime, names: () => runtime.calls.map((c) => c.name) };
}

const transfer = (over) => ({
  idx: 1,
  batchTransferIdx: 4,
  createdAt: 1700000000n,
  updatedAt: 1700000001n,
  status: 'WaitingConfirmations',
  requestedAssignment: null,
  assignments: [],
  kind: 'Burn',
  txid: TXID,
  recipientId: null,
  receiveUtxo: null,
  changeUtxos: [],
  expirationTimestamp: null,
  transportEndpoints: [],
  senderTransportEndpoint: null,
  invoiceString: null,
  consignmentPath: null,
  psbt: null,
  burnReason: null,
  ...over,
});
const alreadyEnded = async () => {
  throw `Transfer cannot be ended: ${TXID}`;
};

async function rejects(promise, code, operation) {
  await assert.rejects(promise, (error) => {
    assert.ok(isEngineError(error, code), `${error?.code}: ${error?.message}`);
    if (operation) assert.equal(error.operation, operation);
    return true;
  });
}

describe('capabilities', () => {
  it('a wallet with the mnemonic has both carriers', async () => {
    const { engine } = await ready();
    assert.equal(engine.capabilities.beginEndFlows, true);
    assert.equal(engine.capabilities.psbtSigning, true);
  });

  it('a watch-only wallet can prepare and submit but not sign', async () => {
    const { engine } = await ready({
      keys: {
        accountXpubVanilla: KEYS.accountXpubVanilla,
        accountXpubColored: KEYS.accountXpubColored,
        masterFingerprint: KEYS.masterFingerprint,
      },
    });
    assert.equal(engine.psbt, undefined);
    assert.equal(engine.capabilities.psbtSigning, false);
    const begun = await engine.beginEnd.burnBegin(BURN);
    assert.equal(begun.psbt, PSBT);
  });
});

describe('burnBegin', () => {
  it('shows the exact transaction and fee and signs nothing', async () => {
    const { engine, runtime, names } = await ready();
    const begun = await engine.beginEnd.burnBegin({
      ...BURN,
      burnRecipient: 'ab'.repeat(32),
    });
    assert.deepEqual(begun, {
      psbt: PSBT,
      batchTransferIdx: 4,
      txid: TXID,
      fee: 309,
      vbytes: 154,
      feeRate: 309 / 154,
    });
    assert.ok(!names().includes('signPsbt'));
    assert.ok(!names().includes('burnEnd'));
    const args = runtime.calls.find((c) => c.name === 'burnBegin').args;
    assert.deepEqual(args.slice(1, 7), [
      ASSET_ID,
      3n,
      'ab'.repeat(32),
      2n,
      1,
      // Not a dry run: the inputs stay reserved while the user decides.
      false,
    ]);
  });

  it('checks the params before any WASM call', async () => {
    const { engine, names } = await ready();
    await rejects(
      engine.beginEnd.burnBegin({ ...BURN, amount: '0' }),
      'INVALID_PARAMS',
      'burnBegin'
    );
    assert.ok(!names().includes('burnBegin'));
  });
});

describe('burnEnd', () => {
  it('submits exactly the signed PSBT it is given', async () => {
    const { engine, runtime, names } = await ready();
    const result = await engine.beginEnd.burnEnd({ signedPsbt: PSBT });
    assert.deepEqual(result, { txid: TXID, batchTransferIdx: 4 });
    assert.equal(runtime.calls.at(-1).args[1], PSBT);
    assert.ok(!names().includes('signPsbt'));
  });

  for (const status of ['WaitingConfirmations', 'Settled']) {
    it(`a retry after an interruption resolves when ${status}`, async () => {
      const { engine } = await ready({
        overrides: {
          burnEnd: alreadyEnded,
          listTransfers: () => [transfer({ status })],
        },
      });
      assert.deepEqual(await engine.beginEnd.burnEnd({ signedPsbt: PSBT }), {
        txid: TXID,
        batchTransferIdx: 4,
      });
    });
  }

  for (const [label, over] of [
    ['failed', { status: 'Failed' }],
    ['another kind of transfer', { kind: 'Send' }],
    ['another transaction', { txid: 'cd'.repeat(32) }],
  ]) {
    it(`a retry still rejects for ${label}`, async () => {
      const { engine } = await ready({
        overrides: {
          burnEnd: alreadyEnded,
          listTransfers: () => [transfer(over)],
        },
      });
      await rejects(
        engine.beginEnd.burnEnd({ signedPsbt: PSBT }),
        'NATIVE_ERROR',
        'burnEnd'
      );
    });
  }

  it('does not read a broadcast failure as submitted', async () => {
    const { engine, names } = await ready({
      overrides: {
        burnEnd: async () => {
          throw 'Failed to broadcast: timeout';
        },
      },
    });
    await assert.rejects(engine.beginEnd.burnEnd({ signedPsbt: PSBT }));
    assert.ok(!names().includes('listTransfers'));
  });

  it('refuses a missing signed PSBT', async () => {
    const { engine, names } = await ready();
    await rejects(
      engine.beginEnd.burnEnd({ signedPsbt: '' }),
      'INVALID_PARAMS',
      'burnEnd'
    );
    assert.ok(!names().includes('burnEnd'));
  });
});

describe('onchainSend in steps', () => {
  it('begin applies the invoice rules and returns the unsigned PSBT', async () => {
    const { engine, names } = await ready({ invoice: INVOICE });
    const psbt = await engine.beginEnd.onchainSendBegin({
      invoice: 'rgb:invoice',
      feeRate: 2,
    });
    assert.equal(psbt, PSBT);
    assert.ok(!names().includes('signPsbt'));
    assert.ok(!names().includes('sendEnd'));
  });

  it('begin refuses an invoice for another network', async () => {
    const { engine, names } = await ready({
      invoice: { ...INVOICE, network: 'Mainnet' },
    });
    await rejects(
      engine.beginEnd.onchainSendBegin({ invoice: 'rgb:x', feeRate: 2 }),
      'INVALID_PARAMS',
      'onchainSendBegin'
    );
    assert.ok(!names().includes('sendBegin'));
  });

  it('end resolves on a retry once the send has moved on', async () => {
    const { engine } = await ready({
      overrides: {
        sendEnd: alreadyEnded,
        listTransfers: () => [
          transfer({ kind: 'Send', batchTransferIdx: 9, status: 'Settled' }),
        ],
      },
    });
    assert.deepEqual(
      await engine.beginEnd.onchainSendEnd({ signedPsbt: PSBT }),
      { txid: TXID, batchTransferIdx: 9 }
    );
  });
});

describe('psbt carrier', () => {
  it('estimateFee reads every fixture PSBT', async () => {
    const { engine } = await ready();
    const fees = await Promise.all(
      fixturePsbts().map((psbt) => engine.psbt.estimateFee(psbt))
    );
    assert.deepEqual(
      fees.map((f) => f.fee),
      [309, 511]
    );
  });

  it('signPsbt signs with the wallet keys', async () => {
    const { engine } = await ready();
    assert.equal(await engine.psbt.signPsbt(PSBT), `signed:${PSBT}`);
  });

  it('signPsbt refuses another mnemonic without repeating it', async () => {
    const { engine, names } = await ready();
    await assert.rejects(
      engine.psbt.signPsbt(PSBT, 'secret words here'),
      (error) => {
        assert.ok(isEngineError(error, 'INVALID_PARAMS'));
        assert.ok(!error.message.includes('secret words'));
        return true;
      }
    );
    assert.ok(!names().includes('signPsbt'));
  });

  const bytes = Buffer.from(PSBT, 'base64');
  /** The offset of the first input's witness_utxo entry. */
  function witnessUtxoEntry() {
    const size = (at) =>
      bytes[at] === 0xfd ? [bytes.readUInt16LE(at + 1), 3] : [bytes[at], 1];
    const next = (at) => {
      const [key, keyWidth] = size(at);
      const value = at + keyWidth + key;
      const [length, width] = size(value);
      return value + width + length;
    };
    let at = 5;
    while (bytes[at] !== 0) at = next(at);
    at += 1;
    while (bytes[at] !== 1 || bytes[at + 1] !== 0x01) {
      assert.notEqual(bytes[at], 0, 'the fixture has no witness_utxo');
      at = next(at);
    }
    return at;
  }
  const entry = witnessUtxoEntry();
  const withoutUtxo = Buffer.from(bytes);
  withoutUtxo[entry + 1] = 0x7f;
  const notTaproot = Buffer.from(bytes);
  // Key length, key type, value size, amount (8), script size, then the script.
  notTaproot[entry + 3 + 8 + 1] = 0x00;

  for (const [label, psbt] of [
    ['text that is not base64', 'not a psbt!'],
    ['a wrong header', Buffer.from('nonsense').toString('base64')],
    ['a cut PSBT', bytes.subarray(0, 40).toString('base64')],
    ['an input without its UTXO', withoutUtxo.toString('base64')],
    ['an input that is not Taproot', notTaproot.toString('base64')],
  ]) {
    it(`estimateFee refuses ${label}`, async () => {
      const { engine } = await ready();
      await rejects(
        engine.psbt.estimateFee(psbt),
        'INVALID_PARAMS',
        'estimateFee'
      );
    });
  }
});
