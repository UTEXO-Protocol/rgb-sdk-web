// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "getBtcBalance"
};

export const samples = [
  {
    label: "sender: empty wallet",
    types: {"$":"object","$.vanilla":"object","$.vanilla.settled":"bigint","$.vanilla.future":"bigint","$.vanilla.spendable":"bigint","$.colored":"object","$.colored.settled":"bigint","$.colored.future":"bigint","$.colored.spendable":"bigint"},
    value: {
      vanilla: {
        settled: 0n,
        future: 0n,
        spendable: 0n,
      },
      colored: {
        settled: 0n,
        future: 0n,
        spendable: 0n,
      },
    },
  },
  {
    label: "sender: funded, colorable UTXOs",
    types: {"$":"object","$.vanilla":"object","$.vanilla.settled":"bigint","$.vanilla.future":"bigint","$.vanilla.spendable":"bigint","$.colored":"object","$.colored.settled":"bigint","$.colored.future":"bigint","$.colored.spendable":"bigint"},
    value: {
      vanilla: {
        settled: 99991089n,
        future: 99991089n,
        spendable: 99991089n,
      },
      colored: {
        settled: 8000n,
        future: 8000n,
        spendable: 8000n,
      },
    },
  },
  {
    label: "receiver: after BTC receive",
    types: {"$":"object","$.vanilla":"object","$.vanilla.settled":"bigint","$.vanilla.future":"bigint","$.vanilla.spendable":"bigint","$.colored":"object","$.colored.settled":"bigint","$.colored.future":"bigint","$.colored.spendable":"bigint"},
    value: {
      vanilla: {
        settled: 100001089n,
        future: 100001089n,
        spendable: 100001089n,
      },
      colored: {
        settled: 9000n,
        future: 9000n,
        spendable: 9000n,
      },
    },
  },
];
