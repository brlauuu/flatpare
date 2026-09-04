<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repo conventions

## Stack
- **Next.js 16** App Router. Files to be aware of:
  - `src/proxy.ts` — auth gate (this is what was `middleware.ts` before Next.js 16; don't recreate `middleware.ts`).
  - `src/instrumentation.ts` — boot-time hook (runs DB migrations).
  - API routes live under `src/app/api/.../route.ts` (route handlers, not pages).
- **React 19**, **Tailwind 4**, shadcn/ui (generated components in `src/components/ui/`).

## Database
- **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`). Schemas in `src/lib/db/schema.ts`, migrations in `drizzle/`.
- Connection via **libSQL** (`@libsql/client`) — Turso in cloud mode, local SQLite file otherwise.
- Scripts: `npm run db:generate`, `db:migrate`, `db:push`, `db:studio`.
- Relevant env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `LOCAL_DB_URL` (defaults to `file:./data/flatpare.db`; tests point at `file:./data/test.db`).

## Tests
- **Vitest, not Jest.** Don't reach for Jest patterns — they break here.
- Config: `vitest.config.ts`. Setup: `src/test-global-setup.ts` (env) and `src/test-setup.ts` (per-test).
- Tests live in co-located `__tests__/` directories next to the source.
- `npm test` runs once; `npm run test:watch` watches.
- `npm run typecheck` (`tsc --noEmit`) is enforced in CI alongside lint. `next build` does not typecheck test files, so this is what catches type errors in `__tests__/`.
- **Coverage thresholds are enforced in CI** via `vitest.config.ts`: lines ≥ 80, statements ≥ 80, functions ≥ 78, branches ≥ 75. These apply to the covered set — `vitest.config.ts` has no `coverage.all`/`include`, so only files actually imported by a test are counted. A breached floor across that covered set does fail the build; a wholly new file with zero tests isn't pulled into the average and won't trip it on its own.
- Two paths are excluded from the coverage count: `src/components/ui/**` (shadcn primitives — vendored, re-emitted by the CLI) and `src/lib/db/schema.ts` (Drizzle table declarations, no executable logic). Don't write tests targeting those files.

## Auth
- **Auth.js v5** (`next-auth@5.0.0-beta`), configured in `src/auth.ts`, which exports `handlers`, `auth`, `signIn`, `signOut`. Sessions are real accounts backed by the `users`/`accounts`/`sessions` tables (`src/lib/db/schema-auth.ts`) via `@auth/drizzle-adapter` — there is no shared password gating the whole app and no display-name-as-identity model any more.
- **Two provider paths**, decided at boot from env vars (`src/auth.ts`):
  - **OAuth (Google / GitHub)** — registered whenever `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID` is set. This is the hosted-tier path.
  - **Credentials (shared password)** — registered only when **neither** OAuth client ID is set, so self-hosters get `docker compose up` working with zero third-party setup, and the password path can never be a back door once OAuth is configured. `verifyPassword(input)` (`src/lib/auth.ts`) does the constant-time comparison against `APP_PASSWORD`; on success the provider upserts a single `self-hosted@flatpare.local` account.
  - `src/auth.ts` also exports `enabledProviderIds`, the same env-driven list, so `src/app/page.tsx` (a server component) can decide which sign-in buttons to render without any env var being read in client-shipped code.
- **Sessions are JWTs, capped at 24h** (`session.maxAge` in `src/auth.ts`), deliberately short of the library's 30-day default: a member removed from a household keeps read access until their token expires, so the window is bounded and small. The `jwt`/`session` callbacks stamp `householdId` and `role` onto the token at sign-in via `resolveHouseholdForUser` / `assertMembership` (`src/lib/household.ts`) — those aren't re-resolved on every request, which is what makes the 24h cap load-bearing. Destructive operations and bulk/create handlers re-check membership against the database directly rather than trusting the token's staleness window; see `docs/security-notes.md`.
- **`src/proxy.ts` is the primary gate.** It calls `auth()` and requires both a user id and a `householdId` on the session; page routes redirect to `/`, `/api/*` routes get a JSON 401. `/api/auth/*` is allow-listed **wholesale** — Auth.js owns that namespace end to end (sign-in, callback, session, CSRF), and partially gating it breaks the sign-in flow itself. The matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and the PWA assets (`manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`) — browsers fetch a manifest **without credentials**, so gating it makes the app silently uninstallable.
- **`src/lib/session.ts` exports `requireHousehold()`** — the shared authentication *and* tenant-scope check for route handlers. It reads the session, throws `UnauthorizedError` (from `src/lib/household.ts`) when there's no authenticated household, and otherwise returns `{ householdId, userId, role }`. Every data route calls it as defense-in-depth, since the proxy allow-lists `/api/auth/*` wholesale and route handlers are the last line for anything under it.
- There is no shared `requireUser()` helper distinct from `requireHousehold()` — don't add one without discussion; this app has no concept of an authenticated user without a household.
- **No `DISABLE_SECURE_COOKIES` var any more.** `@auth/core` sets its session cookie's `Secure` flag from the request URL's protocol (`url.protocol === "https:"`) unless `useSecureCookies`/`cookies` is explicitly configured in `src/auth.ts`, which it isn't — so plain-HTTP self-hosting (`docker compose up`, no `AUTH_URL`) already gets a non-Secure cookie with no env var needed. The old shared-password cookie set this by hand; nothing in the app reads `DISABLE_SECURE_COOKIES` any more.
- **Accepted security advisories and the auth model's known limits** are documented in `docs/security-notes.md` — check there before chasing a `npm audit` warning or re-litigating the JWT staleness window.
- **Known deployment footguns, deliberately not fixed in code — watch for them by hand:**
  - Provider registration in `src/auth.ts` is gated on `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID` only, **not** the matching `_SECRET`. Setting a CLIENT_ID without its CLIENT_SECRET registers a broken OAuth provider *and* suppresses the credentials fallback (since `hasOAuth` is now true) — nobody can sign in at all. Always set both halves of a pair together.
  - OAuth callback URLs must be registered with Google and GitHub **before** deploying (production domain and every Vercel preview URL). Nothing fails locally to warn you if this is skipped — the first production sign-in just fails at the provider's redirect.
- **Upgrading from the shared-password release requires a fresh database.** Migration 0011 adds `household_id NOT NULL` with no default to `apartments`, `ratings`, `locations_of_interest`, and `apartment_distances` — SQLite only permits that on an empty table. `src/lib/db/migrate.ts` runs a preflight check that throws an actionable error naming those four tables instead of letting the migrator fail opaquely; the abort is atomic and existing data is untouched, but **the application will not boot** until they're emptied, because `src/instrumentation.ts` runs migrations at startup. For the hosted deployment, wipe the database *before* deploying this change, not after — see `docs/security-notes.md`.

## PWA
- `src/app/manifest.ts` is the web app manifest (Next's `MetadataRoute.Manifest`, served at `/manifest.webmanifest`) — not a static file in `public/`.
- Icons in `public/` are generated from `public/flatpare_logo.svg` by cropping the square mark out of the wordmark. `icon-maskable-512.png` keeps the mark inside Android's safe zone; `apple-touch-icon.png` exists because iOS ignores the manifest's icons.
- `theme_color` / `background_color` mirror `--primary` / `--background` from `globals.css`, converted from oklch to hex. Update both together.
- **There is deliberately no service worker.** Under E2EE an offline shell can't show real data, and a stale cached shell is a hard failure to debug remotely. See `docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md`.

## Architecture checks (enola)

- The baseline is pinned at the E1 merge (`dad02e1`), which **accepts one module
  cycle**: `src/auth.ts` imports `@/lib/household`, and `src/lib/session.ts`
  imports `@/auth`. At file level the graph is acyclic — that split exists
  deliberately, to stop `auth.ts` and `household.ts` importing each other — but
  at directory-module level `src` and `src/lib` now point both ways. It replaced
  a pre-existing cycle inside `src/lib`, so it is a lateral trade, and
  `src/auth.ts` lives at the top level because Auth.js expects it there.
- **Grade architectural changes with `enola check --fail-on=cycles`.** Only
  findings that are *new* against the pinned baseline fail, so the accepted cycle
  above passes and a newly introduced one does not.
- This is a convention, not a gate: `--fail-on` is a flag on `enola check`, and
  neither `mcp-arch.yaml` nor the session Stop hook is known to carry it. CI does
  not run enola (the binary is not installed there). If you want hard
  enforcement, that is the gap to close.
- Re-pin with `enola baseline pin` after a deliberate structural change, or the
  next run grades against a stale architecture.

## File uploads
- Files larger than ~4.5 MB **must** use `src/lib/upload-pdf.ts` (client-direct Vercel Blob upload via `/api/parse-pdf/upload-token`). Multipart-POSTing big bodies through serverless routes hits the body limit.
- Smaller uploads and the local-disk fallback go through `src/lib/storage.ts`.
- Cloud Blob mode requires `BLOB_READ_WRITE_TOKEN` (auto-set by Vercel). Without it, the upload-token probe reports `{ enabled: false }` and the client falls back to multipart through `/api/parse-pdf`.

## Cloud-mode env vars
Beyond auth + Turso, the following keys gate cloud features. If any is unset, the feature degrades cleanly to manual entry / no-op:

- `BLOB_READ_WRITE_TOKEN` — Vercel Blob (file storage). See File uploads above.
- `GOOGLE_GENERATIVE_AI_API_KEY` — Gemini 2.5 Flash for PDF extraction (`src/lib/parse-pdf.ts`). Without it, `/api/parse-pdf` falls back to manual entry.
- `GOOGLE_MAPS_API_KEY` — Geocoding + Distance Matrix + Maps Embed (`src/lib/geocode.ts`, `distance.ts`, `map-embed.ts`). See `docs/google-apis.md` for which APIs to enable.
- `OPENROUTESERVICE_API_KEY` — bike-distance fallback when Maps is unset (transit not supported).

## Dev server
- `npm run dev` and `npm run start` listen on **port 3002** (not the Next.js default 3000); both scripts pass `-p 3002`.
- In Docker the container's Next.js server runs on the standalone-image default of **3000**; `docker-compose.yml` publishes it to the host on `${PORT:-3002}` (i.e. host `3002` → container `3000`). Override the host port with `PORT=...` if 3002 is taken; the container side is fixed.
