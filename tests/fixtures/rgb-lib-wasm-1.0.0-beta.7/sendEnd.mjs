// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "sendEnd"
};

export const samples = [
  {
    label: "sender: send to blinded",
    types: {"$":"object","$.txid":"string","$.batchTransferIdx":"number","$.entropy":"bigint"},
    value: {
      txid: "7f0afc8d655119a919fe219ff873e847fbe102ad8bfda4ace3c07b998b2991e5",
      batchTransferIdx: 4,
      entropy: 10691569633716481794n,
    },
  },
  {
    label: "sender: send to witness",
    types: {"$":"object","$.txid":"string","$.batchTransferIdx":"number","$.entropy":"bigint"},
    value: {
      txid: "42dbf8b47ef1a13f2618d73c154e839adbb9f075f6e4256bcde00fea62f214f4",
      batchTransferIdx: 5,
      entropy: 18103771470371243307n,
    },
  },
];
