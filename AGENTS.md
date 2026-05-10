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
- **Coverage thresholds are enforced in CI** via `vitest.config.ts`: lines ≥ 80, statements ≥ 80, functions ≥ 78, branches ≥ 75. New code without tests will fail the build.

## Auth
- Shared-password + display-name model (no real accounts). See `src/lib/auth.ts` and `src/app/api/auth/`.
- The shared password lives in the **`APP_PASSWORD` env var**. `verifyPassword(input)` compares the submitted value against it.
- On a successful match, two cookies are set:
  - **`flatpare-auth=true`** — httpOnly; `isAuthenticated()` checks this and returns a boolean.
  - **`flatpare-name=<display-name>`** — readable from client JS; `getDisplayName()` returns the value or `null`.
- **`src/proxy.ts` is the primary gate.** It enforces auth on every page route (redirect → `/`) and every `/api/*` path (JSON 401), with `/api/auth/*` allow-listed for the login flow. The matcher only excludes `_next/static`, `_next/image`, and `favicon.ico`.
- Route handlers may add an explicit `if (!(await isAuthenticated())) return unauthorized()` as defense-in-depth (already done on `/api/apartments/[id]`); prefer this for routes that hit paid third-party APIs or grant write tokens.
- There is no shared `requireUser()` helper — don't add one without discussion.
- `DISABLE_SECURE_COOKIES` (any truthy value) drops the `Secure` flag so cookies work over plain HTTP in dev.
- **Accepted security advisories** are documented in `docs/security-notes.md` — check there before chasing a `npm audit` warning.

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
