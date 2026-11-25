// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.5 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.5",
  "wasmSha256": "609f7814a5661c0706e2130df6d4fd5e571a40bdb8cd358e02a5ad09c72f727f",
  "source": "captured",
  "capturedAt": 1795604096054,
  "method": "witnessReceive"
};

export const samples = [
  {
    label: "receiver: blank witness invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:~/~/~/bcrt:wvout:BcVNUaX0-wMjhyoL-NMAkEh0-tJgJe4X-6p~yTXA-oq9QB_z-LwiEhbw?expiry=1795607724&pk=779e3d4df853f0ba626dd1d9136671b2ad2aad0b697408b3523b0c1fe3e4957a&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:wvout:BcVNUaX0-wMjhyoL-NMAkEh0-tJgJe4X-6p~yTXA-oq9QB_z-LwiEhbw",
      expirationTimestamp: 1795607724n,
      batchTransferIdx: 2,
      publicKey: "779e3d4df853f0ba626dd1d9136671b2ad2aad0b697408b3523b0c1fe3e4957a",
    },
  },
  {
    label: "receiver: named witness invoice",
    types: {"$":"object","$.invoice":"string","$.recipientId":"string","$.expirationTimestamp":"bigint","$.batchTransferIdx":"number","$.publicKey":"string"},
    value: {
      invoice: "rgb:gLCaYxOO-HLmEdjX-5o_TO5Y-Nk8ouV7-z2ceASz-0I4SBP0/RWhwUfTMpuP2Zfx1~j4nswCANGeJrYOqDcKelaMV4zU/aW/bcrt:wvout:Bf8W4TtO-J9WogVz-6owX6mv-qM~fNLX-BCGBDEd-zrRJ3Q9-cVq2tZg?assignment_name=assetOwner&expiry=1795690548&pk=8c2deda6348d4a2ad210ca004db0382b8eeda5c70c1008cddd5b8ad7630dde72&endpoints=rpc://127.0.0.1:3002/json-rpc",
      recipientId: "bcrt:wvout:Bf8W4TtO-J9WogVz-6owX6mv-qM~fNLX-BCGBDEd-zrRJ3Q9-cVq2tZg",
      expirationTimestamp: 1795690548n,
      batchTransferIdx: 3,
      publicKey: "8c2deda6348d4a2ad210ca004db0382b8eeda5c70c1008cddd5b8ad7630dde72",
    },
  },
];
