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
  exposes `window.harness` (`boot` / `call` / `get` / `conformance`);
  everything crosses the page boundary as JSON in an `{ ok, value | error }`
  envelope.
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
| `c-assets.spec.ts` | issueAssetNia → listAssets → getAssetBalance → blindReceive → decodeRGBInvoice → listTransfers |
| `f-carriers.spec.ts` | begin/sign/end round-trips through `psbt` + `beginEnd`; real `vss.vssBackup` when the stack has `VSS=1` |
| `g-vss.spec.ts` | VSS round-trip (`VSS=1`): backup → mutate → backup → fresh wallet → `restoreFromVss` → asset list, balance and channel-stream fence asserted |

## Constraints worth knowing

- **Port 5173 is pinned** — the gateway's CORS allowlist only has
  `localhost:5173` / `127.0.0.1:5173`. Stop the demo dev server before running
  (`reuseExistingServer: false` makes the collision an explicit error).
- **Core must be rebuilt** for changes to reach the suite: both the sdk build
  and the field helpers resolve through `dist/`, not `src/`
  (`cd ../rgb-sdk-core && npm run build`).
- The stack scripts hard-code local repo paths (`RGBLN_REPO`), so this is a
  local pre-commit gate, not CI — §7a.6.
