# rgb-sdk-web e2e suite

Behaviour-against-a-real-node tests (MIGRATION-PLAN-v3 §7a). The unit suite and
the conformance suite check *shape*; this suite checks *values* coming back
from a live regtest stack, field by field.

## Running

```bash
# 1. Bring up the stack (docker + gateway + 2 RLN nodes + utexo-lsp).
#    Writes rgb-sdk-web-demo/e2e-fixtures.json — the suite's input.
cd ../rgb-sdk-web-demo && ./scripts/start-lsp-web.sh        # add VSS=1 for the vss spec

# 2. Run the suite (builds dist first — the harness imports the BUILT sdk).
cd ../rgb-sdk-web && npm run test:e2e
```

`npm test` stays fast and docker-free; jest ignores this directory.

## How it works

- `harness/` — a minimal Vite page. `@utexo/rgb-sdk-web` is aliased to
  `dist/index.mjs`, so the suite tests the artifact that ships. The page
  exposes `window.harness` (`boot` / `call` / `get` / `conformance` /
  `lspCreate` / `lspCall`); everything crosses the page boundary as JSON in an
  `{ ok, value | error }` envelope.
- **`lspCreate`/`lspCall`** exist because `createLsp()` returns a live object
  with methods, and only JSON crosses the boundary — the harness holds the
  `UtexoLsp` and the spec addresses it by method name. Its progress callbacks
  (`onProgress`, `onEachPoll`) cannot cross either, so specs poll and mine
  themselves; that keeps the drive beat in the test rather than in a callback.
- `fixtures.ts` — loads `e2e-fixtures.json` (override path with
  `RGB_E2E_FIXTURES`). Funding/mining goes through the gateway's
  `POST /dev/regtest/fund` from Node — no docker exec, no CORS.
- Specs assert with the shared field helpers from
  `@utexo/rgb-sdk-core/conformance` (`expectFields`, `expectNoWireKeys`, …) —
  every response field named, wire-shaped keys rejected (§7a.2).

## Scenarios

| Spec | Covers |
|---|---|
| `a-lifecycle.spec.ts` | init → unlock → node/network info → dispose; capabilities on the live object; `runConformanceChecks` fed the live wallet (closes the §6.0f gap) |
| `b-onchain.spec.ts` | address → gateway funding → balance increase → createUtxos → listUnspents with parsed outpoints |
| `c-assets.spec.ts` | issueAssetNia → listAssets → getAssetBalance → **`onchainReceive`** in both variants (witness and blinded, asserted to differ) → decodeRGBInvoice → listOnchainTransfers. Second test: **`onchainSend`** in three shapes — blinded, witness (`witnessData` required) and `donation: true` — paid between two wallets in two contexts |
| `f-carriers.spec.ts` | begin/sign/end round-trips through `psbt` + `beginEnd`; real `vss.vssBackup` when the stack has `VSS=1` |
| `g-vss.spec.ts` | VSS round-trip (`VSS=1`): backup → mutate → backup → fresh wallet → `restoreFromVss` → asset list, balance and channel-stream fence asserted |
| `h-restore.spec.ts` | scenario H — device loss: a wallet killed with a channel open restores and reconnects, then closes **two** channels (BTC and coloured) and asserts both balances settle on-chain — the post-close sweep from rgb-lightning-node #119 (§6.0q) |
| `i-funding.spec.ts` | scenario I — wallet-funded open against `regular_web`: `openChannel` funds itself (build + submit + broadcast) and the channel reaches ready (§6.0s) |
| `j-apay.spec.ts` | scenario J — APay cart checkout across **two** browser contexts: merchant publishes a Lightning Address, buyer tops up and pays it, merchant’s channel RGB rises by the cart amount. No close phase: LSP channels are virtual, so there is nothing to settle on-chain — see scenario H |

## Constraints worth knowing

- **Port 5173 is pinned** — the gateway's CORS allowlist only has
  `localhost:5173` / `127.0.0.1:5173`. Stop the demo dev server before running
  (`reuseExistingServer: false` makes the collision an explicit error).
- **Core must be rebuilt** for changes to reach the suite: both the sdk build
  and the field helpers resolve through `dist/`, not `src/`
  (`cd ../rgb-sdk-core && npm run build`).
- The stack scripts hard-code local repo paths (`RGBLN_REPO`), so this is a
  local pre-commit gate, not CI — §7a.6.
