// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "issueAssetIfa"
};

export const samples = [
  {
    label: "sender: issue IFA",
    types: {"$":"object","$.assetId":"string","$.ticker":"string","$.name":"string","$.details":"undefined","$.precision":"number","$.initialSupply":"bigint","$.maxSupply":"bigint","$.knownCirculatingSupply":"bigint","$.timestamp":"bigint","$.addedAt":"bigint","$.balance":"object","$.balance.settled":"bigint","$.balance.future":"bigint","$.balance.spendable":"bigint","$.media":"undefined","$.rejectList":"undefined"},
    value: {
      assetId: "rgb:vSFSawOt-09avgLm-eUp5mBd-r38gOtI-8WZtlGn-5IMHo~4",
      ticker: "CAPI",
      name: "Capture IFA",
      details: undefined,
      precision: 0,
      initialSupply: 500n,
      maxSupply: 1000n,
      knownCirculatingSupply: 500n,
      timestamp: 1795780650n,
      addedAt: 1795780650n,
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
