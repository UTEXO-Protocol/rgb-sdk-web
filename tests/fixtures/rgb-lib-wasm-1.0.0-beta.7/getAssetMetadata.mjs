// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "getAssetMetadata"
};

export const samples = [
  {
    label: "sender: with NIA and IFA",
    types: {"$":"object","$.assetSchema":"string","$.initialSupply":"bigint","$.maxSupply":"bigint","$.knownCirculatingSupply":"bigint","$.timestamp":"bigint","$.name":"string","$.precision":"number","$.ticker":"string","$.details":"undefined","$.bridgeLocation":"undefined","$.rejectList":"undefined","$.linkedFromContract":"undefined","$.linkedToContract":"undefined"},
    value: {
      assetSchema: "Nia",
      initialSupply: 1500n,
      maxSupply: 1500n,
      knownCirculatingSupply: 1500n,
      timestamp: 1795780650n,
      name: "Capture NIA",
      precision: 2,
      ticker: "CAPN",
      details: undefined,
      bridgeLocation: undefined,
      rejectList: undefined,
      linkedFromContract: undefined,
      linkedToContract: undefined,
    },
  },
  {
    label: "sender: with NIA and IFA",
    types: {"$":"object","$.assetSchema":"string","$.initialSupply":"bigint","$.maxSupply":"bigint","$.knownCirculatingSupply":"bigint","$.timestamp":"bigint","$.name":"string","$.precision":"number","$.ticker":"string","$.details":"undefined","$.bridgeLocation":"undefined","$.rejectList":"undefined","$.linkedFromContract":"undefined","$.linkedToContract":"undefined"},
    value: {
      assetSchema: "Ifa",
      initialSupply: 500n,
      maxSupply: 1000n,
      knownCirculatingSupply: 700n,
      timestamp: 1795780650n,
      name: "Capture IFA",
      precision: 0,
      ticker: "CAPI",
      details: undefined,
      bridgeLocation: undefined,
      rejectList: undefined,
      linkedFromContract: undefined,
      linkedToContract: undefined,
    },
  },
];
