#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// Migrates through the app's own path — preflights, migrator, encryption
// stamp — so a deploy that cannot migrate fails HERE, with the preflight's
// message, rather than going live and failing at the first cold start. Not
// `drizzle-kit migrate`: that bypassed the preflights and swallowed the error
// (#211). The gate is truthiness, matching src/lib/db/target.ts: an
// explicitly empty value means "no cloud database", so a build without one
// (a self-host image, a CI build) skips this and the runtime hook migrates
// the local file at boot instead.
if (process.env.TURSO_DATABASE_URL) {
  console.log("[vercel-build] applying migrations to Turso");
  run("npx", ["tsx", "scripts/migrate.ts"]);
} else {
  console.log(
    "[vercel-build] TURSO_DATABASE_URL not set; skipping drizzle migrations"
  );
}

run("npx", ["next", "build"]);
