// Applies the database migrations through the SAME path the app uses at boot
// (src/instrumentation.ts → runMigrations → applyMigrations): the preflights
// that refuse to migrate a populated legacy database, the drizzle migrator,
// and the encryption-mode stamp. One function, two call sites (#211).
//
// scripts/vercel-build.mjs runs this at build time so a deploy that cannot
// migrate fails the BUILD with the preflight's actionable message, instead of
// going live and failing at the first cold start. It replaced `drizzle-kit
// migrate`, which bypassed every preflight and — worse — swallowed the
// underlying error: two production builds on 2026-09-17 died in that step
// with nothing but "exited with 1" in the log.
//
// Run by `npx tsx`, which resolves the `@/` alias from tsconfig.json.
//
//   npx tsx scripts/migrate.ts
//
// Targets whatever TURSO_DATABASE_URL / LOCAL_DB_URL say, exactly like the
// app; the target is printed first, like the boot log line.
import { resolveDbTarget } from "@/lib/db/target";
import { runMigrations } from "@/lib/db/migrate";

async function main(): Promise<void> {
  console.log(`[migrate] ${resolveDbTarget().label}`);
  await runMigrations();
  console.log("[migrate] migrations applied");
}

main().catch((err: unknown) => {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
