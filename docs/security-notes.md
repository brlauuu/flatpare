# Security & dependency notes

## Pinned major versions awaiting upstream

### eslint stays on 9 (10 breaks eslint-config-next)

`eslint@10.3.0` is current, but bumping breaks `eslint-config-next@16.2.6` because the bundled `eslint-plugin-react` calls the now-removed `context.getFilename()` API.

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
```

**Re-check trigger:** new `eslint-config-next` release that ships an `eslint-plugin-react` compatible with the eslint 10 rule API.

## Auth model — reviewed 2026-09-02 (E1 accounts/OAuth epic)

The shared-password + display-name model described in the previous version of this
section **no longer exists.** There is no `flatpare-auth` HMAC cookie, no
`flatpare-name` cookie, no `isAuthenticated()`, and no `/api/auth` allow-list logic to
audit — that entire surface was deleted in Task 6 of the accounts/OAuth epic, not
patched. Auth is now Auth.js v5 (`src/auth.ts`), with real per-user accounts backed by
the `users`/`accounts`/`sessions` tables. Below is what was decided and why, recorded
as accepted, reasoned decisions rather than a changelog of fixes.

### Accepted: `/api/auth/*` is wholesale public

`src/proxy.ts` passes through every path under `/api/auth/` unconditionally, signed in
or not — a broader allow-list than the old exact-match `/api/auth`, and deliberately
so. Auth.js owns that entire namespace (sign-in, OAuth callback, session, CSRF token)
end to end; the sign-in flow cannot function if the gate intercepts any of it. This is
safe specifically because there is no hand-rolled route left underneath that prefix
with anything to leak — the old `GET /api/auth/users` (list every display name) and
`DELETE /api/auth/users/[name]` (delete a user with no household predicate) are both
gone, along with the display-name POST endpoint. If a future change ever adds a
hand-written route under `/api/auth/*`, it inherits zero protection from the proxy and
must gate itself.

### Accepted: JWT sessions with a 24h staleness window

Sessions are JWTs (`session.strategy: "jwt"` in `src/auth.ts`), not database-backed, so
a session's `householdId` and `role` are stamped onto the token once at sign-in and not
re-read from the database on every request. That is a deliberate performance trade: it
avoids a database round trip on every authenticated request, at the cost that a change
to membership (a member removed, a role changed) doesn't take effect for that member
until their token expires.

The bound on that staleness is `maxAge: 60 * 60 * 24` — 24 hours, not the library's
30-day default. Two mitigations narrow the exposure further:

- **Destructive operations** (delete an apartment, delete a location, etc.) and
  **bulk/create handlers** re-check membership against the database directly via
  `assertMembership()` / `requireHousehold()` rather than trusting the token's cached
  role, so a stale token can't be used to act with a permission the caller no longer
  has for the operations that matter most.
- Read access to stale data for up to 24h after removal is the accepted residual risk.
  This is judged acceptable for a household-scoped flat-hunting tool: the blast radius
  of "an ex-member can still *read* the household's apartments for up to a day" is low,
  and eliminating it entirely would mean a database read on every request.

**Re-check trigger:** if the app ever handles data where 24h of stale read access to a
removed member is unacceptable, shorten `maxAge` or move to database-backed sessions
(`session.strategy: "database"`) — the adapter is already in place for it.

### Accepted: this release requires a fresh database

Migration 0011 adds `household_id NOT NULL` with no default to `apartments`, `ratings`,
`locations_of_interest`, and `apartment_distances`. SQLite only permits a `NOT NULL`
column addition with no default on a table that is empty. There is no data migration
that can fill it in for existing rows: pre-tenancy data belongs to no household, and
assigning it to whichever account happens to sign in first would hand that account
someone else's data.

`src/lib/db/migrate.ts` runs a preflight check (`preflightTenancyMigration`) before the
migrator runs. On a legacy database that still holds pre-tenancy rows, it throws an
error that names the four tables to empty, instead of letting the migration fail with
SQLite's opaque "Cannot add a NOT NULL column with default value NULL". Concretely:

- **Upgrading in place does not merely lose data access — the application will not
  boot.** `src/instrumentation.ts` runs migrations at startup, so a self-hoster who
  deploys this release over an existing database gets a crash loop, not a degraded
  app, until `apartments`, `ratings`, `locations_of_interest`, and
  `apartment_distances` are emptied.
- **The abort is atomic.** The whole migration chain rolls back; existing data is
  untouched by the failed attempt. Nothing is silently dropped or partially migrated.
- **For the hosted deployment, the database must be wiped *before* deploying this
  change, not after** — deploying first means the very first request triggers the
  boot-time migration and the crash loop above.

**Re-check trigger:** none expected — this is a one-time migration break tied to this
specific release, not a recurring pattern.

### Accepted: three deployment footguns, found in review and left as documentation

Each was considered for a code fix and declined — see the reasoning below — so watch
for them by hand when configuring a deployment.

- **A CLIENT_ID without its CLIENT_SECRET breaks sign-in entirely, silently.**
  `src/auth.ts` registers the Google/GitHub providers based on `GOOGLE_CLIENT_ID` /
  `GITHUB_CLIENT_ID` alone, not the paired `_SECRET`. It also drops the credentials
  (password) fallback the moment either CLIENT_ID is set, on the theory that OAuth is
  now configured. If only the ID half of a pair is set, the result is a registered
  OAuth provider that fails on first use *and* no working fallback — nobody can sign
  in. Not fixed in code because validating "both halves of a pair or neither" adds
  boot-time validation logic for a misconfiguration that a deployment checklist item
  catches just as well; see AGENTS.md's Auth section.
- **OAuth callback URLs must be registered with Google/GitHub before deploying.**
  Nothing in local development exercises the real callback URL, so a missing or
  mismatched registration is invisible until the first real user's browser hits the
  provider's redirect in production. This is inherent to how OAuth works, not
  something this codebase can detect for itself — it's a pre-deploy checklist item,
  not a code fix.
- **A stale browser tab can hit a 400 on blob upload during the deploy window.**
  `src/app/api/parse-pdf/upload-token/route.ts` rejects a non-canonical pathname
  outright (see the comment on `onBeforeGenerateToken`). The current client always
  sends an already-canonical pathname, so this only bites a tab that is still running
  the *previous* JS bundle across a deploy — if that old bundle sends a raw pathname
  for a filename containing a space or a non-ASCII character, the request that used
  to succeed now gets a 400. It resolves itself on reload (the new bundle canonicalizes
  before calling upload()) and fails loudly with a visible error rather than silently
  writing to the wrong place, so it wasn't worth relaxing the server-side check for.

### Considered and declined: sanitizing the guide page

`src/app/guide/page.tsx` renders `src/content/guide.md` through `remark-html` into
`dangerouslySetInnerHTML`. The markdown is checked into this repo, so there is no
untrusted input path, and adding `isomorphic-dompurify` would pull jsdom into the
server bundle for a hypothetical risk. If the guide ever becomes editable from outside
the repo, sanitize at that point.

## Accepted npm audit advisories

This section lists `npm audit` advisories that have been intentionally left unfixed, with rationale. Re-evaluate on every dependency bump and when upstream patches are released.

Last reviewed: 2026-05-09 (issue #132).



### esbuild ≤0.24.2 — GHSA-67mh-4wv8-2f99 (moderate, dev-only)

> esbuild enables any website to send any requests to the development server and read the response.

**Path:** `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild`.

**Why we accept:** Latest stable `drizzle-kit` (0.31.10) still depends on the `@esbuild-kit/*` chain. There is no published version that drops it; the migration is in progress upstream. The vulnerability requires an attacker to reach a developer's local esbuild dev server, which we never run — `drizzle-kit` only invokes esbuild inline during `db:generate` / `db:push` / `db:studio`.

**Re-check trigger:** drizzle-kit 1.x stable release (currently in beta/rc).

### postcss <8.5.10 — GHSA-qx2v-qp2m-jg93 (moderate, build-only)

> PostCSS has XSS via Unescaped `</style>` in its CSS Stringify Output.

**Path:** `next → postcss` (the copy bundled inside next, not our top-level postcss which is patched).

**Why we accept:** `npm audit fix --force` would downgrade `next` to `9.3.3` (an 8-year-old release). The advisory only fires when CSS containing attacker-controlled input is round-tripped through postcss's stringifier — we don't do that anywhere. Waiting for Next.js to bump its bundled postcss.

**Re-check trigger:** Next.js patch release that bumps the bundled postcss to ≥ 8.5.10.
