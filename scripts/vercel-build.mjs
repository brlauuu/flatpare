#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

if (process.env.TURSO_DATABASE_URL) {
  console.log("[vercel-build] applying drizzle migrations to Turso");
  run("npx", ["drizzle-kit", "migrate"]);
} else {
  console.log(
    "[vercel-build] TURSO_DATABASE_URL not set; skipping drizzle migrations"
  );
}

run("npx", ["next", "build"]);
