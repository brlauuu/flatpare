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
- Shared `APP_PASSWORD` cookie + display-name model (no real accounts). See `src/lib/auth.ts` and `src/app/api/auth/`.
- Server routes use the `requireUser()` pattern to gate access.
- `DISABLE_SECURE_COOKIES=1` bypasses the Secure flag for plain-HTTP dev.

## File uploads
- Files larger than ~4.5 MB **must** use `src/lib/upload-pdf.ts` (client-direct Vercel Blob upload via `/api/parse-pdf/upload-token`). Multipart-POSTing big bodies through serverless routes hits the body limit.
- Smaller uploads and the local-disk fallback go through `src/lib/storage.ts`.

## Dev server
- Runs on **port 3002**, not 3000 (`dev` and `start` scripts in `package.json`). Same in Docker.
