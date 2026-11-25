// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "sendEnd"
};

export const samples = [
  {
    label: "sender: send to blinded",
    types: {"$":"object","$.txid":"string","$.batchTransferIdx":"number","$.entropy":"bigint"},
    value: {
      txid: "56e2ecce36b804eab41ab01549f9a6078328c3ecd976194c5361e287aba43545",
      batchTransferIdx: 4,
      entropy: 14703011408373261375n,
    },
  },
  {
    label: "sender: send to witness",
    types: {"$":"object","$.txid":"string","$.batchTransferIdx":"number","$.entropy":"bigint"},
    value: {
      txid: "714e221ebe23a6ed62c9396e6961a6b94041e21a55f843b09b5844c29e1152de",
      batchTransferIdx: 5,
      entropy: 8437817733854865375n,
    },
  },
];
