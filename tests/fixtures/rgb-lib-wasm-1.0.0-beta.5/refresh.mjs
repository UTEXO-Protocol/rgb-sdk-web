// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "refresh"
};

export const samples = [
  {
    label: "sender: settling",
    types: {"$":"map","$<0>":"number","${0}":"object","${0}.updatedStatus":"string","${0}.failure":"undefined","$<1>":"number","${1}":"object","${1}.updatedStatus":"string","${1}.failure":"undefined","$<2>":"number","${2}":"object","${2}.updatedStatus":"string","${2}.failure":"undefined"},
    value: new Map([
      [4, {
        updatedStatus: "WaitingConfirmations",
        failure: undefined,
      }],
      [5, {
        updatedStatus: "WaitingConfirmations",
        failure: undefined,
      }],
      [3, {
        updatedStatus: "Settled",
        failure: undefined,
      }],
    ]),
  },
  {
    label: "receiver: settling",
    types: {"$":"map"},
    value: new Map(),
  },
  {
    label: "receiver: fail a pending receive",
    types: {"$":"map","$<0>":"number","${0}":"object","${0}.updatedStatus":"undefined","${0}.failure":"undefined"},
    value: new Map([
      [3, {
        updatedStatus: undefined,
        failure: undefined,
      }],
    ]),
  },
  {
    label: "sender: settling",
    types: {"$":"map","$<0>":"number","${0}":"object","${0}.updatedStatus":"string","${0}.failure":"undefined","$<1>":"number","${1}":"object","${1}.updatedStatus":"string","${1}.failure":"undefined"},
    value: new Map([
      [5, {
        updatedStatus: "Settled",
        failure: undefined,
      }],
      [4, {
        updatedStatus: "Settled",
        failure: undefined,
      }],
    ]),
  },
];
