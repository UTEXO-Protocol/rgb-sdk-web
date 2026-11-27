// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "invoiceData"
};

export const samples = [
  {
    label: "sender: send to blinded",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"undefined","$.assetId":"undefined","$.assignment":"string","$.assignmentName":"undefined","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:utxob:Oplk6rvF-4Z4jrMA-3n80sPj-UWl5rrq-RcIYEAw-VETkZms-I4_Pt",
      assetSchema: undefined,
      assetId: undefined,
      assignment: "Any",
      assignmentName: undefined,
      network: "Regtest",
      expirationTimestamp: 1795784252n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "50cdb53e4534460b4a20c0a99aa64242874a1b5f1da6d849bfceb4e1c4b006a7",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
  {
    label: "sender: decode named invoice",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"string","$.assetId":"string","$.assignment":"object","$.assignment.Fungible":"bigint","$.assignmentName":"string","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:wvout:BebI4BWC-UBAA8Q0-PYEzgR5-33wfNcL-rXZkmRR-FwSdwvU-bURMTng",
      assetSchema: "Nia",
      assetId: "rgb:cbWkA8nC-~OCjkGA-qb3wll4-YTqCa_b-PmAxlEG-2qvBl7c",
      assignment: {
        Fungible: 7n,
      },
      assignmentName: "assetOwner",
      network: "Regtest",
      expirationTimestamp: 1795867056n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "f57aa96db1404aa156d684ea90a45351312ec9dfb632e5736584c48cca2945f7",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
  {
    label: "sender: send to witness",
    types: {"$":"object","$.recipientId":"string","$.assetSchema":"undefined","$.assetId":"undefined","$.assignment":"string","$.assignmentName":"undefined","$.network":"string","$.expirationTimestamp":"bigint","$.transportEndpoints":"array","$.transportEndpoints[0]":"string","$.publicKey":"string","$.encryption":"string","$.unknownQueryParams":"object"},
    value: {
      recipientId: "bcrt:wvout:BdUOz_8t-vHyk7Do-Ff1GNi9-tlclLBA-QvuU3rM-4vzrGd_-WpCUlsA",
      assetSchema: undefined,
      assetId: undefined,
      assignment: "Any",
      assignmentName: undefined,
      network: "Regtest",
      expirationTimestamp: 1795784252n,
      transportEndpoints: [
        "rpc://127.0.0.1:3002/json-rpc",
      ],
      publicKey: "d39cef4f2a99b851249c0490f897898052f1dba1b75d87a1381d446af0434418",
      encryption: "Required",
      unknownQueryParams: {},
    },
  },
];
