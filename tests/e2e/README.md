# RgbLibWeb e2e suite

Browser tests for `@utexo/rgb-sdk-web` (`RgbLibWeb`) over the real
`@utexo/rgb-lib-wasm`, against a local regtest stand. The unit suite (`npm test`)
checks the adapter against a fake runtime; this suite checks the values a real
wallet returns, field by field. It is ported from rgb-sdk-web `tests/e2e`
(specs a, b, c) without Lightning.

## Running

1. Start the stand. The steps are in [`docs/e2e-local-stand.md`](../../../docs/e2e-local-stand.md):
   bitcoind, esplora, **RGB proxy 0.4.0 or newer** and the regtest helper from
   `rgb-lib-wasm/tests/docker-compose.ci.yml`, then mine 111 blocks.
2. Run:

   ```bash
   npm run test:e2e
   ```

   This builds `dist/`, bundles the harness page with esbuild and serves it on port
   5180, then runs Playwright in headless Chromium. `RGB_E2E_QUIET=1` hides the
   `report()` output.

The global setup checks the stand first. It fails at once when the helper or
esplora is down, or when the proxy speaks a protocol other than 1.0.

Environment overrides: `RGB_E2E_INDEXER` (default `http://127.0.0.1:8094/regtest/api`),
`RGB_E2E_PROXY` (`rpc://127.0.0.1:3002/json-rpc`), `RGB_E2E_HELPER`
(`http://127.0.0.1:8080`), `RGB_E2E_PORT` (`5180`), `RGB_E2E_VSS_PORT`
(`8181`).

**VSS (optional, spec `g-vss`).** A local lightningdevkit/vss-server with
sigs auth: the `vss` profile of the rgb-lightning-node compose file (image
`vss-server:sigs-auth`, with its Postgres). On this machine the containers
already exist:

```bash
docker start rgb-lightning-node-8777d71-vss-postgres-1 rgb-lightning-node-8777d71-vss-server-1
```

The server sends no CORS headers, so `serve.mjs` proxies `/vss/*` to
`127.0.0.1:$RGB_E2E_VSS_PORT` and the page uses `http://127.0.0.1:5180/vss`.
Without the server the spec is skipped.

## How it works

- `harness/main.mjs` is the page. It imports the built engine from `dist/` and the facade from `@utexo/rgb-sdk`, and
  exposes `window.harness` with `boot` / `call` / `get`. Results cross the page
  boundary as JSON `{ ok, value | error }`, and errors keep `code` and `operation`.
  Bytes cross as `{ $bytes: [...] }`; `call('engine.<name>')` reaches an
  engine-only method past the facade. The page sets the
  core logger to `WARN`.
- `client.mjs` drives the page from the specs: `bootWallet`, `wcall`, `wcallError`,
  `fundAndCreateUtxos`, and `settle` (mine and refresh until a condition holds).
- `stand.mjs` funds and mines through the regtest helper from Node, and waits until
  esplora has indexed each block.
- Two wallets run in two browser contexts, so each has its own IndexedDB.

## Scenarios

| Spec            | Covers                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a-lifecycle`   | init → unlock → network info → identity (stable per mnemonic) → capabilities → destroy → `WALLET_DISPOSED`                                                                                                                                                                                  |
| `b-onchain`     | address → funding → balance (incl. `skipSync`) → createUtxos → listUnspents with parsed outpoints → listTransactions; sendBtc between two wallets; estimateFeeRate on regtest                                                                                                               |
| `c-assets`      | NIA: issue, listAssets (with filter), balance, `ASSET_NOT_FOUND`, onchainReceive witness and blinded, decode, listTransfers, failTransfers. IFA: issue, listAssets (a `test.fixme` in rgb-sdk-web), inflate, inflation beyond the rights. Issuing with no UTXOs                             |
| `d-transfers`   | onchainSend to blinded, witness and donation invoices between two wallets, each settled on both sides; a named invoice after the first transfer; rejections for a blank invoice with no `assetId` and a witness invoice with no `witnessData`                                               |
| `e-persistence` | state survives `destroy` and a page reload (IndexedDB); the same mnemonic in an empty profile starts empty; a byte backup (`exportBackup` through the facade) restores into an empty profile with the same state, wrong password and damaged bytes change nothing, refused after `unlock()` |
| `f-start`       | the README quick start: `generateKeys` from the package, `RgbLibWeb.create()` with no runtime and no `unlock()`, identity, address, balance after funding; the default config (no `dataDir`) persists across a reload; an Electrum indexer rejected before opening                          |
| `g-vss`         | needs the VSS server: backup → empty profile → `restoreFromVss` → the same assets, balances, UTXOs and transfers, kept across a reload, refused after connect; a new device that skips the restore warns and holds its uploads, so a third device still restores the first one's state      |

`npm run capture:fixtures` runs `capture/fixtures.capture.mjs` with its own
config: the harness boots with a recording runtime (`harness/capture.mjs`) and
the raw values go to `tests/fixtures/` (see its README). It is not part of
`npm run test:e2e`.

Not covered: the old rgb-sdk-web spec f (psbt / beginEnd carriers; RgbLibWeb has neither;
the letter f is reused for `f-start`),
h (device loss with open channels), and i and j (Lightning). The old spec g
(VSS round trip) is ported as `g-vss`, without the channel-stream fence.
