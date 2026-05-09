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

## Auth
- Shared-password + display-name model (no real accounts). See `src/lib/auth.ts` and `src/app/api/auth/`.
- The shared password lives in the **`APP_PASSWORD` env var**. `verifyPassword(input)` compares the submitted value against it.
- On a successful match, two cookies are set:
  - **`flatpare-auth=true`** — httpOnly; `isAuthenticated()` checks this and returns a boolean.
  - **`flatpare-name=<display-name>`** — readable from client JS; `getDisplayName()` returns the value or `null`.
- Server routes gate access by calling `isAuthenticated()` and return **401** on failure. There is no shared `requireUser()` helper — don't add one without discussion.
- `DISABLE_SECURE_COOKIES` (any truthy value) drops the `Secure` flag so cookies work over plain HTTP in dev.

## File uploads
- Files larger than ~4.5 MB **must** use `src/lib/upload-pdf.ts` (client-direct Vercel Blob upload via `/api/parse-pdf/upload-token`). Multipart-POSTing big bodies through serverless routes hits the body limit.
- Smaller uploads and the local-disk fallback go through `src/lib/storage.ts`.

## Dev server
- `npm run dev` and `npm run start` listen on **port 3002** (not the Next.js default 3000); both scripts pass `-p 3002`.
- In Docker the container's Next.js server runs on the standalone-image default of **3000**; `docker-compose.yml` publishes it to the host on `${PORT:-3002}` (i.e. host `3002` → container `3000`). Override the host port with `PORT=...` if 3002 is taken; the container side is fixed.
