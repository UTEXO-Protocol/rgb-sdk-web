# rgb-lib-wasm fixtures

Raw values of `@utexo/rgb-lib-wasm` 1.0.0-beta.4, kept exactly as the runtime
builds them: `bigint`, `Map` and keys set to `undefined` included (ADR-0002
step 0). Decoders are tested against these, not only against the handwritten
fake.

| File | Source |
|---|---|
| `rgb-lib-wasm-1.0.0-beta.4/<method>.mjs` | captured: one module per `WasmWallet` method (and `invoiceData`), up to 4 samples, distinct shapes first |
| `rgb-lib-wasm-1.0.0-beta.4/errors.mjs` | captured: runtime rejection messages |
| `rgb-lib-wasm-1.0.0-beta.4/handmade.mjs` | handmade: shapes the stand cannot produce (media, refresh failures, absent buckets) |
| `rgb-lib-wasm-1.0.0-beta.4/negative.mjs` | handmade: missing fields, wrong containers, unknown variants and keys, boundary numbers, a nested error with BigInt; each with the expected strict outcome |
| `source.mjs` | `toSource` (lossless text form) and `describeTypes` |
| `lib.mjs` | helpers for handmade samples |

Each captured module records the runtime version, the wasm SHA-256, the
capture time and, per sample, the kind at every path.

## Commands

```bash
npm run capture:fixtures  # rerun the capture; needs the regtest stand (tests/e2e/README.md)
npm run golden:update     # rewrite tests/golden/*.golden.mjs from the current code
```

- `tests/unit/fixtures.test.mjs` fails when the installed runtime differs from
  the captured one (version or wasm hash): capture again before upgrading.
- `tests/unit/golden.test.mjs` runs every sample through the built engine and
  compares the public result, the error and the runtime calls with the golden
  file. Its `KNOWN_DEFECTS` list names where the current code differs from the
  strict rules in `negative.mjs`; ADR-0002 step 1 removes them one by one.

The capture replaces all captured modules and keeps `handmade.mjs` and
`negative.mjs`. Captured values change between runs (txids, timestamps), so a
recapture rewrites the golden file too; review both diffs.
