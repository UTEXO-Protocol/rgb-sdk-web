// Handmade positive samples: shapes the stand could not produce, built from
// captured samples and the beta.7 Rust types at `meta.rustCommit`
// (src/wallet/offline.rs `Media`, `AssetBFA`; src/wallet/online.rs
// `RefreshedTransfer`, `AssignmentsCollection`; src/error.rs `Error`). The
// binding builds with `camel_case`, so structs with
// `cfg_attr(feature = "camel_case", …)` have camelCase fields; `Error` and
// `AssignmentsCollection` have no `rename_all` and stay snake_case.
import * as listAssets from './listAssets.mjs';
import { sample, variant } from '../lib.mjs';

export const meta = {
  runtime: '@utexo/rgb-lib-wasm',
  version: '1.0.0-beta.5',
  source: 'handmade',
  rustCommit: 'dedab0f043e6c82da19eef2b8faebbdc52bac1db', // tag v1.0.0-beta.7
};

const assets = sample(listAssets, 'sender: with NIA and IFA');

export const cases = [
  {
    method: 'listAssets',
    label: 'NIA with media',
    basedOn: 'listAssets: sender: with NIA and IFA',
    value: variant(assets, (v) => {
      v.nia[0].media = {
        filePath: '/media/0a1b',
        digest: 'ab'.repeat(32),
        mime: 'image/png',
      };
    }),
  },
  {
    method: 'listAssets',
    label: 'BFA asset',
    basedOn: 'src/wallet/offline.rs AssetBFA, from the captured IFA',
    value: variant(assets, (v) => {
      const { maxSupply, initialSupply, rejectList, ...bfa } = v.ifa[0];
      void maxSupply;
      void initialSupply;
      void rejectList;
      v.bfa = [
        {
          ...bfa,
          assetId: 'rgb:handmade-bfa',
          ticker: 'BFA',
          name: 'Bridged',
          details: 'bridged from EVM',
          precision: 6,
          knownCirculatingSupply: 21_000_000_000_000n,
          media: {
            filePath: '/media/bfa',
            digest: 'cd'.repeat(32),
            mime: 'image/svg+xml',
          },
          bridgeLocation: {
            Evm: {
              chainId: 42161n,
              address: `0x${'e'.repeat(40)}`,
            },
          },
          rejectList: { Url: 'https://reject.example/list' },
        },
      ];
    }),
  },
  {
    method: 'listAssets',
    label: 'IFA with an EVM reject list',
    basedOn: 'src/no_wallet/inspection.rs RgbRejectListInfo::Evm',
    value: variant(assets, (v) => {
      v.ifa[0].rejectList = {
        Evm: { chainId: 1n, address: `0x${'f'.repeat(40)}` },
      };
    }),
  },
  {
    method: 'listAssets',
    label: 'absent buckets (Option<Vec> = None)',
    basedOn: 'src/wallet/offline.rs Assets',
    value: { nia: undefined, ifa: undefined, bfa: undefined },
  },
  {
    method: 'refresh',
    label: 'failures: unit, struct with u64, nested struct',
    basedOn: 'src/wallet/online.rs RefreshedTransfer',
    value: new Map([
      [7, { updatedStatus: 'Failed', failure: 'NoValidTransportEndpoint' }],
      [
        8,
        {
          updatedStatus: undefined,
          failure: { InsufficientBitcoins: { needed: 1000n, available: 500n } },
        },
      ],
      [
        9,
        {
          updatedStatus: 'Failed',
          failure: {
            InsufficientAssignments: {
              asset_id: 'rgb:handmade',
              available: {
                fungible: 5n,
                non_fungible: false,
                inflation: 0n,
                link: true,
                mint: 2n ** 64n - 1n,
              },
            },
          },
        },
      ],
    ]),
  },
  {
    method: 'getReceivedMint',
    label: 'checked mint, u64 above the safe range',
    basedOn: 'src/wallet/objects.rs ReceivedMint (camelCase; u64 as BigInt)',
    value: {
      opid: 'a'.repeat(64),
      lockId: 'b'.repeat(64),
      amount: 2n ** 64n - 1n,
      beforeBlock: 2n ** 53n + 1n,
      evmChainId: 42161n,
      bridgeContract: `0x${'c'.repeat(40)}`,
    },
  },
];
