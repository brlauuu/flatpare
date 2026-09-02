# Accounts, end-to-end encryption, and paid tiers

Design for Flatpare's next phase: real accounts, client-held encryption keys,
tiered limits, and a hosted paid plan — without closing the source.

Status: approved 2026-09-01. Supersedes the shared-password auth model.

## Why

Flatpare today is one shared password, no accounts, and a single flat pool of
apartments readable by anyone holding that password — including the host. To
offer it to people who are not the author, three things have to change at once:
users must be distinguishable, their data must be private *from the host*, and
the host must be able to charge for the hosting.

## The privacy claim, stated exactly

The server holds no key and cannot decrypt stored data. It does see plaintext
that a user explicitly submits for processing — a PDF sent for extraction, an
address sent for geocoding — which is used in memory and never stored.

The honest one-liner, to be used verbatim on the landing page:

> We can't read your data. We do process PDFs and addresses in memory when you
> ask us to, and we never store them.

Do not claim "zero-knowledge" without that qualification. The processing
exception is real and must be stated wherever the encryption is marketed.

## Decisions

| Question | Decision |
|---|---|
| Encryption model | True E2EE: client-held keys, server stores opaque blobs |
| Third-party API calls | Blind proxy through our server, using our keys, documented exception |
| Key source | Passphrase (Argon2id) + printable recovery kit. No reset, ever |
| Login | OAuth: Google + GitHub. Identity only — never key material |
| Ownership | One owner, no transfer. Multiple members by invite |
| Free tier | 5 members, 20 apartments |
| Paid tier | 10 members, 100 apartments |
| OSS strategy | One public repo. Limits are env config, unset = unlimited |
| Payments | Stripe, via the Vercel Marketplace `payments` integration |
| Existing data | Wiped. Clean start, no migration path |
| Mobile | PWA first. Native deferred to backlog |

## Terminology update (2026-09-02)

This document calls the tenancy unit an **account**. E1's implementation design
renames it to **household**, because Auth.js's Drizzle adapter requires a table
named `accounts` for OAuth provider links and two concepts cannot share one name
in one schema. Read "account" as "household" throughout, except where it plainly
means an OAuth link or a Stripe customer. See
[2026-09-02-e1-accounts-oauth-design.md](./2026-09-02-e1-accounts-oauth-design.md).

## Epics and dependency order

```
E0 mobile/PWA ──────────────────────────────── independent, ship first
E1 accounts + OAuth ──┬── E2 crypto core ── E3 encrypted model ── E4 blind proxy
                      └── E5 entitlements ── E6 Stripe
E7 domain + landing (after E2, it sells the crypto story)
E8 native app (backlog)
```

E0 is independent and should ship while the crypto design settles. E1 blocks
everything that touches data. E8 is explicitly not scheduled.

## E1 — Accounts, OAuth, multi-tenancy

Auth.js v5 with the Drizzle adapter; Google and GitHub providers.

New tables: `accounts`, `account_members` (role: `owner` | `member`),
`invitations`. Every existing data table gains a non-null `accountId`, and every
query filters on it. `users.name` as a primary key goes away; ratings key off a
member id instead.

`APP_PASSWORD`, the HMAC auth cookie, and the password gate in `src/proxy.ts` are
all removed. `src/proxy.ts` becomes a session gate. The hardening in PR #176 was
correct for the model it defended and is superseded here — `docs/security-notes.md`
must be rewritten in the same PR, not left describing a cookie that no longer
exists.

One owner per account, set at creation, with no transfer mechanism. This is a
deliberate simplification and a known single point of permanent data loss: if the
owner loses both passphrase and recovery kit, the account is unrecoverable. A
second-owner capability is a candidate follow-up, not part of this phase.

## E2 — Crypto core

- `accountDataKey`: random 256-bit key. All account data is AES-GCM encrypted
  under it. It never leaves the browser in plaintext.
- Wrapped three ways, all stored server-side as ciphertext:
  1. under a KEK derived from the user's passphrase via **Argon2id** (WASM —
     Argon2id is not available in WebCrypto; PBKDF2 is not an acceptable
     substitute here),
  2. under a one-time **recovery code**, shown once as a printable kit,
  3. **once per member**, to that member's public key.
- Each member generates a keypair in-browser on first sign-in and publishes only
  the public half.

**Invites are not fire-and-forget.** The invitee signs in, generates a keypair,
and publishes their public key; an owner must then be online to wrap the
`accountDataKey` to it. The server cannot perform this step — it has no key.
The invite UI must show a pending state and tell both parties what is blocking.

Recovery kit is displayed exactly once, at account creation, with an explicit
acknowledgement that losing both secrets destroys the data irrecoverably.

## E3 — Encrypted data model

Apartments reduce to `(id, accountId, shortCode, createdAt, updatedAt,
ciphertext, iv)`. Ratings and locations follow the same shape. No user-supplied
field is queryable server-side.

Sorting, filtering, and search move client-side, after the client decrypts the
account's rows. At the tier ceiling of 100 apartments this is comfortably fast;
this design does not scale to thousands of rows per account and is not intended
to.

The production database is wiped as part of this epic. There is no migration.

## E4 — Blind-proxy processing

`/api/process/*` endpoints accept plaintext, call Gemini or Google Maps with the
host's keys, return the result, and store nothing. Requirements:

- No request or response bodies in logs, on any code path, including errors.
- No persistence of plaintext at any layer, including caches.
- Rate limited per account — these endpoints spend the host's money.
- The privacy exception documented at the endpoint and on the landing page.

Existing `parse-pdf`, `geocode`, `distance`, and `check-listings` logic is reused;
what changes is that results are returned to the client for encryption rather than
written to the database.

## E5 — Entitlements

`MAX_MEMBERS` and `MAX_APARTMENTS` env vars. **Unset means unlimited** — that is
the self-hoster's default and must not regress. The hosted deployment sets 5 and
20; a paid account is lifted to 10 and 100.

Enforced server-side on row counts, which requires no decryption. Enforcement
belongs in the route handlers, not only the UI.

## E6 — Stripe

Provisioned through the Vercel Marketplace `payments` integration (`vercel
integration add stripe`), confirmed as the available provider on 2026-09-01. Not
hand-wired with the Stripe SDK.

Stripe Checkout for upgrade, the Customer Portal for cancellation and card
changes, and a signed webhook that flips the account's tier. The webhook is the
only source of truth for entitlement — never the client, and never the redirect
back from Checkout.

Billing metadata (customer id, subscription id, tier, period end) is **not**
encrypted: the server must read it to enforce limits, and it is the host's
commercial record rather than the user's private data.

## E7 — Domain and landing page

A real domain, and a landing page that states the privacy claim in the exact
wording above, including the processing exception, plus tier pricing and a
self-hosting path.

## E8 — Native iOS/Android (backlog, not scheduled)

Deferred in favour of a PWA. A native app would require reimplementing Argon2id,
key wrapping, and the envelope scheme in Swift and Kotlin — duplicating the code
where mistakes are unrecoverable — plus two store review processes. Revisit only
if the PWA proves insufficient; push notifications and camera capture are the
plausible triggers, and neither is a current requirement.

## Backlog

**Encrypted export/import.** E2EE makes the host structurally unable to restore
anyone's data. A client-side export is therefore the only backup a user can have.
Not scheduled in this phase, but it is the difference between "we can't help you"
and "you had a way to help yourself."

**Second account owner.** Mitigates the single-owner data-loss risk above.

## Testing

- Crypto: round-trip encrypt/decrypt, unwrap under each of the three wraps,
  wrong-passphrase rejection, recovery-code path, tamper detection on the GCM tag.
- Tenancy: every data route is tested for cross-account access returning 404/403.
  This is the test that stops the worst possible bug in this design.
- Entitlements: at-limit and over-limit on both counters, and unset-means-unlimited.
- Blind proxy: asserts that no handler writes plaintext to the database or logs.
- Stripe: webhook signature verification, and that a forged client-side upgrade
  claim changes nothing.
