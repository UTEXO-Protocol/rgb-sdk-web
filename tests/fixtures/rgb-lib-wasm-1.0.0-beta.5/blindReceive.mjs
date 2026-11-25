// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "blindReceive"
};

export const samples = [
  {
    label: "receiver: blank blinded invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:~/~/~/bcrt:utxob:Uh9oTkqP-XY9kcmt-VaiXBMp-M8Isi~~-84F4DIu-vGuyMRQ-pBATN?expiry=1795607724&pk=e936356cdb8676894c26c041bd1a899c3b8acae091fd10b015452adfb7ef05d7&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:utxob:Uh9oTkqP-XY9kcmt-VaiXBMp-M8Isi~~-84F4DIu-vGuyMRQ-pBATN",
      expirationTimestamp: 1795607724n,
      batchTransferIdx: 1,
      publicKey: "e936356cdb8676894c26c041bd1a899c3b8acae091fd10b015452adfb7ef05d7",
    },
  },
  {
    label: "receiver: fail a pending receive",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:gLCaYxOO-HLmEdjX-5o_TO5Y-Nk8ouV7-z2ceASz-0I4SBP0/RWhwUfTMpuP2Zfx1~j4nswCANGeJrYOqDcKelaMV4zU/aB/bcrt:utxob:Ichru5KG-FiLxYlG-l9jcU~T-WfIgYfZ-yq~CpP0-Bi85YcB-Zd3cF?assignment_name=assetOwner&expiry=1795690548&pk=bf0492661e9c470b20f24a538b36b96ba52b36e369338281c3e5c0774f12570a&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:utxob:Ichru5KG-FiLxYlG-l9jcU~T-WfIgYfZ-yq~CpP0-Bi85YcB-Zd3cF",
      expirationTimestamp: 1795690548n,
      batchTransferIdx: 4,
      publicKey: "bf0492661e9c470b20f24a538b36b96ba52b36e369338281c3e5c0774f12570a",
    },
  },
];
