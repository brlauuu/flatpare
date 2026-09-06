# E2 — Crypto core, key lifecycle, and invitations

Implementation design for issues #183, #184 and #197. Refines the E2 section
of [the phase spec](./2026-09-01-accounts-e2ee-billing-design.md) and builds on
the household model E1 shipped
([design](./2026-09-02-e1-accounts-oauth-design.md), PR #209).

Status: approved 2026-09-06.

## What this epic delivers

- A client-side crypto library under `src/lib/crypto/` that is the **only**
  code allowed to touch key material.
- Per-member identity keypairs protected by a passphrase; a per-household data
  key wrapped to each member and to a recovery code.
- The full key lifecycle in the UI: setup, unlock, lock, change passphrase,
  reset passphrase, recover from kit, regenerate kit.
- Household invitations: invite by email, accept, revoke, remove member — with
  the key-wrapping step that makes them work under encryption.
- A deployment-wide encryption mode, `on` or `off`, fixed per database.
- The `seal`/`open` envelope that E3 will use to encrypt rows.

**E2 encrypts no rows.** E3 does that. E2 ships the whole lifecycle so that E3
is "call `seal` on the way in and `open` on the way out."

## Where the phase spec changed

The phase spec wraps the data key three ways: under the owner's passphrase,
under a recovery code, and to each member's public key. It never says where a
member's **private** key lives. In the browser only, a member on a second
device — or after clearing site data — has no private key and no way back to
the household key. Closing that hole needs a member passphrase, and once every
member has one, the owner's direct passphrase wrap is redundant: the owner is
just another member.

So the hierarchy becomes:

```
passphrase ──Argon2id──▶ KEK ──AES-GCM──▶ wraps the member's private key
member public key ──RSA-OAEP──▶ wraps the household data key   (one per member)
recovery code ──Argon2id──▶ RK ──AES-GCM──▶ wraps the household data key (one per household)
household data key ──AES-GCM──▶ every encrypted row            (E3)
```

Two kinds of wrap instead of three. Fewer code paths in the one place a
mistake is permanent.

The second change: the phase spec says *an owner* must be online to finish an
invite. This design lets **any unlocked member** do it. See
[Who may wrap](#who-may-wrap).

## Decisions

| Question | Decision |
|---|---|
| Opt-out | `FLATPARE_ENCRYPTION=on\|off`, deploy-wide, fixed per database on first boot. Unset means `on`. |
| Passphrase frequency | Once per device. Keys persist as non-extractable `CryptoKey`s in IndexedDB until sign-out or an explicit lock. |
| KDF | Argon2id via `hash-wasm`. Parameters stored per key so they can be raised later. |
| Public-key algorithm | RSA-OAEP, 3072-bit, SHA-256. |
| Symmetric | AES-256-GCM, 96-bit random IV, mandatory AAD. |
| Recovery code | 120 bits random, 24 base32 chars plus a check character, run through the same Argon2id path as the passphrase. |
| Invitations | By email, no email sent, 7-day expiry. Accepted at the invitee's next sign-in. |
| Who wraps | Any unlocked member, for any user who already holds a membership row. |
| Households per user | Still one, as in E1. |
| Scope | #183, #184 and #197 together, one branch, one PR. |

## Encryption mode

`FLATPARE_ENCRYPTION` is read server-side at boot. Valid values are `on` and
`off`; unset is `on`; anything else fails boot.

**The mode is a property of the database, not of the process.** On first boot
the server writes it to a `settings` table (`key = 'encryption_mode'`). On
every later boot it compares, and refuses to start if the env disagrees, with a
message naming both values. This runs alongside the migration preflight in
`src/lib/db/migrate.ts`. Changing mode means a fresh database — or, once #191
exists, an export and re-import.

Why refuse rather than switch: `on → off` leaves every row as ciphertext the
server cannot read; `off → on` leaves plaintext rows the server is supposed to
reject. Both are discovered after the deploy, by users.

Two deployments of the same image with different values are the intended way
to run and test both modes.

**In `off` mode:** no setup, no unlock, no recovery kit, no wrapping step on
invitations. The key tables exist and stay empty. Settings shows
*"Encryption: off — set by this deployment"*. An `off` deployment must not
display the E7 landing-page privacy claim; E7 inherits this requirement.

**How the client learns the mode:** the root layout, a server component,
reads the env and passes `mode` as a prop to `CryptoProvider` — the same
pattern `enabledProviderIds` uses for sign-in buttons. No env var is read in
client-shipped code. The server enforces the mode independently through
`assertEnvelopeMode` (see [Envelope](#envelope)).

## Data model

All new columns hold opaque bytes or public keys. The server never receives a
passphrase, a recovery code, a KEK, a private key, or the data key.

**`member_keys`** — one row per user, not per household. A user's identity
keypair is theirs across any household they may belong to later.

| column | notes |
|---|---|
| `user_id` | PK, FK `users.id` cascade |
| `public_key` | SPKI, base64 |
| `wrapped_private_key` | PKCS#8 wrapped under the KEK with AES-GCM, base64 |
| `private_key_iv` | base64 |
| `kdf_salt` | 16 bytes, base64 |
| `kdf_memory_kib`, `kdf_iterations`, `kdf_parallelism`, `kdf_version` | integers; initial values 65536, 3, 1, 1 |
| `created_at`, `updated_at` | |

**`household_key_wraps`** — the data key wrapped to a member's public key. A
member has access exactly when this row exists.

| column | notes |
|---|---|
| `household_id`, `user_id` | composite PK, both FK cascade |
| `wrapped_key` | RSA-OAEP ciphertext, base64 |
| `wrapped_by` | FK `users.id`, who fulfilled it |
| `created_at` | |

**`households`** gains the recovery wrap: `recovery_wrapped_key`,
`recovery_iv`, `recovery_kdf_salt`, the same four `recovery_kdf_*` parameter
columns, and `recovery_created_at`. All nullable — `off` mode never sets them.
Regenerating the kit replaces them.

**`invitations`**

| column | notes |
|---|---|
| `id` | PK autoincrement |
| `household_id` | FK cascade |
| `email` | stored lower-cased |
| `invited_by` | FK `users.id` |
| `status` | `pending \| accepted \| revoked \| expired` |
| `expires_at` | created + 7 days |
| `accepted_by` | nullable FK `users.id` |
| `created_at` | |

Unique index on `(household_id, email)` where status is `pending`, so an owner
cannot stack invitations for one address.

**`settings`** — `key` text PK, `value` text. Holds `encryption_mode`.

Migration: additive only. Every existing table keeps its E1 shape.

## The crypto library

`src/lib/crypto/` with one responsibility per file:

- `kdf.ts` — `deriveKek(secret, salt, params) → CryptoKey` via hash-wasm
  Argon2id, output 32 bytes, imported as a non-extractable AES-GCM key. Also
  exports `DEFAULT_KDF_PARAMS` and `randomSalt()`.
- `keys.ts` — `generateDataKey()`, `generateMemberKeypair()`,
  `wrapPrivateKey(priv, kek)` / `unwrapPrivateKey(blob, iv, kek)`,
  `wrapDataKey(dataKey, publicKey)` / `unwrapDataKey(blob, privateKey)`,
  `exportPublicKey` / `importPublicKey`.
- `recovery.ts` — `generateRecoveryCode()` (120 random bits as 24 base32
  characters plus one check character, displayed as five groups of five),
  `normalizeRecoveryCode()`, and the wrap and unwrap of the data key under
  the code's derived key.
- `envelope.ts` — `seal`, `open`, `assertEnvelopeMode`. Isomorphic; the
  server imports only `assertEnvelopeMode`.
- `store.ts` — IndexedDB persistence of the unlocked `CryptoKey`s, with an
  in-memory fallback when IndexedDB is unavailable.
- `index.ts` — the public surface. Nothing outside the directory imports the
  other files directly.

**Layering rule: nothing outside `src/lib/crypto/` calls `crypto.subtle`,
`crypto.getRandomValues`, or imports `hash-wasm`.** Enforced two ways:

1. ESLint `no-restricted-properties` on `crypto.subtle` and
   `no-restricted-imports` on `hash-wasm`, with an override that allows them
   inside `src/lib/crypto/**`. This is what CI runs.
2. enola `check --fail-on=layers` locally, with `src/lib/crypto` declared as a
   layer nothing may reach into except through `index.ts`.

The rule is verified once by hand — a temporary `crypto.subtle` call outside
the directory must fail `npm run lint` — and the verification recorded in
AGENTS.md.

**Unwrapped keys are non-extractable.** `unwrapKey` produces them that way
directly, so the plaintext private key exists as bytes only during generation,
and the data key never exists as bytes in the browser after creation. The
generation step exports once to wrap; the exported bytes are not retained.

## Envelope

```ts
type Envelope =
  | { v: 1; iv: string; ct: string }   // AES-256-GCM, base64 fields
  | { v: 0; data: unknown };           // off mode only

seal(key: CryptoKey, value: unknown, aad: string): Promise<Envelope>
seal(null, value: unknown, aad: string): Promise<Envelope>   // v: 0
open(key: CryptoKey | null, envelope: Envelope, aad: string): Promise<unknown>
assertEnvelopeMode(envelope: Envelope, mode: "on" | "off"): void
```

**AAD is mandatory.** E3 sets it to `` `${householdId}:${table}:${rowId}` ``.
It costs nothing and means a ciphertext cannot be moved to another row or
household by whoever holds the database. The reader recomputes it; the
envelope does not carry it. `open` with the wrong AAD fails exactly like a
tampered ciphertext.

`assertEnvelopeMode` throws on `v: 0` when the mode is `on` and on `v: 1`
when it is `off`. Every E3 route that accepts an envelope calls it before
writing.

## Client key lifecycle

`CryptoProvider` sits in the app shell and holds one state:

```
off · needs-setup · pending-wrap · locked · unlocked
```

It renders the setup, pending or unlock screen **instead of** the page until
the state is `unlocked` (or `off`). E3 may therefore assume a key is present
whenever a page renders.

State is decided from one endpoint, `GET /api/crypto/status`, which returns
the mode, whether the user has `member_keys`, and whether a wrap exists for
their household. In `off` mode the endpoint returns `{ mode: "off" }` and the
provider short-circuits.

**Setup** — encryption on, user has no `member_keys`.

1. Choose a passphrase: minimum 12 characters, entered twice.
2. Generate keypair; derive KEK; wrap private key.
3. **Only if the caller is the household's owner and the household has no
   wraps at all**: generate the data key, wrap it to the new public key,
   generate the recovery code, wrap the data key under it. The server checks
   the same condition and rejects a data key from anyone else. A non-owner
   whose household has no wraps yet lands in `pending-wrap` and waits for the
   owner to set up.
4. Show the recovery kit **once**. The continue button is disabled until a
   checkbox is ticked that reads: *"I understand that if I lose both my
   passphrase and this recovery kit, my household's data cannot be recovered
   by anyone, including Flatpare."* The kit is printable (a `print` stylesheet)
   and copyable.
5. `POST /api/crypto/setup` with everything from steps 2–3 in one body. The
   server writes `member_keys`, the wrap, and the recovery columns in one
   transaction. There is no half-set-up state.

A non-owner (an accepted invitee) does steps 1, 2 and 5 only and lands in
`pending-wrap`.

**Unlock** — `member_keys` exists, nothing in the store.

Passphrase → KEK → unwrap private key → unwrap data key → both into the store.
A wrong passphrase surfaces as GCM authentication failure on the private key,
entirely client-side; the screen says "wrong passphrase" and nothing is sent.
Argon2id at the initial parameters takes roughly a second on a phone; the
screen shows a spinner rather than appearing hung.

**Lock** — sign-out clears the store. Settings also offers *Lock this
device*, which clears the store without signing out.

**`pending-wrap`** — the member has keys but no wrap row. The screen says
exactly what is blocking: *"Waiting for someone in your household to open
Flatpare. They don't need to do anything — it happens automatically."* It polls
`status` every 15 seconds.

**Fulfilling wraps** — on every transition to `unlocked`, the provider calls
`GET /api/crypto/pending-wraps`, which lists members of the caller's household
with `member_keys` but no wrap. For each, the client wraps the data key to the
listed public key and `POST /api/crypto/wraps` with the batch. A toast names
who was let in.

## Invitations

**Invite.** `POST /api/invitations` — owner only, `assertMembership` against
the database. Body: `email`. Creates a pending row. The owner's UI shows a
list with status and a revoke action, and text telling the owner to have the
invitee sign in with that address. No email is sent.

**Accept.** `resolveHouseholdForUser` stops auto-creating a household for a
user whose email matches a pending, unexpired invitation; it returns `null`
instead. In the `jwt` callback that user gets a token with `householdId`
unset. `src/proxy.ts` allow-lists `/invitations`, `GET /api/invitations/mine`
and `POST /api/invitations/:id/accept` for an authenticated user without a
household; everything else still requires one. The page offers *Accept* and
*No thanks*. Decline calls the existing create-household path. Accept inserts
the membership row (`member`) and marks the invitation accepted.

The token self-heals: the `jwt` callback re-runs household resolution whenever
`householdId` is unset, so no forced re-login after accepting.

**Already has a household.** An invitee who already belongs to a household
may accept only if that household has exactly one member and zero apartments;
it is deleted in the same transaction. Otherwise the endpoint returns 409
with *"You already belong to a household"*, and the invitation stays pending so
the owner can see it.

**Revoke.** `DELETE /api/invitations/:id` — owner only. Accepted invitations
cannot be revoked; that is removal.

**Remove member.** `DELETE /api/household/members/:userId` — owner only,
cannot target self. Deletes the wrap row and the membership row in one
transaction. Destructive operations by the removed member fail immediately
through `assertMembership`.

**Note for E3.** Reads still trust the JWT for up to 24h. Under encryption a
removed member could bulk-fetch ciphertext they can still decrypt with a
cached key. E3's ciphertext read routes should re-check membership against
the database — one indexed query — so removal is immediate for reads too.
Data-key rotation on removal is a backlog item, not part of E2 or E3.

### Who may wrap

`POST /api/crypto/wraps` accepts a batch of `(userId, wrappedKey)` from any
caller who is a member of the household and holds a wrap themselves. Each
target must already have a membership row in the same household and no wrap;
anything else is rejected for the whole batch.

The membership row is the authorization. Only owners create those, through
invitations. Wrapping merely fulfils an authorization that already exists, so
a member cannot admit anyone. What the widening buys: the owner does not need
to be the one online, and an owner who has lost their passphrase can be
re-admitted by any other member (see [Recovery](#recovery)).

## Recovery and passphrase change

**Change passphrase** — settings, requires the **current** passphrase even
though the device is unlocked, so nobody at an unattended screen can lock the
owner out. The client unwraps the private key with the old KEK to prove it,
re-wraps under the new one, and `PUT /api/crypto/member-keys` replaces the
wrapped private key, IV, salt and parameters. The public key is unchanged;
wraps are untouched.

**Reset passphrase (member)** — on the unlock screen, *I forgot my
passphrase*. The client generates a new keypair under a new passphrase and
`POST /api/crypto/member-keys/reset`, which replaces `member_keys` and deletes
the caller's wrap in one transaction. The member lands in `pending-wrap` and
the screen says *"Ask someone in your household to open Flatpare."* Any
unlocked member re-admits them. No recovery code is involved.

**Owner forgot passphrase, has another member** — identical to the above.

**Sole member forgot passphrase** — the recovery kit. On the unlock screen,
*Use my recovery kit*: enter the code → derive RK → unwrap the data key → set a
new passphrase and keypair → wrap the data key to the new public key → generate
a new recovery code and wrap → `POST /api/crypto/recover` with all of it. The
server replaces `member_keys`, the caller's wrap, and the recovery columns in
one transaction. The old kit is dead afterwards; the screen says so and shows
the new one with the same acknowledgement. The endpoint is behind the OAuth
session, so the code alone recovers nothing.

**Regenerate kit** — settings, owner only, unlocked. New code, new wrap,
`PUT /api/crypto/recovery` replaces the columns. Shown once with the
acknowledgement.

**Both lost, sole member** — the data is gone. The setup screen said so.

## Threat model

The host is **honest-but-curious**: it may read anything at rest and is
defended against. Everything stored server-side is ciphertext or a public key;
AAD binds each ciphertext to its row.

A host that *actively* substitutes a member's public key during a wrap could
obtain the data key. This is inherent to any end-to-end scheme without
out-of-band key verification and is accepted here. It is recorded in
`docs/security-notes.md` with the mitigation that would close it — key
fingerprints shown in the UI for members to compare — as a backlog issue.

XSS on the origin could *use* the unlocked keys while they are in IndexedDB,
though not export them. This is the price of once-per-device unlock and is
also recorded.

If IndexedDB is unavailable (some private-browsing modes), `store.ts` falls
back to memory and the unlock prompt returns on every load. The UI says why.

## Testing

**Crypto library** — Vitest against Node's WebCrypto (`globalThis.crypto`
in Node 20, no polyfill):

- seal/open round-trip; wrong key → throws; one flipped byte of `ct` → throws;
  wrong AAD → throws.
- Passphrase: wrong passphrase fails to unwrap the private key.
- Recovery: code round-trips; normalisation accepts lower-case and missing
  separators; check character rejects a typo.
- **Pinned Argon2id vector**: fixed passphrase and salt at the initial
  parameters produce a known 32-byte output. A parameter change cannot happen
  silently.
- `assertEnvelopeMode`: `v: 0` rejected when on, `v: 1` rejected when off.
- Non-extractability: `exportKey` on every unwrapped key rejects.

**Routes, real SQLite** — the E1 rule applies: tenant-isolation tests never
mock `db`.

- Setup is atomic: a failing insert leaves no `member_keys` row.
- Wraps: member can fulfil; non-member gets 404; target without membership
  rejects the whole batch; target that already has a wrap rejects.
- Invitations: create, accept, decline, revoke, expiry; abandon-empty-household
  rule succeeds with zero apartments and 409s with one; duplicate pending
  invitation rejected.
- Remove member: wrap and membership gone; owner cannot remove self; removed
  member's next destructive call fails.
- Cross-household 404 on every new endpoint.
- Boot preflight: env `off` against a database stamped `on` throws with both
  values in the message; unset env is treated as `on`; an invalid value
  throws.

**Components** — `CryptoProvider` state transitions from each `status`
response; setup refuses to submit without the acknowledgement; unlock shows
the wrong-passphrase error and sends nothing; pending screen polls.

**Lint gate** — verified once by hand as described above.

## Out of scope

- Encrypting rows (E3, #185).
- Tier limits on members (E5, #187).
- Data-key rotation on member removal (backlog).
- Key fingerprints in the UI (backlog, filed from `docs/security-notes.md`).
- A member leaving a household of their own accord (backlog).
- Sending invitation emails.
- Changing encryption mode on an existing database (#191 export/import).
