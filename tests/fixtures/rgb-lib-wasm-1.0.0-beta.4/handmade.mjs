// Handmade positive samples: shapes the stand could not produce, built from
// captured samples and the beta.4 Rust types (src/wallet/offline.rs `Media`,
// src/wallet/online.rs `RefreshedTransfer`, src/error.rs `Error`, whose
// variant fields are snake_case: the enum has no `rename_all`).
import * as listAssets from './listAssets.mjs';
import { sample, variant } from '../lib.mjs';

export const meta = {
  runtime: '@utexo/rgb-lib-wasm',
  version: '1.0.0-beta.4',
  source: 'handmade',
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
                replace: 0,
              },
            },
          },
        },
      ],
    ]),
  },
];
