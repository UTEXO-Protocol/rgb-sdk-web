# Security Policy

## Security Model: `@utexo/rgb-sdk-web`

`@utexo/rgb-sdk-web` enforces a **fully local, non-custodial security model**:

- All RGB operations are executed **locally** via WebAssembly
- No xpubs are transmitted to any server
- PSBTs are constructed and validated client-side
- RGB protocol validation is enforced locally using `rgb-lib`
- Wallet state is persisted to **IndexedDB** — never sent to a remote server
  (except an encrypted VSS backup, when enabled). Any script of the page's
  origin can read IndexedDB, so treat XSS on that origin as wallet compromise
- One open wallet per browser profile: a Web Lock refuses a second open of the
  same wallet (`WALLET_STORAGE_IN_USE`). It prevents lost writes between tabs;
  it is not a security boundary
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
