// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "getAddress"
};

export const samples = [
  {
    label: "sender: empty wallet",
    types: {"$":"string"},
    value: "bcrt1p43jnr8w804yqzhuh0xq0h23sufc43zvja49gcx6s45tgxz0m5w0qwv5g7v",
  },
  {
    label: "sender: funded, colorable UTXOs",
    types: {"$":"string"},
    value: "bcrt1pu48vgvuejhhgu409u9re5emr5hw5hjdx9sne3r3gfxe3j306ey9spspcaf",
  },
  {
    label: "receiver: funded receiver",
    types: {"$":"string"},
    value: "bcrt1pgx0ppj2g2l3933p75c6zwlkttnw4vkxs86f90m4wpr29wugay7psr8gywc",
  },
  {
    label: "receiver: fail a pending receive",
    types: {"$":"string"},
    value: "bcrt1p3aud7rccla9a44wd9lelwc0w6eft2880th0x6whu60jak5wzf6xss9lxr2",
  },
];
