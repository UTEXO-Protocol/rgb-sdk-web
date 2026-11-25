// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
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
        txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 3796,
          timestamp: 1795604106n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "b104cf75db44d1e0ad387ca0a74b00441c82010fb966714131060f3f106a6320",
        received: 100000000n,
        sent: 0n,
        fee: 703n,
        confirmationTime: {
          height: 3793,
          timestamp: 1795604100n,
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
        txid: "714e221ebe23a6ed62c9396e6961a6b94041e21a55f843b09b5844c29e1152de",
        received: 489n,
        sent: 2000n,
        fee: 511n,
        confirmationTime: {
          height: 3805,
          timestamp: 1795604126n,
        },
        pending: false,
      },
      {
        transactionType: "CreateUtxos",
        txid: "b31a19aba45a1e54e6ed9a96fc0efbff3e7cb6e371115484128ac3ef19ab1ee4",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 3796,
          timestamp: 1795604106n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "b104cf75db44d1e0ad387ca0a74b00441c82010fb966714131060f3f106a6320",
        received: 100000000n,
        sent: 0n,
        fee: 703n,
        confirmationTime: {
          height: 3793,
          timestamp: 1795604100n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "56e2ecce36b804eab41ab01549f9a6078328c3ecd976194c5361e287aba43545",
        received: 691n,
        sent: 1000n,
        fee: 309n,
        confirmationTime: {
          height: 3805,
          timestamp: 1795604126n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "4906ad6134633a1d13e29c997cee8d5771a010bdd262221d7513c25c77b3ac7c",
        received: 1489n,
        sent: 2000n,
        fee: 511n,
        confirmationTime: {
          height: 3801,
          timestamp: 1795604116n,
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
        txid: "b1f43469d7e5ee2b385deb57a777345001f7c9050886fcbee94abd743b263779",
        received: 10000n,
        sent: 0n,
        fee: 309n,
        confirmationTime: {
          height: 3816,
          timestamp: 1795604152n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "714e221ebe23a6ed62c9396e6961a6b94041e21a55f843b09b5844c29e1152de",
        received: 1000n,
        sent: 0n,
        fee: 511n,
        confirmationTime: {
          height: 3805,
          timestamp: 1795604126n,
        },
        pending: false,
      },
      {
        transactionType: "CreateUtxos",
        txid: "9430f8aa2dc20b41060a05f99a3be0eda1e4d2f0eac7de4675c47033b058061a",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 3801,
          timestamp: 1795604116n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "cc724388b040e78ca24edd564f97c98e1527a98378c078f6bdd474f97df8cc9e",
        received: 100000000n,
        sent: 0n,
        fee: 547n,
        confirmationTime: {
          height: 3799,
          timestamp: 1795604112n,
        },
        pending: false,
      },
    ],
  },
];
