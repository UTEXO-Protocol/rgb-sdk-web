// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "blindReceive"
};

export const samples = [
  {
    label: "receiver: blank blinded invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:~/~/~/bcrt:utxob:ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44?expiry=1794398692&pk=037e98730c1adf06cb3ffd48ac6fde3720064ac713d7aead4551eef9d18ba24b&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:utxob:ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44",
      expirationTimestamp: 1794398692n,
      batchTransferIdx: 1,
      publicKey: "037e98730c1adf06cb3ffd48ac6fde3720064ac713d7aead4551eef9d18ba24b",
    },
  },
  {
    label: "receiver: fail a pending receive",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ/RWhwUfTMpuP2Zfx1~j4nswCANGeJrYOqDcKelaMV4zU/aB/bcrt:utxob:iu01bBZJ-PKEnoot-D_i3FNA-6lxHOYM-QroPojA-IllNXp8-C1NSN?assignment_name=assetOwner&expiry=1794481516&pk=46d8883600c988fd38bb017b4760f3dc77cc8a9d599c4fa76ebcfbedc8d6adf0&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:utxob:iu01bBZJ-PKEnoot-D_i3FNA-6lxHOYM-QroPojA-IllNXp8-C1NSN",
      expirationTimestamp: 1794481516n,
      batchTransferIdx: 4,
      publicKey: "46d8883600c988fd38bb017b4760f3dc77cc8a9d599c4fa76ebcfbedc8d6adf0",
    },
  },
];
