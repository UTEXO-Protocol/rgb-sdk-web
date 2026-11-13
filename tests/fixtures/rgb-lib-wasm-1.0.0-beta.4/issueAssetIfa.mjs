// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "issueAssetIfa"
};

export const samples = [
  {
    label: "sender: issue IFA",
    types: {"$":"object","$.assetId":"string","$.ticker":"string","$.name":"string","$.details":"undefined","$.precision":"number","$.initialSupply":"bigint","$.maxSupply":"bigint","$.knownCirculatingSupply":"bigint","$.timestamp":"bigint","$.addedAt":"bigint","$.balance":"object","$.balance.settled":"bigint","$.balance.future":"bigint","$.balance.spendable":"bigint","$.media":"undefined","$.rejectListUrl":"undefined"},
    value: {
      assetId: "rgb:K0cOwU~O-pNE3dtY-SscYX7v-lD9fEL3-AimDJAz-PpxkYQE",
      ticker: "CAPI",
      name: "Capture IFA",
      details: undefined,
      precision: 0,
      initialSupply: 500n,
      maxSupply: 1000n,
      knownCirculatingSupply: 500n,
      timestamp: 1794395080n,
      addedAt: 1794395080n,
      balance: {
        settled: 500n,
        future: 500n,
        spendable: 500n,
      },
      media: undefined,
      rejectListUrl: undefined,
    },
  },
];
