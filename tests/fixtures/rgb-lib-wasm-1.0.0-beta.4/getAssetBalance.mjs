// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
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
