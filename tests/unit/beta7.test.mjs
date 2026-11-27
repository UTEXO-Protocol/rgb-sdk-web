// What rgb-lib-wasm 1.0.0-beta.7 changed in RgbLibWeb: the consignment of any
// transfer (getConsignment), CONSIGNMENT_NOT_FOUND, and no address reuse.
// getReceivedMint's assetId is in rgb-lib-web.test.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { RgbLibWeb } from '../../dist/index.mjs';
import {
  ASSET_ID,
  KEYS,
  TXID,
  createFakeRuntime,
} from '../fake-rgb-lib-wasm.mjs';

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

describe('reuseAddresses', () => {
  it('refuses true at construction: the runtime has no address reuse', () => {
    assert.throws(
      () => create({ params: { reuseAddresses: true } }),
      (error) =>
        isEngineError(error, 'INVALID_CONFIG') &&
        /reuseAddresses was removed/.test(error.message)
    );
  });

  it('refuses a value that is not a boolean', () => {
    assert.throws(
      () => create({ params: { reuseAddresses: 'yes' } }),
      (error) => isEngineError(error, 'INVALID_CONFIG')
    );
  });

  it('accepts false and does not pass it to the runtime', async () => {
    const { engine, args } = await ready({ params: { reuseAddresses: false } });
    assert.ok(engine);
    assert.equal('reuseAddresses' in args('create')[0], false);
  });
});

describe('getConsignment', () => {
  it('returns the consignment of the transfer in txid as base64', async () => {
    const { engine, args } = await ready();
    assert.equal(
      await engine.getConsignment(ASSET_ID, TXID.toUpperCase()),
      'AQID+g=='
    );
    assert.deepEqual(args('listTransfers'), [{ Id: ASSET_ID }, { Txid: TXID }]);
    assert.deepEqual(args('getConsignment'), [1]);
  });

  it('checks the lookup before any runtime call', async () => {
    const { engine, names } = await ready();
    await rejects(
      engine.getConsignment(ASSET_ID, 'not-a-txid'),
      'INVALID_PARAMS',
      'getConsignment'
    );
    assert.ok(!names().includes('getConsignment'));
  });

  it('is CONSIGNMENT_NOT_FOUND for a transfer without one', async () => {
    const { engine } = await ready({
      overrides: { getConsignment: () => null },
    });
    await rejects(
      engine.getConsignment(ASSET_ID, TXID),
      'CONSIGNMENT_NOT_FOUND',
      'getConsignment'
    );
  });

  it('is CONSIGNMENT_NOT_FOUND for a txid without a transfer of the asset', async () => {
    const { engine, names } = await ready({
      overrides: { listTransfers: () => [] },
    });
    await rejects(
      engine.getConsignment(ASSET_ID, TXID),
      'CONSIGNMENT_NOT_FOUND',
      'getConsignment'
    );
    assert.ok(!names().includes('getConsignment'));
  });
});

/** A transfer as `listTransfers` gives it; only the fields read here matter. */
const transfer = (idx, over = {}) => ({
  idx,
  batchTransferIdx: idx,
  createdAt: 1700000000n,
  updatedAt: 1700000001n,
  status: 'Settled',
  requestedAssignment: { Fungible: 10n },
  assignments: [{ Fungible: 10n }],
  kind: 'Send',
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

describe('getConsignment over several transfers', () => {
  const bytesBy = (map) => (idx) => map[idx] ?? null;

  it('returns the consignment that transfers of one batch share', async () => {
    const { engine } = await ready({
      overrides: {
        listTransfers: () => [transfer(1), transfer(2)],
        getConsignment: bytesBy({
          1: new Uint8Array([1, 2, 3, 250]),
          2: new Uint8Array([1, 2, 3, 250]),
        }),
      },
    });
    assert.equal(await engine.getConsignment(ASSET_ID, TXID), 'AQID+g==');
  });

  it('skips a transfer without one', async () => {
    const { engine } = await ready({
      overrides: {
        listTransfers: () => [transfer(1, { kind: 'Inflation' }), transfer(2)],
        getConsignment: bytesBy({ 2: new Uint8Array([1, 2, 3, 250]) }),
      },
    });
    assert.equal(await engine.getConsignment(ASSET_ID, TXID), 'AQID+g==');
  });

  it('is CONSIGNMENT_NOT_FOUND when the transfers hold different ones', async () => {
    const { engine } = await ready({
      overrides: {
        listTransfers: () => [transfer(1), transfer(2)],
        getConsignment: bytesBy({
          1: new Uint8Array([1, 2, 3]),
          2: new Uint8Array([4, 5, 6]),
        }),
      },
    });
    await assert.rejects(
      engine.getConsignment(ASSET_ID, TXID),
      (error) =>
        isEngineError(error, 'CONSIGNMENT_NOT_FOUND') &&
        /No unique consignment/.test(error.message)
    );
  });

  it('getReceivedMint reads the receive of its recipient ID only', async () => {
    const opid = 'a'.repeat(64);
    const { engine, runtime } = await ready({
      overrides: {
        listTransfers: () => [
          transfer(1, {
            kind: 'ReceiveBlind',
            recipientId: 'other',
            txid: null,
          }),
          transfer(2, { kind: 'ReceiveBlind', recipientId: 'rid', txid: null }),
        ],
        getReceivedMint: () => ({
          opid,
          lockId: 'b'.repeat(64),
          amount: 1n,
          beforeBlock: 2n,
          evmChainId: 31337n,
          bridgeContract: `0x${'c'.repeat(40)}`,
        }),
        getConsignment: bytesBy({
          1: new Uint8Array([9]),
          2: new Uint8Array([7, 7]),
        }),
        inspectConsignment: () => ({
          assetId: 'rgb:minted',
          witnesses: [
            {
              operations: [{ assetId: 'rgb:minted', transitions: [{ opid }] }],
            },
          ],
        }),
      },
    });
    assert.equal((await engine.getReceivedMint('rid')).assetId, 'rgb:minted');
    const read = runtime.calls
      .filter((c) => c.name === 'getConsignment')
      .map((c) => c.args[0]);
    assert.deepEqual(read, [2]);
  });
});
