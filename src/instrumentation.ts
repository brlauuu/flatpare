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

  // Say which AI backend reads PDFs, and whether it is held to zero data
  // retention (#333). The landing page states zero data retention for the
  // hosted service, so this line is where a misconfigured deployment shows.
  // An invalid AI_* value throws here and fails boot, like FLATPARE_ENCRYPTION.
  const { readAiConfig, describeAi } = await import("@/lib/ai-provider");
  console.log(`[ai] ${describeAi(readAiConfig())}`);

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
