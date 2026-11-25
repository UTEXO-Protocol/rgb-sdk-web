// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
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
