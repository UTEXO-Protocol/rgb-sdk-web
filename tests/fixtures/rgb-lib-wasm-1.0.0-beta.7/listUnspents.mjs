// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "listUnspents"
};

export const samples = [
  {
    label: "sender: empty wallet",
    types: {"$":"array"},
    value: [],
  },
  {
    label: "sender: funded, colorable UTXOs",
    types: {"$":"array","$[0]":"object","$[0].utxo":"object","$[0].utxo.outpoint":"object","$[0].utxo.outpoint.txid":"string","$[0].utxo.outpoint.vout":"number","$[0].utxo.btcAmount":"bigint","$[0].utxo.colorable":"boolean","$[0].utxo.exists":"boolean","$[0].utxo.derivationIndex":"number","$[0].rgbAllocations":"array","$[0].pendingBlinded":"number","$[1]":"object","$[1].utxo":"object","$[1].utxo.outpoint":"object","$[1].utxo.outpoint.txid":"string","$[1].utxo.outpoint.vout":"number","$[1].utxo.btcAmount":"bigint","$[1].utxo.colorable":"boolean","$[1].utxo.exists":"boolean","$[1].utxo.derivationIndex":"number","$[1].rgbAllocations":"array","$[1].pendingBlinded":"number","$[2]":"object","$[2].utxo":"object","$[2].utxo.outpoint":"object","$[2].utxo.outpoint.txid":"string","$[2].utxo.outpoint.vout":"number","$[2].utxo.btcAmount":"bigint","$[2].utxo.colorable":"boolean","$[2].utxo.exists":"boolean","$[2].utxo.derivationIndex":"number","$[2].rgbAllocations":"array","$[2].pendingBlinded":"number","$[3]":"object","$[3].utxo":"object","$[3].utxo.outpoint":"object","$[3].utxo.outpoint.txid":"string","$[3].utxo.outpoint.vout":"number","$[3].utxo.btcAmount":"bigint","$[3].utxo.colorable":"boolean","$[3].utxo.exists":"boolean","$[3].utxo.derivationIndex":"number","$[3].rgbAllocations":"array","$[3].pendingBlinded":"number","$[4]":"object","$[4].utxo":"object","$[4].utxo.outpoint":"object","$[4].utxo.outpoint.txid":"string","$[4].utxo.outpoint.vout":"number","$[4].utxo.btcAmount":"bigint","$[4].utxo.colorable":"boolean","$[4].utxo.exists":"boolean","$[4].utxo.derivationIndex":"number","$[4].rgbAllocations":"array","$[4].pendingBlinded":"number","$[5]":"object","$[5].utxo":"object","$[5].utxo.outpoint":"object","$[5].utxo.outpoint.txid":"string","$[5].utxo.outpoint.vout":"number","$[5].utxo.btcAmount":"bigint","$[5].utxo.colorable":"boolean","$[5].utxo.exists":"boolean","$[5].utxo.derivationIndex":"number","$[5].rgbAllocations":"array","$[5].pendingBlinded":"number","$[6]":"object","$[6].utxo":"object","$[6].utxo.outpoint":"object","$[6].utxo.outpoint.txid":"string","$[6].utxo.outpoint.vout":"number","$[6].utxo.btcAmount":"bigint","$[6].utxo.colorable":"boolean","$[6].utxo.exists":"boolean","$[6].utxo.derivationIndex":"number","$[6].rgbAllocations":"array","$[6].pendingBlinded":"number","$[7]":"object","$[7].utxo":"object","$[7].utxo.outpoint":"object","$[7].utxo.outpoint.txid":"string","$[7].utxo.outpoint.vout":"number","$[7].utxo.btcAmount":"bigint","$[7].utxo.colorable":"boolean","$[7].utxo.exists":"boolean","$[7].utxo.derivationIndex":"number","$[7].rgbAllocations":"array","$[7].pendingBlinded":"number","$[8]":"object","$[8].utxo":"object","$[8].utxo.outpoint":"object","$[8].utxo.outpoint.txid":"string","$[8].utxo.outpoint.vout":"number","$[8].utxo.btcAmount":"bigint","$[8].utxo.colorable":"boolean","$[8].utxo.exists":"boolean","$[8].utxo.derivationIndex":"number","$[8].rgbAllocations":"array","$[8].pendingBlinded":"number"},
    value: [
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 7,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 0,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 3,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 1,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 5,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 2,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 8,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 3,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 2,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 4,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 0,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 5,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 4,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 6,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 1,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 7,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 6,
          },
          btcAmount: 99991089n,
          colorable: false,
          exists: true,
          derivationIndex: 0,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
    ],
  },
  {
    label: "sender: with NIA and IFA",
    types: {"$":"array","$[0]":"object","$[0].utxo":"object","$[0].utxo.outpoint":"object","$[0].utxo.outpoint.txid":"string","$[0].utxo.outpoint.vout":"number","$[0].utxo.btcAmount":"bigint","$[0].utxo.colorable":"boolean","$[0].utxo.exists":"boolean","$[0].utxo.derivationIndex":"number","$[0].rgbAllocations":"array","$[0].rgbAllocations[0]":"object","$[0].rgbAllocations[0].assetId":"string","$[0].rgbAllocations[0].assignment":"object","$[0].rgbAllocations[0].assignment.Fungible":"bigint","$[0].rgbAllocations[0].settled":"boolean","$[0].pendingBlinded":"number","$[1]":"object","$[1].utxo":"object","$[1].utxo.outpoint":"object","$[1].utxo.outpoint.txid":"string","$[1].utxo.outpoint.vout":"number","$[1].utxo.btcAmount":"bigint","$[1].utxo.colorable":"boolean","$[1].utxo.exists":"boolean","$[1].utxo.derivationIndex":"number","$[1].rgbAllocations":"array","$[1].rgbAllocations[0]":"object","$[1].rgbAllocations[0].assetId":"string","$[1].rgbAllocations[0].assignment":"object","$[1].rgbAllocations[0].assignment.Fungible":"bigint","$[1].rgbAllocations[0].settled":"boolean","$[1].pendingBlinded":"number","$[2]":"object","$[2].utxo":"object","$[2].utxo.outpoint":"object","$[2].utxo.outpoint.txid":"string","$[2].utxo.outpoint.vout":"number","$[2].utxo.btcAmount":"bigint","$[2].utxo.colorable":"boolean","$[2].utxo.exists":"boolean","$[2].utxo.derivationIndex":"number","$[2].rgbAllocations":"array","$[2].rgbAllocations[0]":"object","$[2].rgbAllocations[0].assetId":"string","$[2].rgbAllocations[0].assignment":"object","$[2].rgbAllocations[0].assignment.Fungible":"bigint","$[2].rgbAllocations[0].settled":"boolean","$[2].pendingBlinded":"number","$[3]":"object","$[3].utxo":"object","$[3].utxo.outpoint":"object","$[3].utxo.outpoint.txid":"string","$[3].utxo.outpoint.vout":"number","$[3].utxo.btcAmount":"bigint","$[3].utxo.colorable":"boolean","$[3].utxo.exists":"boolean","$[3].utxo.derivationIndex":"number","$[3].rgbAllocations":"array","$[3].pendingBlinded":"number","$[4]":"object","$[4].utxo":"object","$[4].utxo.outpoint":"object","$[4].utxo.outpoint.txid":"string","$[4].utxo.outpoint.vout":"number","$[4].utxo.btcAmount":"bigint","$[4].utxo.colorable":"boolean","$[4].utxo.exists":"boolean","$[4].utxo.derivationIndex":"number","$[4].rgbAllocations":"array","$[4].pendingBlinded":"number","$[5]":"object","$[5].utxo":"object","$[5].utxo.outpoint":"object","$[5].utxo.outpoint.txid":"string","$[5].utxo.outpoint.vout":"number","$[5].utxo.btcAmount":"bigint","$[5].utxo.colorable":"boolean","$[5].utxo.exists":"boolean","$[5].utxo.derivationIndex":"number","$[5].rgbAllocations":"array","$[5].pendingBlinded":"number","$[6]":"object","$[6].utxo":"object","$[6].utxo.outpoint":"object","$[6].utxo.outpoint.txid":"string","$[6].utxo.outpoint.vout":"number","$[6].utxo.btcAmount":"bigint","$[6].utxo.colorable":"boolean","$[6].utxo.exists":"boolean","$[6].utxo.derivationIndex":"number","$[6].rgbAllocations":"array","$[6].rgbAllocations[0]":"object","$[6].rgbAllocations[0].assetId":"string","$[6].rgbAllocations[0].assignment":"object","$[6].rgbAllocations[0].assignment.InflationRight":"bigint","$[6].rgbAllocations[0].settled":"boolean","$[6].pendingBlinded":"number","$[7]":"object","$[7].utxo":"object","$[7].utxo.outpoint":"object","$[7].utxo.outpoint.txid":"string","$[7].utxo.outpoint.vout":"number","$[7].utxo.btcAmount":"bigint","$[7].utxo.colorable":"boolean","$[7].utxo.exists":"boolean","$[7].utxo.derivationIndex":"number","$[7].rgbAllocations":"array","$[7].rgbAllocations[0]":"object","$[7].rgbAllocations[0].assetId":"string","$[7].rgbAllocations[0].assignment":"object","$[7].rgbAllocations[0].assignment.Fungible":"bigint","$[7].rgbAllocations[0].settled":"boolean","$[7].pendingBlinded":"number","$[8]":"object","$[8].utxo":"object","$[8].utxo.outpoint":"object","$[8].utxo.outpoint.txid":"string","$[8].utxo.outpoint.vout":"number","$[8].utxo.btcAmount":"bigint","$[8].utxo.colorable":"boolean","$[8].utxo.exists":"boolean","$[8].utxo.derivationIndex":"number","$[8].rgbAllocations":"array","$[8].rgbAllocations[0]":"object","$[8].rgbAllocations[0].assetId":"string","$[8].rgbAllocations[0].assignment":"object","$[8].rgbAllocations[0].assignment.InflationRight":"bigint","$[8].rgbAllocations[0].settled":"boolean","$[8].pendingBlinded":"number","$[9]":"object","$[9].utxo":"object","$[9].utxo.outpoint":"object","$[9].utxo.outpoint.txid":"string","$[9].utxo.outpoint.vout":"number","$[9].utxo.btcAmount":"bigint","$[9].utxo.colorable":"boolean","$[9].utxo.exists":"boolean","$[9].utxo.derivationIndex":"number","$[9].rgbAllocations":"array","$[9].pendingBlinded":"number"},
    value: [
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 7,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 0,
        },
        rgbAllocations: [
          {
            assetId: "rgb:cbWkA8nC-~OCjkGA-qb3wll4-YTqCa_b-PmAxlEG-2qvBl7c",
            assignment: {
              Fungible: 1000n,
            },
            settled: true,
          },
        ],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 3,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 1,
        },
        rgbAllocations: [
          {
            assetId: "rgb:cbWkA8nC-~OCjkGA-qb3wll4-YTqCa_b-PmAxlEG-2qvBl7c",
            assignment: {
              Fungible: 500n,
            },
            settled: true,
          },
        ],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 5,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 2,
        },
        rgbAllocations: [
          {
            assetId: "rgb:vSFSawOt-09avgLm-eUp5mBd-r38gOtI-8WZtlGn-5IMHo~4",
            assignment: {
              Fungible: 500n,
            },
            settled: true,
          },
        ],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 2,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 4,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 0,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 5,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 4,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 6,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "e092c2db342da26afade11621f60953d0e7d638b2505313eb66726e962accec1",
            vout: 2,
          },
          btcAmount: 489n,
          colorable: true,
          exists: true,
          derivationIndex: 10,
        },
        rgbAllocations: [
          {
            assetId: "rgb:vSFSawOt-09avgLm-eUp5mBd-r38gOtI-8WZtlGn-5IMHo~4",
            assignment: {
              InflationRight: 300n,
            },
            settled: false,
          },
        ],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "e092c2db342da26afade11621f60953d0e7d638b2505313eb66726e962accec1",
            vout: 1,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 8,
        },
        rgbAllocations: [
          {
            assetId: "rgb:vSFSawOt-09avgLm-eUp5mBd-r38gOtI-8WZtlGn-5IMHo~4",
            assignment: {
              Fungible: 200n,
            },
            settled: false,
          },
        ],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 8,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 3,
        },
        rgbAllocations: [
          {
            assetId: "rgb:vSFSawOt-09avgLm-eUp5mBd-r38gOtI-8WZtlGn-5IMHo~4",
            assignment: {
              InflationRight: 500n,
            },
            settled: true,
          },
        ],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
            vout: 6,
          },
          btcAmount: 99991089n,
          colorable: false,
          exists: true,
          derivationIndex: 0,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
    ],
  },
  {
    label: "receiver: settled receives",
    types: {"$":"array","$[0]":"object","$[0].utxo":"object","$[0].utxo.outpoint":"object","$[0].utxo.outpoint.txid":"string","$[0].utxo.outpoint.vout":"number","$[0].utxo.btcAmount":"bigint","$[0].utxo.colorable":"boolean","$[0].utxo.exists":"boolean","$[0].utxo.derivationIndex":"number","$[0].rgbAllocations":"array","$[0].rgbAllocations[0]":"object","$[0].rgbAllocations[0].assetId":"string","$[0].rgbAllocations[0].assignment":"object","$[0].rgbAllocations[0].assignment.Fungible":"bigint","$[0].rgbAllocations[0].settled":"boolean","$[0].pendingBlinded":"number","$[1]":"object","$[1].utxo":"object","$[1].utxo.outpoint":"object","$[1].utxo.outpoint.txid":"string","$[1].utxo.outpoint.vout":"number","$[1].utxo.btcAmount":"bigint","$[1].utxo.colorable":"boolean","$[1].utxo.exists":"boolean","$[1].utxo.derivationIndex":"number","$[1].rgbAllocations":"array","$[1].pendingBlinded":"number","$[2]":"object","$[2].utxo":"object","$[2].utxo.outpoint":"object","$[2].utxo.outpoint.txid":"string","$[2].utxo.outpoint.vout":"number","$[2].utxo.btcAmount":"bigint","$[2].utxo.colorable":"boolean","$[2].utxo.exists":"boolean","$[2].utxo.derivationIndex":"number","$[2].rgbAllocations":"array","$[2].pendingBlinded":"number","$[3]":"object","$[3].utxo":"object","$[3].utxo.outpoint":"object","$[3].utxo.outpoint.txid":"string","$[3].utxo.outpoint.vout":"number","$[3].utxo.btcAmount":"bigint","$[3].utxo.colorable":"boolean","$[3].utxo.exists":"boolean","$[3].utxo.derivationIndex":"number","$[3].rgbAllocations":"array","$[3].pendingBlinded":"number","$[4]":"object","$[4].utxo":"object","$[4].utxo.outpoint":"object","$[4].utxo.outpoint.txid":"string","$[4].utxo.outpoint.vout":"number","$[4].utxo.btcAmount":"bigint","$[4].utxo.colorable":"boolean","$[4].utxo.exists":"boolean","$[4].utxo.derivationIndex":"number","$[4].rgbAllocations":"array","$[4].pendingBlinded":"number","$[5]":"object","$[5].utxo":"object","$[5].utxo.outpoint":"object","$[5].utxo.outpoint.txid":"string","$[5].utxo.outpoint.vout":"number","$[5].utxo.btcAmount":"bigint","$[5].utxo.colorable":"boolean","$[5].utxo.exists":"boolean","$[5].utxo.derivationIndex":"number","$[5].rgbAllocations":"array","$[5].pendingBlinded":"number","$[6]":"object","$[6].utxo":"object","$[6].utxo.outpoint":"object","$[6].utxo.outpoint.txid":"string","$[6].utxo.outpoint.vout":"number","$[6].utxo.btcAmount":"bigint","$[6].utxo.colorable":"boolean","$[6].utxo.exists":"boolean","$[6].utxo.derivationIndex":"number","$[6].rgbAllocations":"array","$[6].pendingBlinded":"number","$[7]":"object","$[7].utxo":"object","$[7].utxo.outpoint":"object","$[7].utxo.outpoint.txid":"string","$[7].utxo.outpoint.vout":"number","$[7].utxo.btcAmount":"bigint","$[7].utxo.colorable":"boolean","$[7].utxo.exists":"boolean","$[7].utxo.derivationIndex":"number","$[7].rgbAllocations":"array","$[7].pendingBlinded":"number","$[8]":"object","$[8].utxo":"object","$[8].utxo.outpoint":"object","$[8].utxo.outpoint.txid":"string","$[8].utxo.outpoint.vout":"number","$[8].utxo.btcAmount":"bigint","$[8].utxo.colorable":"boolean","$[8].utxo.exists":"boolean","$[8].utxo.derivationIndex":"number","$[8].rgbAllocations":"array","$[8].rgbAllocations[0]":"object","$[8].rgbAllocations[0].assetId":"string","$[8].rgbAllocations[0].assignment":"object","$[8].rgbAllocations[0].assignment.Fungible":"bigint","$[8].rgbAllocations[0].settled":"boolean","$[8].pendingBlinded":"number","$[9]":"object","$[9].utxo":"object","$[9].utxo.outpoint":"object","$[9].utxo.outpoint.txid":"string","$[9].utxo.outpoint.vout":"number","$[9].utxo.btcAmount":"bigint","$[9].utxo.colorable":"boolean","$[9].utxo.exists":"boolean","$[9].utxo.derivationIndex":"number","$[9].rgbAllocations":"array","$[9].pendingBlinded":"number"},
    value: [
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 7,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 0,
        },
        rgbAllocations: [
          {
            assetId: "rgb:cbWkA8nC-~OCjkGA-qb3wll4-YTqCa_b-PmAxlEG-2qvBl7c",
            assignment: {
              Fungible: 100n,
            },
            settled: true,
          },
        ],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 2,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 1,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 8,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 2,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 3,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 3,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 1,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 4,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 6,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 5,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 4,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 6,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 0,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 7,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "42dbf8b47ef1a13f2618d73c154e839adbb9f075f6e4256bcde00fea62f214f4",
            vout: 1,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 8,
        },
        rgbAllocations: [
          {
            assetId: "rgb:cbWkA8nC-~OCjkGA-qb3wll4-YTqCa_b-PmAxlEG-2qvBl7c",
            assignment: {
              Fungible: 50n,
            },
            settled: true,
          },
        ],
        pendingBlinded: 0,
      },
      {
        utxo: {
          outpoint: {
            txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
            vout: 5,
          },
          btcAmount: 99991089n,
          colorable: false,
          exists: true,
          derivationIndex: 1,
        },
        rgbAllocations: [],
        pendingBlinded: 0,
      },
    ],
  },
];
