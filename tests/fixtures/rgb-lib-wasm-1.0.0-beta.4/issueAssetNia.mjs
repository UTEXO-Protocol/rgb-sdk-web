// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "issueAssetNia"
};

export const samples = [
  {
    label: "sender: issue NIA",
    types: {"$":"object","$.assetId":"string","$.ticker":"string","$.name":"string","$.details":"undefined","$.precision":"number","$.issuedSupply":"bigint","$.timestamp":"bigint","$.addedAt":"bigint","$.balance":"object","$.balance.settled":"bigint","$.balance.future":"bigint","$.balance.spendable":"bigint","$.media":"undefined"},
    value: {
      assetId: "rgb:lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ",
      ticker: "CAPN",
      name: "Capture NIA",
      details: undefined,
      precision: 2,
      issuedSupply: 1500n,
      timestamp: 1794395080n,
      addedAt: 1794395080n,
      balance: {
        settled: 1500n,
        future: 1500n,
        spendable: 1500n,
      },
      media: undefined,
    },
  },
];
