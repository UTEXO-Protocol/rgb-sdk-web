// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
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
        txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 259,
          timestamp: 1795780650n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "e02a21718d77c1a4daf61095881cd1b1b123b1e610dd63436181b045a56d2f75",
        received: 100000000n,
        sent: 0n,
        fee: 900n,
        confirmationTime: {
          height: 258,
          timestamp: 1795780648n,
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
        txid: "42dbf8b47ef1a13f2618d73c154e839adbb9f075f6e4256bcde00fea62f214f4",
        received: 489n,
        sent: 2000n,
        fee: 511n,
        confirmationTime: {
          height: 263,
          timestamp: 1795780655n,
        },
        pending: false,
      },
      {
        transactionType: "CreateUtxos",
        txid: "a6150b0de9ff8477dce41bf7eda6a61350a73e869ccefd580db1d8f77f852882",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 259,
          timestamp: 1795780650n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "e02a21718d77c1a4daf61095881cd1b1b123b1e610dd63436181b045a56d2f75",
        received: 100000000n,
        sent: 0n,
        fee: 900n,
        confirmationTime: {
          height: 258,
          timestamp: 1795780648n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "7f0afc8d655119a919fe219ff873e847fbe102ad8bfda4ace3c07b998b2991e5",
        received: 691n,
        sent: 1000n,
        fee: 309n,
        confirmationTime: {
          height: 263,
          timestamp: 1795780655n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "e092c2db342da26afade11621f60953d0e7d638b2505313eb66726e962accec1",
        received: 1489n,
        sent: 2000n,
        fee: 511n,
        confirmationTime: {
          height: 261,
          timestamp: 1795780652n,
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
        txid: "4c262e9e5852d9b4657416690d38e94aec7978fe4eae0554abbb64dbc0f3cbfd",
        received: 10000n,
        sent: 0n,
        fee: 309n,
        confirmationTime: {
          height: 264,
          timestamp: 1795780657n,
        },
        pending: false,
      },
      {
        transactionType: "RgbSend",
        txid: "42dbf8b47ef1a13f2618d73c154e839adbb9f075f6e4256bcde00fea62f214f4",
        received: 1000n,
        sent: 0n,
        fee: 511n,
        confirmationTime: {
          height: 263,
          timestamp: 1795780655n,
        },
        pending: false,
      },
      {
        transactionType: "CreateUtxos",
        txid: "f5aebb544bb33ed1dbdd8b0ec5e358bccd5982ac4637cc35c8a8654ec19f8172",
        received: 99999089n,
        sent: 100000000n,
        fee: 911n,
        confirmationTime: {
          height: 263,
          timestamp: 1795780655n,
        },
        pending: false,
      },
      {
        transactionType: "Incoming",
        txid: "61eae09d01cea5cb616287de1f34d9eb41bb922ac34e41c129c2c26658969af4",
        received: 100000000n,
        sent: 0n,
        fee: 696n,
        confirmationTime: {
          height: 260,
          timestamp: 1795780650n,
        },
        pending: false,
      },
    ],
  },
];
