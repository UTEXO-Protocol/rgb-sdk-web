// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "getAddress"
};

export const samples = [
  {
    label: "sender: empty wallet",
    types: {"$":"string"},
    value: "bcrt1p68gpxjn68ja7y0lms2sal845rs4nxysrzjcwjqg8xz7yejalqltszhg6f6",
  },
  {
    label: "sender: funded, colorable UTXOs",
    types: {"$":"string"},
    value: "bcrt1pfeksf06qwjkhvxfsda2thmse3wzjcx9a6y3099fjftd3gy807p7qllrznz",
  },
  {
    label: "receiver: funded receiver",
    types: {"$":"string"},
    value: "bcrt1px5qwl0a027pzal7nzplj544e5elukp5z2yfwknham07v6hzwpuqslddxjy",
  },
  {
    label: "receiver: fail a pending receive",
    types: {"$":"string"},
    value: "bcrt1pp6q2dz0zd0l2a3funwct2v0z7afszhvfs9rdyln0lkt2mndf2ymqnhhnfc",
  },
];
