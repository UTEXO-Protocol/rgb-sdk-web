// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "issueAssetNia"
};

export const samples = [
  {
    label: "sender: issue NIA",
    types: {"$":"object","$.assetId":"string","$.ticker":"string","$.name":"string","$.details":"undefined","$.precision":"number","$.issuedSupply":"bigint","$.timestamp":"bigint","$.addedAt":"bigint","$.balance":"object","$.balance.settled":"bigint","$.balance.future":"bigint","$.balance.spendable":"bigint","$.media":"undefined"},
    value: {
      assetId: "rgb:cbWkA8nC-~OCjkGA-qb3wll4-YTqCa_b-PmAxlEG-2qvBl7c",
      ticker: "CAPN",
      name: "Capture NIA",
      details: undefined,
      precision: 2,
      issuedSupply: 1500n,
      timestamp: 1795780650n,
      addedAt: 1795780650n,
      balance: {
        settled: 1500n,
        future: 1500n,
        spendable: 1500n,
      },
      media: undefined,
    },
  },
];
