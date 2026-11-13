// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "witnessReceive"
};

export const samples = [
  {
    label: "receiver: blank witness invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:~/~/~/bcrt:wvout:BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg?expiry=1794398692&pk=731c61c56b134e245ddc9a986d2c5c12ae0eaf846a69d301c20945d621d90008&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:wvout:BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg",
      expirationTimestamp: 1794398692n,
      batchTransferIdx: 2,
      publicKey: "731c61c56b134e245ddc9a986d2c5c12ae0eaf846a69d301c20945d621d90008",
    },
  },
  {
    label: "receiver: named witness invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ/RWhwUfTMpuP2Zfx1~j4nswCANGeJrYOqDcKelaMV4zU/aW/bcrt:wvout:BQrh~g~e-K7UxTWj-rcWtuqx-_7AjE4Y-l6xlYd~-9~dGbTN-0R3Z26g?assignment_name=assetOwner&expiry=1794481516&pk=7a3ae7d1e8a67b6a08572f70a1c855aece18167a0003d8304010aa7680418cc6&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:wvout:BQrh~g~e-K7UxTWj-rcWtuqx-_7AjE4Y-l6xlYd~-9~dGbTN-0R3Z26g",
      expirationTimestamp: 1794481516n,
      batchTransferIdx: 3,
      publicKey: "7a3ae7d1e8a67b6a08572f70a1c855aece18167a0003d8304010aa7680418cc6",
    },
  },
];
