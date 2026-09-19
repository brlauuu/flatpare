# Data-key rotation on member removal (#219)

Status: approved 2026-09-19 (owner said "go for it"; decisions below are the
implementer's, recorded so they can be reversed deliberately).

## The gap

E2 removal deletes a member's wrap and membership. E3 re-checks membership on
every read, so a removed member's fetches stop at once. But their device still
holds the household data key, so:

- ciphertext they fetched **before** removal stays readable forever (nothing
  can undo that — accepted, unchanged by this design);
- anything the household writes **after** removal is sealed under a key they
  still hold, so a copy of the database — a backup, a breach, a subpoena —
  is readable to them for as long as the household lives.

Rotation closes the second: after removal, a new data key is generated, every
row is re-sealed under it, and the removed member's cached key opens nothing
written from then on.

## Decisions

1. **Rotation is client-side and owner-driven.** The server never holds a
   data key, so only a member can re-encrypt. The owner is the only one who can
   remove, so the owner rotates, in the same browser action, right after the
   removal succeeds.
2. **Removal and rotation are two steps, not one transaction.** Removal is a
   server transaction that cuts access immediately. Rotation follows and can
   fail (network, a concurrent write). A failed rotation leaves the household
   fully consistent under the old key, marked **rotation due**; the owner sees a
   warning in Encryption settings with a button to run it again. Nothing is
   half-rotated, ever: the server applies a rotation in one transaction or not
   at all.
3. **A key version, not a key id.** `households.key_version` starts at 1 and
   increments per rotation. Every wrap records which version it holds; every
   encrypted envelope records which version sealed it (`k`, absent = 1). The
   server refuses any write whose envelope is not sealed under the current
   version (`409 { error: "Stale key", keyVersion }`), so a member whose device
   still holds the old key cannot write ciphertext nobody else can read.
4. **The recovery code changes on every rotation.** The kit holds the data key
   under a KEK derived from the recovery code, and the owner does not have the
   code at hand during a removal. Keeping the code would need the recovery KEK
   itself to be stored somewhere the old key could reach, which would hand the
   new key to exactly the person being removed. So rotation mints a new kit and
   shows the new code once, through the same screen as setup and regenerate.
   The removal confirmation says this before the owner clicks.
5. **PDFs are re-encrypted too.** Each stored PDF is downloaded, opened under the
   old key, sealed under the new one with the same AAD, and uploaded to a new
   path `<apartmentId>.k<version>.pdf.enc`. The apartment envelope points at the
   new path; the old file is deleted by the server after the rotation commits.
   Uploading before the commit means a failed rotation leaves an orphan file at
   worst, never a row pointing at a missing one. A PDF that cannot be fetched
   is left as it is (its reference and old iv stay in the envelope) and named
   in the report; the rotation still goes through.
6. **Corrupt rows are left untouched.** A row that does not open under the old
   key cannot be re-sealed. It is already unreadable to everyone, so rotation
   passes it through with `envelope: null` ("keep") rather than deleting it or
   refusing to rotate — a data glitch must not block a security operation.
7. **Wraps go to every member who has published a public key**, whether or not
   they held a wrap before (a pending member gets one now). A member with no
   key pair yet gets nothing; when they set up they become pending and the
   existing sweep wraps the current key to them. Each wrap is checked against
   the target's current public key inside the transaction, as `fulfilWraps`
   already does.
8. **Other members' devices re-key silently.** `StoredKeys` gains
   `keyVersion`; the crypto provider compares it with the status's wrap
   version and adopts the new wrap with the stored private key — no passphrase
   prompt. The provider now also re-reads status once a minute while unlocked
   (and whenever a write comes back `Stale key`), so a member sees the new key
   within a minute of a rotation. The household store reloads when the data
   key changes, which it already did.

## Protocol

```
GET  /api/crypto/rotate            owner, encryption on
  → { keyVersion, members: [{ userId, publicKey }] }

POST /api/crypto/rotate            owner, encryption on
  {
    fromKeyVersion,                  // must equal households.key_version
    wraps:      [{ userId, wrappedKey, publicKey }],   // exactly the members with keys
    recovery:   { wrappedKey, iv, kdf },               // new kit
    apartments: [{ id, version, envelope | null }],    // every row; version as read
    ratings:    [{ apartmentId, userId, envelope | null }],
    locations:  [{ id, envelope | null }],
    retiredPdfPaths: [string]                          // deleted after commit
  }
  → { keyVersion }      // fromKeyVersion + 1
  409 "Stale key"       // someone else rotated first; abort
  409 "Stale rows"      // a row changed under us; reload, re-seal, retry once
```

Inside one transaction the server checks: caller is owner; version matches;
the wrap set equals the set of members with a `member_keys` row, public keys
current; the three row sets equal the household's rows, apartment versions
current; every non-null envelope is `v: 1` with `k = fromKeyVersion + 1`. Then
it replaces all wraps, replaces the recovery columns, updates every non-null
envelope (bumping apartment versions), sets `key_version`, clears
`rotation_due`. Retired PDF paths are validated to the household and deleted
after the commit.

## Client flow (`runRotateDataKey`, `src/components/household-data/rotation.ts`)

1. Status: require owner, require the device key's version to equal the
   household's (otherwise refresh first). Fetch targets.
2. Fetch the three tables fresh and open every row under the old key — the
   store may be stale and the server will reject stale versions anyway.
3. Generate the new data key (extractable, for wrapping), a new recovery kit,
   and one wrap per target.
4. Re-seal every opened row with `k = next`. For each apartment with a PDF:
   download, open, seal, upload to the versioned path; remember the old path.
5. POST. On `Stale rows`, redo steps 2 and 4 for the rows only (PDF uploads are
   reused by apartment id) and try once more.
6. Persist the new key as a non-extractable stored key with the new version.
   Return the recovery code and a report `{ rows, pdfs, pdfFailures }`.

`HouseholdDataProvider` exposes it as `rotateDataKey()`; `HouseholdSettings`
calls it after a successful removal and hands the code to `showRecoveryKit`;
`EncryptionSettings` offers it to the owner with a warning while
`rotationDue` is set.

## Schema (migration 0021)

- `households.key_version INTEGER NOT NULL DEFAULT 1`
- `households.rotation_due INTEGER NOT NULL DEFAULT 0` — set by `removeMember`,
  cleared by a successful rotation
- `household_key_wraps.key_version INTEGER NOT NULL DEFAULT 1`

No data migration: every existing row, wrap and household is version 1.

## Out of scope

- Rotation when a member leaves voluntarily (#220): the same flow can be run by
  the owner afterwards; the leave lands with `rotation_due` set, and the owner
  is warned on their next visit.
- Re-fetch prevention for ciphertext already fetched before removal. Not
  possible; stated in `docs/security-notes.md`.
- Automatic rotation without an owner present. The server cannot do it.
