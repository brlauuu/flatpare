export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Say which database this process is talking to, before anything touches
  // it. `.env.local` sets TURSO_DATABASE_URL, so `npm run dev` writes to
  // production unless it is explicitly cleared, and the local
  // data/flatpare.db file on disk suggests otherwise (#195). One line at boot
  // makes that obvious in the first second rather than several steps later.
  const { resolveDbTarget, dbTargetWarning } = await import("@/lib/db/target");
  const target = resolveDbTarget();
  console.log(`[db] ${target.label}`);
  const warning = dbTargetWarning(target);
  if (warning) console.warn(`[db] WARNING: ${warning}`);

  const { runMigrations } = await import("@/lib/db/migrate");
  try {
    await runMigrations();
  } catch (err) {
    // Don't swallow — Next.js will otherwise log this only at debug level and
    // we'd be flying blind, the way 0008 was missed in prod.
    console.error("[instrumentation] runMigrations failed:", err);
    throw err;
  }
}
