// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "(rejections)"
};

export const samples = [
  {
    "method": "getAssetBalance",
    "label": "sender: empty wallet",
    "error": "Asset with id rgb:unknown-asset not found",
    "errorKind": "string"
  },
  {
    "method": "getAssetMetadata",
    "label": "sender: with NIA and IFA",
    "error": "Asset with id rgb:unknown-asset not found",
    "errorKind": "string"
  },
  {
    "method": "sendBtcBegin",
    "label": "sender: invalid input rejected by the runtime",
    "error": "Address error: base58 error",
    "errorKind": "string"
  }
];
