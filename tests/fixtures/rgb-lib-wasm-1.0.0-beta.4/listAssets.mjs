// Captured from @utexo/rgb-lib-wasm 1.0.0-beta.4 by `npm run capture:fixtures`.
// Do not edit by hand: rerun the capture. Values are kept as the runtime built
// them (BigInt, Map, undefined); `types` lists the kind at every path.
export const meta = {
  "runtime": "@utexo/rgb-lib-wasm",
  "version": "1.0.0-beta.4",
  "wasmSha256": "cd46c01d4a0b0569efe17812c46a060e2b3a82088ca7b83a1edbbe279d0ac4df",
  "source": "captured",
  "capturedAt": 1794395066962,
  "method": "listAssets"
};

export const samples = [
  {
    label: "sender: empty wallet",
    types: {"$":"object","$.nia":"array","$.ifa":"array","$.bfa":"array"},
    value: {
      nia: [],
      ifa: [],
      bfa: [],
    },
  },
  {
    label: "sender: with NIA and IFA",
    types: {"$":"object","$.nia":"array","$.nia[0]":"object","$.nia[0].assetId":"string","$.nia[0].ticker":"string","$.nia[0].name":"string","$.nia[0].details":"undefined","$.nia[0].precision":"number","$.nia[0].issuedSupply":"bigint","$.nia[0].timestamp":"bigint","$.nia[0].addedAt":"bigint","$.nia[0].balance":"object","$.nia[0].balance.settled":"bigint","$.nia[0].balance.future":"bigint","$.nia[0].balance.spendable":"bigint","$.nia[0].media":"undefined","$.ifa":"array","$.ifa[0]":"object","$.ifa[0].assetId":"string","$.ifa[0].ticker":"string","$.ifa[0].name":"string","$.ifa[0].details":"undefined","$.ifa[0].precision":"number","$.ifa[0].initialSupply":"bigint","$.ifa[0].maxSupply":"bigint","$.ifa[0].knownCirculatingSupply":"bigint","$.ifa[0].timestamp":"bigint","$.ifa[0].addedAt":"bigint","$.ifa[0].balance":"object","$.ifa[0].balance.settled":"bigint","$.ifa[0].balance.future":"bigint","$.ifa[0].balance.spendable":"bigint","$.ifa[0].media":"undefined","$.ifa[0].rejectListUrl":"undefined","$.bfa":"array"},
    value: {
      nia: [
        {
          assetId: "rgb:lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ",
          ticker: "CAPN",
          name: "Capture NIA",
          details: undefined,
          precision: 2,
          issuedSupply: 1500n,
          timestamp: 1794395080n,
          addedAt: 1794395080n,
          balance: {
            settled: 1500n,
            future: 1500n,
            spendable: 1500n,
          },
          media: undefined,
        },
      ],
      ifa: [
        {
          assetId: "rgb:K0cOwU~O-pNE3dtY-SscYX7v-lD9fEL3-AimDJAz-PpxkYQE",
          ticker: "CAPI",
          name: "Capture IFA",
          details: undefined,
          precision: 0,
          initialSupply: 500n,
          maxSupply: 1000n,
          knownCirculatingSupply: 700n,
          timestamp: 1794395080n,
          addedAt: 1794395080n,
          balance: {
            settled: 500n,
            future: 700n,
            spendable: 500n,
          },
          media: undefined,
          rejectListUrl: undefined,
        },
      ],
      bfa: [],
    },
  },
  {
    label: "receiver: settled receives",
    types: {"$":"object","$.nia":"array","$.nia[0]":"object","$.nia[0].assetId":"string","$.nia[0].ticker":"string","$.nia[0].name":"string","$.nia[0].details":"undefined","$.nia[0].precision":"number","$.nia[0].issuedSupply":"bigint","$.nia[0].timestamp":"bigint","$.nia[0].addedAt":"bigint","$.nia[0].balance":"object","$.nia[0].balance.settled":"bigint","$.nia[0].balance.future":"bigint","$.nia[0].balance.spendable":"bigint","$.nia[0].media":"undefined","$.ifa":"array","$.bfa":"array"},
    value: {
      nia: [
        {
          assetId: "rgb:lOKTMMxy-CNrTQRP-TuKtHNs-VSPlEuk-pobg33H-kAB0bdQ",
          ticker: "CAPN",
          name: "Capture NIA",
          details: undefined,
          precision: 2,
          issuedSupply: 1500n,
          timestamp: 1794395080n,
          addedAt: 1794395093n,
          balance: {
            settled: 150n,
            future: 150n,
            spendable: 150n,
          },
          media: undefined,
        },
      ],
      ifa: [],
      bfa: [],
    },
  },
];
