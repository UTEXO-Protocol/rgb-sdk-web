# Examples

L1 only. Each file exports one async function; call it from your app.

| File                    | What it shows                                              |
| ----------------------- | ---------------------------------------------------------- |
| `new-wallet.ts`         | `generateKeys`, `RgbLibWeb.create()`, address, balance     |
| `read-wallet.ts`        | reopening a stored wallet, assets, transfers, transactions |
| `create-utxos-asset.ts` | colorable UTXOs, issuing an NIA asset                      |
| `transfer.ts`           | invoice, `onchainSend`, refresh                            |

Backup and restore examples come with the backup work (ADR-0003).

`npm test` type-checks these files against the built package.
