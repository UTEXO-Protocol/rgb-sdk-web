// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "sendEnd"
};

export const samples = [
  {
    label: "sender: send to blinded",
    types: {"$":"object","$.txid":"string","$.batchTransferIdx":"number","$.entropy":"bigint"},
    value: {
      txid: "7c663454e06761e8249930ec7c6f8ba39890f0f2af13ef3742fb24a16397e09e",
      batchTransferIdx: 4,
      entropy: 7134093972748089549n,
    },
  },
  {
    label: "sender: send to witness",
    types: {"$":"object","$.txid":"string","$.batchTransferIdx":"number","$.entropy":"bigint"},
    value: {
      txid: "8424f881091192d6d69576cd5eb8eb9cb7cd089c7a248019dc89d28b8f21a30f",
      batchTransferIdx: 5,
      entropy: 4461084636399270212n,
    },
  },
];
