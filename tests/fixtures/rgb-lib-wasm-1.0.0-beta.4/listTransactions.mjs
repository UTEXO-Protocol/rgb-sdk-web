// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "listTransactions"
};

export const samples = [
  {
    label: "sender: empty wallet",
    types: {"$":"array"},
    value: [],
  },
  {
    label: "sender: funded, colorable UTXOs",
    types: {"$":"array","$[0]":"object","$[0].transactionType":"string","$[0].txid":"string","$[0].received":"bigint","$[0].sent":"bigint","$[0].fee":"bigint","$[0].confirmationTime":"object","$[0].confirmationTime.height":"number","$[0].confirmationTime.timestamp":"bigint","$[0].pending":"boolean","$[1]":"object","$[1].transactionType":"string","$[1].txid":"string","$[1].received":"bigint","$[1].sent":"bigint","$[1].fee":"bigint","$[1].confirmationTime":"object","$[1].confirmationTime.height":"number","$[1].confirmationTime.timestamp":"bigint","$[1].pending":"boolean"},
    value: [
      {
        transactionType: "CreateUtxos",
        txid: "008103901c08ff2c5f1c478b904d754e3a44fb1a460ea6ad6abd82dd8e240263",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 863,
          timestamp: 1794395069n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "2ddf29142fd8404dcbcc729904a20b2cfdcadc9eea62f17e322b62195c86fe08",
        received: 100000000n,
        sent: 0n,
        fee: 331n,
        confirmationTime: {
          height: 862,
          timestamp: 1794395068n,
        },
        pending: false,
      },
    ],
  },
  {
    label: "sender: settled sends",
    types: {"$":"array","$[0]":"object","$[0].transactionType":"string","$[0].txid":"string","$[0].received":"bigint","$[0].sent":"bigint","$[0].fee":"bigint","$[0].confirmationTime":"object","$[0].confirmationTime.height":"number","$[0].confirmationTime.timestamp":"bigint","$[0].pending":"boolean","$[1]":"object","$[1].transactionType":"string","$[1].txid":"string","$[1].received":"bigint","$[1].sent":"bigint","$[1].fee":"bigint","$[1].confirmationTime":"object","$[1].confirmationTime.height":"number","$[1].confirmationTime.timestamp":"bigint","$[1].pending":"boolean","$[2]":"object","$[2].transactionType":"string","$[2].txid":"string","$[2].received":"bigint","$[2].sent":"bigint","$[2].fee":"bigint","$[2].confirmationTime":"object","$[2].confirmationTime.height":"number","$[2].confirmationTime.timestamp":"bigint","$[2].pending":"boolean","$[3]":"object","$[3].transactionType":"string","$[3].txid":"string","$[3].received":"bigint","$[3].sent":"bigint","$[3].fee":"bigint","$[3].confirmationTime":"object","$[3].confirmationTime.height":"number","$[3].confirmationTime.timestamp":"bigint","$[3].pending":"boolean","$[4]":"object","$[4].transactionType":"string","$[4].txid":"string","$[4].received":"bigint","$[4].sent":"bigint","$[4].fee":"bigint","$[4].confirmationTime":"object","$[4].confirmationTime.height":"number","$[4].confirmationTime.timestamp":"bigint","$[4].pending":"boolean"},
    value: [
      {
        transactionType: "RgbSend",
        txid: "7c663454e06761e8249930ec7c6f8ba39890f0f2af13ef3742fb24a16397e09e",
        received: 691n,
        sent: 1000n,
        fee: 309n,
        confirmationTime: {
          height: 875,
          timestamp: 1794395096n,
        },
        pending: false,
      },
      {
        transactionType: "CreateUtxos",
        txid: "008103901c08ff2c5f1c478b904d754e3a44fb1a460ea6ad6abd82dd8e240263",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 863,
          timestamp: 1794395069n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "2ddf29142fd8404dcbcc729904a20b2cfdcadc9eea62f17e322b62195c86fe08",
        received: 100000000n,
        sent: 0n,
        fee: 331n,
        confirmationTime: {
          height: 862,
          timestamp: 1794395068n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "8424f881091192d6d69576cd5eb8eb9cb7cd089c7a248019dc89d28b8f21a30f",
        received: 489n,
        sent: 2000n,
        fee: 511n,
        confirmationTime: {
          height: 875,
          timestamp: 1794395096n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "c80e82b3854f66a1b3bfc09941b84dcca8830218664857ed14f2532197a2a2c6",
        received: 1489n,
        sent: 2000n,
        fee: 511n,
        confirmationTime: {
          height: 869,
          timestamp: 1794395082n,
        },
        pending: false,
      },
    ],
  },
  {
    label: "receiver: after BTC receive",
    types: {"$":"array","$[0]":"object","$[0].transactionType":"string","$[0].txid":"string","$[0].received":"bigint","$[0].sent":"bigint","$[0].fee":"bigint","$[0].confirmationTime":"object","$[0].confirmationTime.height":"number","$[0].confirmationTime.timestamp":"bigint","$[0].pending":"boolean","$[1]":"object","$[1].transactionType":"string","$[1].txid":"string","$[1].received":"bigint","$[1].sent":"bigint","$[1].fee":"bigint","$[1].confirmationTime":"object","$[1].confirmationTime.height":"number","$[1].confirmationTime.timestamp":"bigint","$[1].pending":"boolean","$[2]":"object","$[2].transactionType":"string","$[2].txid":"string","$[2].received":"bigint","$[2].sent":"bigint","$[2].fee":"bigint","$[2].confirmationTime":"object","$[2].confirmationTime.height":"number","$[2].confirmationTime.timestamp":"bigint","$[2].pending":"boolean","$[3]":"object","$[3].transactionType":"string","$[3].txid":"string","$[3].received":"bigint","$[3].sent":"bigint","$[3].fee":"bigint","$[3].confirmationTime":"object","$[3].confirmationTime.height":"number","$[3].confirmationTime.timestamp":"bigint","$[3].pending":"boolean"},
    value: [
      {
        transactionType: "Incoming",
        txid: "e9a38b6089d9dfcce4b16e6aef57974c45f1bfc659016df5992f1cd58b28b021",
        received: 10000n,
        sent: 0n,
        fee: 309n,
        confirmationTime: {
          height: 885,
          timestamp: 1794395120n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "8424f881091192d6d69576cd5eb8eb9cb7cd089c7a248019dc89d28b8f21a30f",
        received: 1000n,
        sent: 0n,
        fee: 511n,
        confirmationTime: {
          height: 875,
          timestamp: 1794395096n,
        },
        pending: false,
      },
      {
        transactionType: "CreateUtxos",
        txid: "79558fa7c4be3fd5789b3a7d7320cb1a3f10ae117b9240f901da172ebc1c5e64",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 869,
          timestamp: 1794395082n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "bef79733c3baac52b0cf50d28f410a8885c3625c87e8f00e53ad1b3172b08042",
        received: 100000000n,
        sent: 0n,
        fee: 426n,
        confirmationTime: {
          height: 868,
          timestamp: 1794395080n,
        },
        pending: false,
      },
    ],
  },
];
