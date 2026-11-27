// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "refresh"
};

export const samples = [
  {
    label: "sender: settling",
    types: {"$":"map","$<0>":"number","${0}":"object","${0}.updatedStatus":"string","${0}.failure":"undefined","$<1>":"number","${1}":"object","${1}.updatedStatus":"string","${1}.failure":"undefined","$<2>":"number","${2}":"object","${2}.updatedStatus":"string","${2}.failure":"undefined"},
    value: new Map([
      [3, {
        updatedStatus: "Settled",
        failure: undefined,
      }],
      [4, {
        updatedStatus: "WaitingConfirmations",
        failure: undefined,
      }],
      [5, {
        updatedStatus: "WaitingConfirmations",
        failure: undefined,
      }],
    ]),
  },
  {
    label: "receiver: settling",
    types: {"$":"map","$<0>":"number","${0}":"object","${0}.updatedStatus":"undefined","${0}.failure":"undefined","$<1>":"number","${1}":"object","${1}.updatedStatus":"undefined","${1}.failure":"undefined"},
    value: new Map([
      [2, {
        updatedStatus: undefined,
        failure: undefined,
      }],
      [1, {
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
  {
    label: "receiver: pending receives",
    types: {"$":"map","$<0>":"number","${0}":"object","${0}.updatedStatus":"string","${0}.failure":"undefined","$<1>":"number","${1}":"object","${1}.updatedStatus":"string","${1}.failure":"undefined"},
    value: new Map([
      [1, {
        updatedStatus: "WaitingConfirmations",
        failure: undefined,
      }],
      [2, {
        updatedStatus: "WaitingConfirmations",
        failure: undefined,
      }],
    ]),
  },
];
