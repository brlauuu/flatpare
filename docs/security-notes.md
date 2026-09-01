# Security & dependency notes

## Pinned major versions awaiting upstream

### eslint stays on 9 (10 breaks eslint-config-next)

`eslint@10.3.0` is current, but bumping breaks `eslint-config-next@16.2.6` because the bundled `eslint-plugin-react` calls the now-removed `context.getFilename()` API.

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
```

**Re-check trigger:** new `eslint-config-next` release that ships an `eslint-plugin-react` compatible with the eslint 10 rule API.

## Auth model — reviewed 2026-09-01 (PR #176)

A review of the shared-password auth model found and fixed three issues. Recorded
here so the reasoning survives, and so the remaining limits are explicit.

### Fixed: `/api/auth/*` was entirely unauthenticated

`src/proxy.ts` allow-listed `path.startsWith("/api/auth")` so the login POST could
reach the server. That prefix also matched every sub-route, leaving these open to
anyone:

- `GET /api/auth/users` — list every registered display name.
- `DELETE /api/auth/users/[name]` — delete a user and their ratings.
- `POST /api/auth/name` — write rows into `users` without the password.

The allow-list is now an exact match on `/api/auth`. Other `/api/auth/*` paths and
`/add-user` require the auth cookie but not a display name — that is the step where
the name is chosen, so requiring one would deadlock the login flow. The three route
handlers also call `isAuthenticated()` themselves, per the defense-in-depth pattern.

### Fixed: the auth cookie was a static, forgeable value

`flatpare-auth` was set to the literal string `"true"`, so anyone who knew the cookie
name could set it in their browser and skip the password. It now carries
`HMAC-SHA256(APP_PASSWORD, "flatpare-auth-v1")` (see `src/lib/auth-cookie.ts`), which
cannot be produced without the password. Both the proxy and `isAuthenticated()` verify
it in constant time.

`src/lib/auth-cookie.ts` exists because the proxy cannot import `next/headers`; it
holds the cookie names and HMAC helpers, and nothing else. It is not a general auth
abstraction — see the note in AGENTS.md about not adding one.

Consequences worth knowing:

- **Rotating `APP_PASSWORD` invalidates every session.** The key is the password, so
  changing it logs everyone out. That is usually what you want.
- **Deploying this change logs everyone out once**, since existing `=true` cookies no
  longer verify.
- **`setAuthenticated()` throws if `APP_PASSWORD` is unset**, rather than issuing a
  cookie no one can reproduce.

### Fixed: password comparison was not constant-time

`verifyPassword` used `===`, which short-circuits on the first differing byte. It now
HMACs both sides and compares with `timingSafeEqual`. Hashing first matters:
`timingSafeEqual` throws when buffers differ in length, so comparing the raw strings
would have leaked length and crashed on wrong-length input.

### Accepted: display names are not authenticated

`flatpare-name` is deliberately readable and writable by client JS, and any holder of
the password can claim any name. This is a two-person flat-hunting tool behind one
shared password; names are labels for whose rating is whose, not identities. Ratings
are attributable only as far as everyone with the password is trusted.

**Re-check trigger:** if the app ever gains users who shouldn't be able to act as each
other, this needs real accounts — not a patch to the cookie.

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
