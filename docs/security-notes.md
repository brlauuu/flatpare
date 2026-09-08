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

## Encryption model — reviewed 2026-09-06 (E2 crypto core)

Spec: `docs/superpowers/specs/2026-09-06-e2-crypto-core-design.md`. What is stored
server-side is ciphertext or public keys only: the wrapped member private key, the
household data key wrapped to each member's public key, and the recovery-wrapped data
key. Passphrases and recovery codes never leave the browser.

### Accepted: the host is honest-but-curious, not actively malicious

A host that substitutes its own public key for a member's during a wrap
(`POST /api/crypto/wraps` reads the target's public key from `member_keys`) would
receive the household data key. Any end-to-end scheme without out-of-band key
verification has this property. The mitigation that would close it — key fingerprints
shown in the UI for members to compare — is a backlog issue, not part of E2.

### Accepted: XSS can use unlocked keys

Unlocked keys are non-extractable `CryptoKey`s in IndexedDB, so a script on the origin
can decrypt with them while the device is unlocked but cannot read the key bytes. That
is the price of once-per-device unlock. *Lock this device* in settings and sign-out both
clear the store.

### Accepted: removed members keep a usable cached key

Removal deletes the wrap row and membership. A removed member who still has the data key
in their device store can decrypt ciphertext they can still fetch during the 24h JWT
window (see the auth section above). E3's ciphertext reads re-check membership against
the database; rotating the data key on removal is a backlog item.

### Accepted: the encryption mode is a property of the database

`FLATPARE_ENCRYPTION` is stamped into `settings` on first boot and compared on every
later boot. `on → off` would leave rows the server cannot read; `off → on` would leave
plaintext the server is supposed to reject. Both are discovered after the deploy, by
users, so the app refuses to boot instead. Changing mode means a fresh database or, once
#191 lands, an export and re-import.

### Accepted: recovery is a single point of loss

A sole member who loses both the passphrase and the recovery code has lost the data;
nobody, including Flatpare, can recover it. The setup screen says so and the recovery
kit requires an explicit acknowledgement before continuing.

Any household member can also regenerate or overwrite that kit through `POST
/api/crypto/recover` or `PUT /api/crypto/recovery`, and the server cannot verify that
the submitted material actually derives from the household data key — so a member can
silently destroy the household's last backup, deliberately or through a broken client.
Members are trusted under this threat model (they can already delete every row), and
the alternative would require the server to hold something it must never hold.

## Encrypted data — reviewed 2026-09-07 (E3 encrypted data model)

Spec: `docs/superpowers/specs/2026-09-07-e3-encrypted-data-model-design.md`. Apartments,
ratings and locations are stored as E2 envelopes sealed with the household data key;
the server scopes, orders and versions rows but never reads them. PDFs are encrypted
client-side before upload. Below are the limits that were accepted, not oversights.

### Accepted: the server sees metadata

Ids, `household_id`, `created_at`/`updated_at`, `version`, a location's `sort_order`,
and `(apartment_id, user_id)` on ratings are plaintext because the server needs them to
scope, order and upsert. So the host can see how many apartments a household has, when
each was created and last edited, which member rated which apartment and when, how many
locations of interest exist and their order, and the byte size of each stored PDF. None
of it says *what* an apartment is. The short code was moved inside the envelope for
exactly this reason — it encodes rooms, bathrooms, washing machine and postcode.

### Accepted: whole-row last-write-wins after one retry

An apartment envelope is one value. Two members editing the same apartment at once
race on `version`; the loser gets `409 Stale version`, the store refetches, re-applies
its mutator on the fresh plaintext and retries once. A second conflict in a row
surfaces as an error to the user. Field-level merging would need the server to read the
row; it cannot. Ratings have one writer per row and locations are at most five, so
they carry no version at all.

### Accepted: process endpoints see plaintext in memory

`/api/process/{geocode,distance,check-listing,parse-pdf}` receive one address, one
URL or one PDF per call, forward it to Google or Gemini with the host's keys, and
return the result. They touch no table (each has a test that asserts every row count is
unchanged) and do not log bodies. This is the privacy exception the parent spec
names, and it is documented at the top of each route. E4 hardens it — per-account
rate limits, log scrubbing on every code path, the landing-page disclosure — but does
not remove it: the host cannot geocode what it cannot read. **E4 has now landed; see
the section below for what it changed and what it left standing.**

### Accepted: a removed member can open ciphertext they already fetched

`requireMember()` re-checks the database on every data read, so a removed member's
still-valid JWT stops returning rows immediately. But ciphertext they fetched *before*
removal, and the data key cached in their device store, remain usable offline. Closing
this needs data-key rotation on removal, tracked as #219.

### Accepted: corrupt rows are shown, not hidden

A row whose envelope fails to open or to validate renders as a placeholder marked
*could not be decrypted* with a Delete button, and is excluded from sorting, search and
the compare table. Hiding it would let a corrupted or tampered row disappear silently;
showing it makes tampering visible to every member.


## Blind-proxy hardening — reviewed 2026-09-08 (E4)

E4 did not change what `/api/process/*` is for. It closed three ways the exception
leaked further than it had to.

### Fixed: three log lines carried request content

`geocode.ts` logged the full plaintext address on a no-result, and both of its
fetch-failure paths logged `err.message` — which for a fetch error *is* the outbound
URL, carrying the address and `GOOGLE_MAPS_API_KEY` together in the query string.
`apiErrorResponse` dumped the whole error object for every route, process routes
included. `scrubbedErrorLine` (`src/lib/log-scrub.ts`) now reduces an error to its
class plus a numeric status for any `process:` tag; data routes are unchanged, since
the envelope is opaque to the server and their errors carry nothing sensitive.

`src/app/api/process/__tests__/no-leak.test.ts` drives all four routes on success and
failure paths with marked plaintext while capturing every console channel, and
compares every table's row count against a baseline. Its serializer expands an
Error's message, stack and cause — `JSON.stringify(new Error("secret"))` is `"{}"`,
so the obvious version of that test asserts nothing.

### Accepted: `reason` strings from Google and ORS reach the client and the log

The geocoder returns the provider's own `status` and `error_message` to the client as
`reason`, and logs it. This is provider text about the request's *outcome*
("ZERO_RESULTS", "REQUEST_DENIED"), not an echo of the address. If a provider ever
starts quoting the input back in that field, the scrub in
`tryGoogleGeocodeLatLng` is the line to revisit.

### Accepted: `process_usage` is a table the process routes write

E4's own requirement is that no plaintext is persisted at any layer, and the rate
limiter is a counter, so this is not in tension: `process_usage` holds a household id,
an endpoint name, an hour bucket and an integer. Nothing in it derives from an
address, a URL or a PDF. Both the schema comment and a migration test assert the
column list so a future column is a deliberate decision rather than a drift.

### Accepted: rate limits are unlimited by default

`PROCESS_RATE_LIMIT_PER_HOUR` unset means no limit and no row written. That is the
self-hoster's default — `docker compose up` must work with no configuration, and a
self-hoster spends their own Gemini and Maps keys. The hosted deployment sets an
explicit value. The consequence is that a fresh self-hosted install has no ceiling on
its own API spend until the operator sets one.

Windows are fixed hours, not sliding. A caller can therefore spend two full
allowances across a window boundary. That is the standard fixed-window trade and is
acceptable when the goal is bounding a monthly bill rather than smoothing load.

### Fixed: blind SSRF in the listing probe (#199)

`checkListingUrl` fetched an arbitrary user-supplied URL with no scheme allowlist, no
private-address block, and `redirect: "follow"`. Before E1 the caller needed the
shared password; open registration turned it into a port and host oracle against
whatever the deployment can reach — small on Vercel, not small for a self-hosted
container on a home LAN. `src/lib/safe-url.ts` now enforces an http(s) allowlist and
rejects RFC1918, loopback, link-local (cloud metadata), CGNAT, benchmarking,
TEST-NET, multicast and reserved ranges, IPv6 loopback/link-local/ULA, and
IPv4-mapped IPv6. Redirects are walked by hand, five hops maximum, each re-validated:
`follow` only ever checked the URL we started with.

### Accepted: DNS rebinding between the lookup and the fetch

`assertPublicHttpUrl` resolves the hostname and refuses if any answer is private, but
the connection is made by name a moment later, so a resolver that answers differently
the second time defeats it. Closing this needs a custom agent that pins the
connection to the address that was validated, which breaks TLS SNI and name-based
virtual hosting. The residual is a one-request-per-rebind oracle against an attacker
who controls a DNS zone — materially harder than the original bug and the same
posture most HTTP clients take.

### Accepted: an unparseable address counts as private

`isPrivateAddress` answers `true` for anything it cannot parse. A hostname is only
ever tested after resolution, so this costs nothing in practice; the alternative —
defaulting to "public" on an input we do not understand — is the wrong way to be
wrong.
