// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
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
