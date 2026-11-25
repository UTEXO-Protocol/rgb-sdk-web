// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "invoiceData"
};

export const samples = [
  {
    label: "sender: send to blinded",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"undefined","$.assetId":"undefined","$.assignment":"string","$.assignmentName":"undefined","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:utxob:Uh9oTkqP-XY9kcmt-VaiXBMp-M8Isi~~-84F4DIu-vGuyMRQ-pBATN",
      assetSchema: undefined,
      assetId: undefined,
      assignment: "Any",
      assignmentName: undefined,
      network: "Regtest",
      expirationTimestamp: 1795607724n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "e936356cdb8676894c26c041bd1a899c3b8acae091fd10b015452adfb7ef05d7",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
  {
    label: "sender: decode named invoice",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"string","$.assetId":"string","$.assignment":"object","$.assignment.Fungible":"bigint","$.assignmentName":"string","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:wvout:Bf8W4TtO-J9WogVz-6owX6mv-qM~fNLX-BCGBDEd-zrRJ3Q9-cVq2tZg",
      assetSchema: "Nia",
      assetId: "rgb:gLCaYxOO-HLmEdjX-5o_TO5Y-Nk8ouV7-z2ceASz-0I4SBP0",
      assignment: {
        Fungible: 7n,
      },
      assignmentName: "assetOwner",
      network: "Regtest",
      expirationTimestamp: 1795690548n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "8c2deda6348d4a2ad210ca004db0382b8eeda5c70c1008cddd5b8ad7630dde72",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
  {
    label: "sender: send to witness",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"undefined","$.assetId":"undefined","$.assignment":"string","$.assignmentName":"undefined","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:wvout:BcVNUaX0-wMjhyoL-NMAkEh0-tJgJe4X-6p~yTXA-oq9QB_z-LwiEhbw",
      assetSchema: undefined,
      assetId: undefined,
      assignment: "Any",
      assignmentName: undefined,
      network: "Regtest",
      expirationTimestamp: 1795607724n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "779e3d4df853f0ba626dd1d9136671b2ad2aad0b697408b3523b0c1fe3e4957a",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
];
