// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "blindReceive"
};

export const samples = [
  {
    label: "receiver: blank blinded invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:~/~/~/bcrt:utxob:Oplk6rvF-4Z4jrMA-3n80sPj-UWl5rrq-RcIYEAw-VETkZms-I4_Pt?expiry=1795784252&pk=50cdb53e4534460b4a20c0a99aa64242874a1b5f1da6d849bfceb4e1c4b006a7&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:utxob:Oplk6rvF-4Z4jrMA-3n80sPj-UWl5rrq-RcIYEAw-VETkZms-I4_Pt",
      expirationTimestamp: 1795784252n,
      batchTransferIdx: 1,
      publicKey: "50cdb53e4534460b4a20c0a99aa64242874a1b5f1da6d849bfceb4e1c4b006a7",
    },
  },
  {
    label: "receiver: fail a pending receive",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:cbWkA8nC-~OCjkGA-qb3wll4-YTqCa_b-PmAxlEG-2qvBl7c/RWhwUfTMpuP2Zfx1~j4nswCANGeJrYOqDcKelaMV4zU/aB/bcrt:utxob:aiLGs_J_-bMTNvQo-BxtB1TX-17bOFtG-tr1PkzZ-dvSCT5d-Fmpo7?assignment_name=assetOwner&expiry=1795867056&pk=8c0595c17ac6961635bdc53aee7d341581d113484326c5be55dae0aaef8fcee1&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:utxob:aiLGs_J_-bMTNvQo-BxtB1TX-17bOFtG-tr1PkzZ-dvSCT5d-Fmpo7",
      expirationTimestamp: 1795867056n,
      batchTransferIdx: 4,
      publicKey: "8c0595c17ac6961635bdc53aee7d341581d113484326c5be55dae0aaef8fcee1",
    },
  },
];
