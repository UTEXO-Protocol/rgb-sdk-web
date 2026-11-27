// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.7 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.7",
  "wasmSha256": "fe77124e9dde84f16e6db7432dc562257ed47a02ec674c1d894fe0343c463f19",
  "source": "captured",
  "capturedAt": 1795780647454,
  "method": "witnessReceive"
};

export const samples = [
  {
    label: "receiver: blank witness invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:~/~/~/bcrt:wvout:BdUOz_8t-vHyk7Do-Ff1GNi9-tlclLBA-QvuU3rM-4vzrGd_-WpCUlsA?expiry=1795784252&pk=d39cef4f2a99b851249c0490f897898052f1dba1b75d87a1381d446af0434418&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:wvout:BdUOz_8t-vHyk7Do-Ff1GNi9-tlclLBA-QvuU3rM-4vzrGd_-WpCUlsA",
      expirationTimestamp: 1795784252n,
      batchTransferIdx: 2,
      publicKey: "d39cef4f2a99b851249c0490f897898052f1dba1b75d87a1381d446af0434418",
    },
  },
  {
    label: "receiver: named witness invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:cbWkA8nC-~OCjkGA-qb3wll4-YTqCa_b-PmAxlEG-2qvBl7c/RWhwUfTMpuP2Zfx1~j4nswCANGeJrYOqDcKelaMV4zU/aW/bcrt:wvout:BebI4BWC-UBAA8Q0-PYEzgR5-33wfNcL-rXZkmRR-FwSdwvU-bURMTng?assignment_name=assetOwner&expiry=1795867056&pk=f57aa96db1404aa156d684ea90a45351312ec9dfb632e5736584c48cca2945f7&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:wvout:BebI4BWC-UBAA8Q0-PYEzgR5-33wfNcL-rXZkmRR-FwSdwvU-bURMTng",
      expirationTimestamp: 1795867056n,
      batchTransferIdx: 3,
      publicKey: "f57aa96db1404aa156d684ea90a45351312ec9dfb632e5736584c48cca2945f7",
    },
  },
];
