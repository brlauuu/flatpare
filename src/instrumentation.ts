export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
