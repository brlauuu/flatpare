# E1 — Accounts, OAuth, and multi-tenancy

Implementation design for epic E1 (issues #181 and #182). Expands the E1 section
of [2026-09-01-accounts-e2ee-billing-design.md](./2026-09-01-accounts-e2ee-billing-design.md),
which remains the authority on the wider phase.

Status: approved 2026-09-02.

## Naming change from the phase spec

The phase spec calls the tenancy unit an "account". Auth.js's Drizzle adapter
requires a table named `accounts` for OAuth provider links, so two unrelated
concepts would share one name in the same schema.

**The tenancy unit is a `household`.** `accounts` means OAuth links, as Auth.js
expects. Read "account owner" in the phase spec as "household owner".

## Why this ships as one pull request

Splitting OAuth from scoping produces an intermediate state where the shared
password is gone but nothing has replaced it as a gate — any Google user on the
internet could sign in and read everything. The old gate is only removed in the
same change that installs the new one.

Staged as reviewable commits on one branch:

1. Schema: households, members, `household_id` on every data table.
2. Auth.js wiring: OAuth providers plus the self-host credentials path.
3. Scope every query and route handler.
4. Storage path scoping.
5. Delete the shared-password code.

## Decisions

| Question | Decision |
|---|---|
| Library | `next-auth@5` (beta) + `@auth/drizzle-adapter` |
| Providers | Google and GitHub |
| Self-hosting | Credentials provider using `APP_PASSWORD` when no OAuth env is set |
| Tenancy unit | `household`, one owner, no transfer |
| Membership | Join table (many-to-many); UI ships a single active household |
| Session | JWT carrying `householdId` and `role` |
| Existing data | Wiped. No migration |

`next-auth` v5 is beta and has been for a long time. Accepted knowingly: v4 is
stable but Pages Router-shaped, and its App Router workarounds would cost more
than the beta risk. Both declare Next 16 peer support.

## Schema

Auth.js owns `users`, `accounts`, `sessions`, `verification_tokens`.

```
households         id, name, owner_id -> users.id, tier, created_at
household_members  household_id, user_id, role ('owner' | 'member'), created_at
                   primary key (household_id, user_id)
```

Every data table gains `household_id NOT NULL` with an index:
`apartments`, `ratings`, `locations_of_interest`, `apartment_distances`.

`api_usage` is host telemetry, not user data. It gains a nullable
`household_id` for per-household cost attribution under E6, and is never
exposed through a household-scoped route.

Removed: `users.name` as a primary key, and `ratings.user_name`. Ratings key off
`user_id`. The uniqueness constraint becomes `(apartment_id, user_id)`.

Membership is a join table because it costs nothing now and avoids a migration
if someone later needs two households. The UI resolves the user's single
household and ships no switcher and no active-household state.

## Sessions

JWT strategy, so the proxy authorizes without a database round-trip per request.

The tradeoff is explicit: **a JWT stays valid until it expires, so a removed
member keeps access for up to the token lifetime.** Mitigations, both required:

- Token lifetime capped at 24 hours rather than the default 30 days.
- Destructive and membership-changing operations (remove a member, delete a
  household, delete an apartment, rotate anything) re-check membership against
  the database instead of trusting the token.

Reads may trust the token. This is a deliberate, bounded exposure, not an
oversight; it is written here so the next reader does not "fix" it by adding a
database hit to every request.

## Auth paths

- `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID` set → those providers are offered.
- Neither set → a credentials provider authenticating against `APP_PASSWORD`,
  so `docker compose up` still works with no third-party setup.
- Both configured → OAuth only; the credentials provider is not registered.

The credentials path is not a lesser citizen: it gets the same session handling,
the same household resolution, and its own tests. `verifyPassword`'s
constant-time comparison is retained for it.

## Sign-in and household resolution

On first sign-in a user gets a household and is its owner. On subsequent
sign-ins the session resolves to their existing membership. An invited user who
accepts joins the inviter's household instead of creating one.

Invitations are modelled here but the key-wrapping half belongs to E2; until
then an invitation grants membership without any encrypted-data access, because
there is no encrypted data yet.

## Storage — the IDOR fix

`/api/pdf/[...path]` and `/api/uploads/[...path]` currently serve any file by
path. With one shared pool that is safe. With households it is a cross-tenant
read: a member of household A who knows or guesses a path reads household B's
listing PDFs.

Uploads are written to `<household_id>/<uuid>.<ext>`, and both routes verify the
leading path segment against the session's household before serving a byte.
Path traversal (`..`) is rejected before that check, not after.

Without this, tenancy is cosmetic.

## Removed in the final commit

`src/lib/auth-cookie.ts`, the `flatpare-auth` HMAC cookie, `isAuthenticated`,
`setAuthenticated`, `getDisplayName`, `setDisplayName`, and the password gate in
`src/proxy.ts`. `verifyPassword` survives, used only by the credentials provider.

`docs/security-notes.md` is rewritten in the same pull request. Its current auth
section describes a cookie scheme that will no longer exist, and stale security
documentation is worse than none.

`AGENTS.md`'s Auth section is rewritten for the same reason.

## Testing

The load-bearing tests are the negative ones.

- **Cross-tenant access, every route.** All 19 route handlers get a test
  asserting household A cannot read or write household B's rows. This includes
  the two file-serving routes, tested with both a foreign household prefix and a
  traversal attempt.
- **Household resolution.** First sign-in creates a household and an owner;
  second sign-in reuses it; an invited user joins rather than creating.
- **Both auth paths.** OAuth-configured and credentials-configured, including
  that the credentials provider is not registered when OAuth is present.
- **Token staleness.** A removed member's existing token is rejected by a
  destructive operation even while the token is otherwise valid.
- **Proxy.** Unauthenticated page routes redirect, `/api/*` returns 401, and the
  PWA assets stay excluded from the matcher.

## Deployment

The production database is wiped as part of this change. It holds one real
apartment and two users; that loss is accepted (phase spec, "Existing data").

Deployment order matters: the schema change and the application change must go
out together, and the OAuth callback URLs must be registered with Google and
GitHub **before** deploying, or the first sign-in fails in production with no
local warning.

## Out of scope

Household switching UI, ownership transfer, a second owner (backlogged as #192),
per-member permissions beyond owner/member, and everything E2 owns: passphrases,
key wrapping, and encrypted data.
