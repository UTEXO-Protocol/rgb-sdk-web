// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "issueAssetIfa"
};

export const samples = [
  {
    label: "sender: issue IFA",
    types: {"$":"object","$.assetId":"string","$.ticker":"string","$.name":"string","$.details":"undefined","$.precision":"number","$.initialSupply":"bigint","$.maxSupply":"bigint","$.knownCirculatingSupply":"bigint","$.timestamp":"bigint","$.addedAt":"bigint","$.balance":"object","$.balance.settled":"bigint","$.balance.future":"bigint","$.balance.spendable":"bigint","$.media":"undefined","$.rejectList":"undefined"},
    value: {
      assetId: "rgb:xNu5Iyai-5Zxk9x3-4XNbghw-FP914rV-JC9fKHJ-3azZNGQ",
      ticker: "CAPI",
      name: "Capture IFA",
      details: undefined,
      precision: 0,
      initialSupply: 500n,
      maxSupply: 1000n,
      knownCirculatingSupply: 500n,
      timestamp: 1795604112n,
      addedAt: 1795604112n,
      balance: {
        settled: 500n,
        future: 500n,
        spendable: 500n,
      },
      media: undefined,
      rejectList: undefined,
    },
  },
];
