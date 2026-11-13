// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "refresh"
};

export const samples = [
  {
    label: "sender: settling",
    types: {"$":"map","$<0>":"number","${0}":"object","${0}.updatedStatus":"string","${0}.failure":"undefined","$<1>":"number","${1}":"object","${1}.updatedStatus":"string","${1}.failure":"undefined","$<2>":"number","${2}":"object","${2}.updatedStatus":"string","${2}.failure":"undefined"},
    value: new Map([
      [5, {
        updatedStatus: "WaitingConfirmations",
        failure: undefined,
      }],
      [4, {
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
];
