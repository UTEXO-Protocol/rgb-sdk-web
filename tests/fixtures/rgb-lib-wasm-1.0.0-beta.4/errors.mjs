// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
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
    "method": "sendBtcBegin",
    "label": "sender: invalid input rejected by the runtime",
    "error": "Address error: base58 error",
    "errorKind": "string"
  }
];
