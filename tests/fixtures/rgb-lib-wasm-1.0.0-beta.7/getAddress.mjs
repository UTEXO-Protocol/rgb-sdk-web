// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "getAddress"
};

export const samples = [
  {
    label: "sender: empty wallet",
    types: {"$":"string"},
    value: "bcrt1prhc3ulakp8jgm2g8p27znn7cjsx7f8yza7c7yza5d3yrqjp8mzyqc53sl8",
  },
  {
    label: "sender: funded, colorable UTXOs",
    types: {"$":"string"},
    value: "bcrt1p9zgt6428qhdk6c8hyn3xa6t48n7hyhcrdwxysr3lc0dzddpajtjqc9a3g7",
  },
  {
    label: "receiver: funded receiver",
    types: {"$":"string"},
    value: "bcrt1pgs6k2xkyzelqenlln6ugs2am0aujrsnmm2fdt2gm9uz577ldd63s02s4u6",
  },
  {
    label: "receiver: fail a pending receive",
    types: {"$":"string"},
    value: "bcrt1p46hydm4suej7w0rusuehq9ur6vlu7cza4p2mlns9wsah69npekwqvkh0t0",
  },
];
