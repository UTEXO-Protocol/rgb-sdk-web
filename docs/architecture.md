# Architecture

For contributors to this package. Users need only the [README](../Readme.md).

## Layout

```
src/
  index.ts            exports only
  rgb-lib-web.ts      RgbLibWeb: the public API, 29 SharedWalletApi methods
  backend.ts          lifecycle (init, connect, destroy), admission, serial queue
  operations.ts       per method: prepare (checks, WASM arguments) and execute
  config.ts           options, defaults per network, config checks
  keys.ts             mnemonic or public keys, watch-only
  errors.ts           public error codes, shared by every layer
  runtime/            everything tied to the @utexo/rgb-lib-wasm version
    load.ts           loads the WASM module once per page
    types.ts          the runtime API this package calls
    session.ts        the open wallet: handle, sync, sign, flush
    codec.ts          decoding of every WasmWallet result to the core types
    rgb-lib-messages.generated.ts   beta.4 error table (generated)
```

## Rules

- Imports point one way: `rgb-lib-web` → `backend` → `operations` →
  `runtime/`. `config`, `keys` and `errors` are shared; `runtime/` imports
  nothing from `backend` or `operations`.
- A runtime upgrade changes `runtime/` (and the fixtures and golden results)
  only.
- A new file only when an existing one passes about 800 lines or gets a second
  job. No `utils/`: each helper belongs to the layer that uses it.
- Each file starts with what it does, who calls it and what it depends on.

`prepare` runs before the call is queued and has no side effects, so an
invalid call fails at once. `execute` runs as one queued task: WASM calls
never overlap. A synchronous WASM mutation is reported only after it is
flushed to IndexedDB.

## Decoding rules

The runtime is `@utexo/rgb-lib-wasm` 1.0.0-beta.4; the normative source is its
tag `v1.0.0-beta.4` (`f0e266f`).

- Each result is decoded in two stages. `decode*` checks the raw value and
  keeps numbers exact (u64 and i64 stay `BigInt`); a value that breaks the
  Rust type fails with `INVALID_NATIVE_RESPONSE`. `public*` converts to the
  core types; a number above `Number.MAX_SAFE_INTEGER` fails with
  `AMOUNT_OVERFLOW`, never rounds.
- Containers are strict: a `Map` where Rust has a map keyed by integers
  (`refresh`), a plain object for `unknownQueryParams`, `undefined` for an
  absent `Option`.
- Integers are checked by their Rust type (`u8`, `u32`, `i32`, `u64`, `i64`);
  enum variants must be ones beta.4 has.
- `FIELDS` in `src/runtime/codec.ts` lists every field of the 21 beta.4 structs
  the adapter reads, each `mapped` (public), `internal` (used, not public) or
  dropped with the reason. Only `mapped` and `internal` fields are read;
  unknown fields are ignored at runtime, so an additive runtime release keeps
  working, and fail the fixture schema test (`tests/unit/codec.test.mjs`).
- Inputs go in the wire form beta.4 takes: `BigInt` for u64 amounts, expiry
  and fee rates; decimal strings for `WitnessData`.
- Runtime errors map to public codes by the table in
  `src/runtime/rgb-lib-messages.generated.ts`, generated from the Rust source;
  other messages are `NATIVE_ERROR`.

## Status

| Step                                                                           | State |
| ------------------------------------------------------------------------------ | ----- |
| 1. Remove RLN, depend on the split core and `@utexo/rgb-lib-wasm` 1.0.0-beta.4 | done  |
| 2. Move `RgbLibWeb` and its tests here                                         | done  |
| 3. Load the WASM runtime inside the package                                    | done  |
| 4. One-call start: `RgbLibWeb.create()`, `generateKeys`, one config object     | done  |
| VSS backup: zero config, `backupToVss()`, automatic upload                     | done  |
| VSS restore before connect, unrestored-backup hold                             | done  |
| Byte backup: `exportBackup()`, `restoreBackup()`, with e2e                     | done  |
| VSS backup and restore e2e against a local VSS server                          | done  |
