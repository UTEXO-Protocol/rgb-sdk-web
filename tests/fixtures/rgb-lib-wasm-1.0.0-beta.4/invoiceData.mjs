// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "invoiceData"
};

export const samples = [
  {
    label: "sender: send to blinded",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"undefined","$.assetId":"undefined","$.assignment":"string","$.assignmentName":"undefined","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:utxob:ZWvefwMb-EjT014C-PDnhUQ4-6RYyJ98-1L5uy_d-zkH~VFV-Ofn44",
      assetSchema: undefined,
      assetId: undefined,
      assignment: "Any",
      assignmentName: undefined,
      network: "Regtest",
      expirationTimestamp: 1794398692n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "037e98730c1adf06cb3ffd48ac6fde3720064ac713d7aead4551eef9d18ba24b",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
  {
    label: "sender: decode named invoice",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"string","$.assetId":"string","$.assignment":"object","$.assignment.Fungible":"bigint","$.assignmentName":"string","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:wvout:BQrh~g~e-K7UxTWj-rcWtuqx-_7AjE4Y-l6xlYd~-9~dGbTN-0R3Z26g",
      assetSchema: "Nia",
      assetId: "rgb:lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ",
      assignment: {
        Fungible: 7n,
      },
      assignmentName: "assetOwner",
      network: "Regtest",
      expirationTimestamp: 1794481516n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "7a3ae7d1e8a67b6a08572f70a1c855aece18167a0003d8304010aa7680418cc6",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
  {
    label: "sender: send to witness",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"undefined","$.assetId":"undefined","$.assignment":"string","$.assignmentName":"undefined","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:wvout:BStVpzGH-ur7Y57V-NHUO6pg-WmMvk9B-1aAUgIW-1JBPAyY-cuaqqFg",
      assetSchema: undefined,
      assetId: undefined,
      assignment: "Any",
      assignmentName: undefined,
      network: "Regtest",
      expirationTimestamp: 1794398692n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "731c61c56b134e245ddc9a986d2c5c12ae0eaf846a69d301c20945d621d90008",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
];
