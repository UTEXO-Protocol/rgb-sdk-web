// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
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
