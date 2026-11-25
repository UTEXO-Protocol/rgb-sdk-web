// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 2,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 8,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 1,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 5,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 4,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 3,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 6,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 7,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 2,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 0,
        },
        rgbAllocations: [
          {
            assetId: "rgb:gLCaYxOO-HLmEdjX-5o_TO5Y-Nk8ouV7-z2ceASz-0I4SBP0",
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 8,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 1,
        },
        rgbAllocations: [
          {
            assetId: "rgb:gLCaYxOO-HLmEdjX-5o_TO5Y-Nk8ouV7-z2ceASz-0I4SBP0",
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 1,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 2,
        },
        rgbAllocations: [
          {
            assetId: "rgb:xNu5Iyai-5Zxk9x3-4XNbghw-FP914rV-JC9fKHJ-3azZNGQ",
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 4,
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 3,
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
            txid: "4906ad6134633a1d13e29c997cee8d5771a010bdd262221d7513c25c77b3ac7c",
            vout: 2,
          },
          btcAmount: 489n,
          colorable: true,
          exists: true,
          derivationIndex: 10,
        },
        rgbAllocations: [
          {
            assetId: "rgb:xNu5Iyai-5Zxk9x3-4XNbghw-FP914rV-JC9fKHJ-3azZNGQ",
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
            txid: "4906ad6134633a1d13e29c997cee8d5771a010bdd262221d7513c25c77b3ac7c",
            vout: 1,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 8,
        },
        rgbAllocations: [
          {
            assetId: "rgb:xNu5Iyai-5Zxk9x3-4XNbghw-FP914rV-JC9fKHJ-3azZNGQ",
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 5,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 3,
        },
        rgbAllocations: [
          {
            assetId: "rgb:xNu5Iyai-5Zxk9x3-4XNbghw-FP914rV-JC9fKHJ-3azZNGQ",
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
            txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
            vout: 7,
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
            vout: 4,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 0,
        },
        rgbAllocations: [
          {
            assetId: "rgb:gLCaYxOO-HLmEdjX-5o_TO5Y-Nk8ouV7-z2ceASz-0I4SBP0",
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
            vout: 1,
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
            vout: 0,
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
            vout: 7,
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
            vout: 3,
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
            vout: 5,
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
            vout: 2,
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
            txid: "714e221ebe23a6ed62c9396e6961a6b94041e21a55f843b09b5844c29e1152de",
            vout: 1,
          },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
          derivationIndex: 8,
        },
        rgbAllocations: [
          {
            assetId: "rgb:gLCaYxOO-HLmEdjX-5o_TO5Y-Nk8ouV7-z2ceASz-0I4SBP0",
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
            txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
            vout: 8,
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
