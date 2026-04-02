# Security Policy

## Security Model: `@utexo/rgb-sdk-web`

`@utexo/rgb-sdk-web` enforces a **fully local, non-custodial security model**:

- All RGB operations are executed **locally** via WebAssembly
- No xpubs are transmitted to any server
- PSBTs are constructed and validated client-side
- RGB protocol validation is enforced locally using `rgb-lib`
- Wallet state is persisted to **IndexedDB** — never sent to a remote server
- No trusted remote server is required

---

## Reporting Security Issues

If you discover a security vulnerability in `@utexo/rgb-sdk-web`:

- Please **do not** open a public GitHub issue
- Contact us privately with technical details
- Include:
  - Affected version
  - Proof of concept (if available)
  - Impact assessment

Responsible disclosures are appreciated and taken seriously.

---

## Scope

Security considerations for this SDK cover:

- Key and mnemonic exposure
- Privacy leakage (xpubs, transaction graphs, derivation paths)
- PSBT construction and signing correctness
- WASM integrity and supply chain

Wallet metadata is **sensitive security information** — treat mnemonics, xpubs, and signing keys accordingly.
