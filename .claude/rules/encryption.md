---
paths:
  - "src/lib/crypto/**"
  - "src/components/crypto/**"
  - "src/app/api/crypto/**"
  - "src/lib/{encryption-mode,member-keys,crypto-schemas}.ts"
  - "src/components/key-fingerprint.tsx"
  - "src/components/household-data/rotation.ts"
---

# Encryption (E2)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/encryption.md](../../docs/agents/encryption.md); read it before a non-trivial change here.

- `FLATPARE_ENCRYPTION=on|off`, read only by `readEncryptionMode()` server-side; unset is `on`.
- **Layering, enforced by ESLint**: `crypto.subtle`, `crypto.getRandomValues` and `hash-wasm` only under `src/lib/crypto/**`; everyone else imports named functions from `@/lib/crypto` (no submodule imports). `src/lib/crypto` imports nothing from the app except a type.
- `src/components/crypto/flows.ts` is the only place that sequences crypto with fetch. `CryptoProvider` derives the state machine (`off | needs-setup | pending-wrap | needs-household-key | locked | unlocked`); **adding a screen means adding it to `no-import-cycle.test.ts`**. Under the signed-in layout, `unlocked` guarantees `keys.dataKey`.
- **Pinned vectors**: Argon2id parameters (`kdf.test.ts`) and the fingerprint emoji order (`fingerprint.test.ts`). Changing either changes users' derived values; do it on purpose. Argon2id runs in `kdf-worker.ts` — keep the literal `new Worker(new URL("./kdf-worker.ts", import.meta.url), { type: "module" })` shape.
- **Your own fingerprint comes from `StoredKeys.publicKey`, never the server's copy.**
- **Rotation (#219)**: the server refuses envelopes not sealed under the current `key_version` (`requireCurrentKey`, 409 `Stale key`). Rotation is one all-or-nothing transaction (`rotateHouseholdKey`) driven from `src/components/household-data/rotation.ts`, and mints a new recovery kit. `src/components/crypto` must not import from `src/components/household-data`.
