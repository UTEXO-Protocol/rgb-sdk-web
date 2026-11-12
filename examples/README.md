# Examples

L1 only. Each file exports one async function; call it from your app.
`webrgb-extension/` is a folder of its own, with its own
[README](webrgb-extension/README.md).

| File                    | What it shows                                              |
| ----------------------- | ---------------------------------------------------------- |
| `new-wallet.ts`         | `generateKeys`, `RgbLibWeb.create()`, address, balance     |
| `read-wallet.ts`        | reopening a stored wallet, assets, transfers, transactions |
| `create-utxos-asset.ts` | colorable UTXOs, issuing an NIA asset                      |
| `transfer.ts`           | witness invoice, `onchainSend`, refresh until `Settled`    |
| `webrgb-extension/`     | an MV3 extension wallet serving dApps through WebRGB       |

Backup and restore are described in the package README.

`npm test` type-checks these files against the built package.
