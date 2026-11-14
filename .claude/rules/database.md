---
paths:
  - "src/lib/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
  - "scripts/migrate.ts"
  - "scripts/vercel-build.mjs"
  - "src/instrumentation.ts"
---

# Database

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/database.md](../../docs/agents/database.md); read it before a non-trivial change here.

- **Drizzle ORM** over **libSQL**: schemas in `src/lib/db/schema.ts`, migrations in `drizzle/`, scripts `db:generate`, `db:migrate`, `db:push`, `db:studio`.
- **`npm run dev` writes to a remote Turso database** (`flatpare-dev`, shared state) because `.env.local` sets `TURSO_DATABASE_URL`; the target is decided by its *truthiness* (`resolveDbTarget`, `src/lib/db/target.ts`). Local file: `TURSO_DATABASE_URL= npm run dev`. The `[db]` boot line names the host; never print the URL's query or the token.
- **Migrations run at boot and at Vercel build** (`scripts/vercel-build.mjs` → `scripts/migrate.ts` → `runMigrations`, with the preflights). Releasing a migration applies it to production. Preflights in `src/lib/db/migrate.ts` throw actionable errors instead of letting a migration fail opaquely (old plaintext tables holding rows, duplicate user emails, unset encryption mode on a non-empty DB).
- **Encryption mode is stamped into `settings` on first boot** and boot fails if `FLATPARE_ENCRYPTION` later disagrees; a non-empty DB with the mode unset refuses to pick one. Changing mode means a fresh database (or export/import).
- Every migration's purpose and preflight is listed in the detail file. New empty tables need no preflight; say so in the detail file when you add one.
