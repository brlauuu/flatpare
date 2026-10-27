// Which database the app is talking to, resolved once and described in a
// form that is safe to print.
//
// This exists because `npm run dev` silently writes to a remote database:
// `.env.local` sets TURSO_DATABASE_URL, `isCloud` is a truthiness check on it,
// and the presence of `data/flatpare.db` on disk actively suggests the
// opposite of what is happening. On 2026-09-02 three test apartments and a
// display name were seeded into the production database on that inference
// (#195). `.env.local` has named the separate `flatpare-dev` database since
// 2026-09-19, but it is still shared, remote state.
//
// The resolution and the description live together on purpose: `src/lib/db`
// creates its client from this, and `src/instrumentation.ts` logs from the
// same value, so the line printed at boot cannot drift from the connection
// actually opened. Deriving the label separately would be the same
// "check one string, use another" shape this codebase has been bitten by
// before.

export interface DbTarget {
  kind: "cloud" | "local";
  url: string;
  authToken?: string;
  // Safe to print: never contains the auth token, and for a cloud target
  // carries only the host, never the full URL.
  label: string;
}

// A Turso URL can carry credentials in its query string, so only the host is
// ever surfaced. An unparseable URL yields a placeholder rather than an echo
// of the raw value — printing something we failed to parse is how a token
// ends up in a log.
function cloudLabel(rawUrl: string): string {
  try {
    return `Turso (cloud) — ${new URL(rawUrl).host}`;
  } catch {
    return "Turso (cloud) — <unparseable url>";
  }
}

export function resolveDbTarget(env: NodeJS.ProcessEnv = process.env): DbTarget {
  // Truthiness, matching the original: an explicitly empty TURSO_DATABASE_URL
  // is how a developer overrides .env.local for a local-only run.
  if (env.TURSO_DATABASE_URL) {
    return {
      kind: "cloud",
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
      label: cloudLabel(env.TURSO_DATABASE_URL),
    };
  }
  const url = env.LOCAL_DB_URL ?? "file:./data/flatpare.db";
  return { kind: "local", url, label: `local file — ${url}` };
}

// The combination that is almost always a mistake: a development or test
// process pointed at a cloud database. Which one it is cannot be told from
// here (a dev database and production look alike), so the warning names the
// host and says the writes are remote, never which database they reach.
// Returns null when there is nothing to warn about.
export function dbTargetWarning(
  target: DbTarget,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (target.kind !== "cloud") return null;
  if (env.NODE_ENV === "production") return null;
  return (
    `NODE_ENV=${env.NODE_ENV ?? "undefined"} but the database is CLOUD ` +
    `(${target.label}), not a local file. Writes from this process change ` +
    "that remote database. Run with an explicitly empty TURSO_DATABASE_URL " +
    "to use the local file instead: " +
    "`TURSO_DATABASE_URL= npm run dev`"
  );
}
