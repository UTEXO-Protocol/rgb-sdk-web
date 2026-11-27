// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "getAssetBalance"
};

export const samples = [
  {
    label: "sender: with NIA and IFA",
    types: {"$":"object","$.settled":"bigint","$.future":"bigint","$.spendable":"bigint"},
    value: {
      settled: 1500n,
      future: 1500n,
      spendable: 1500n,
    },
  },
  {
    label: "sender: settled sends",
    types: {"$":"object","$.settled":"bigint","$.future":"bigint","$.spendable":"bigint"},
    value: {
      settled: 1350n,
      future: 1350n,
      spendable: 1350n,
    },
  },
  {
    label: "receiver: settled receives",
    types: {"$":"object","$.settled":"bigint","$.future":"bigint","$.spendable":"bigint"},
    value: {
      settled: 150n,
      future: 150n,
      spendable: 150n,
    },
  },
];
