import fs from "node:fs";
import path from "node:path";

// Builds the template database the workers copy, and clears the previous
// run's files (#202).
//
// Migrating ONCE here and copying the result is what makes parallelism cheap.
// The obvious alternative — each worker migrating its own file — was measured
// and rejected: vitest spawns a fresh process per test file under
// `isolate: true`, so neither VITEST_WORKER_ID nor process.pid is stable
// across files, and every one of the 101 files ended up running the full
// migration chain (~105s of cumulative setup for a 54s run). A file copy of a
// freshly migrated SQLite database is milliseconds.
const dataDir = path.join(process.cwd(), "data");
const TEMPLATE = path.join(dataDir, "test-template.db");

function clearWorkerFiles() {
  if (!fs.existsSync(dataDir)) return;
  for (const entry of fs.readdirSync(dataDir)) {
    // Per-worker copies and libSQL's -wal/-shm siblings, plus the single
    // shared file this scheme replaced.
    if (/^test-\d+\.db(-wal|-shm)?$/.test(entry) || /^test\.db(-wal|-shm)?$/.test(entry)) {
      fs.rmSync(path.join(dataDir, entry), { force: true });
    }
  }
}

export async function setup() {
  fs.mkdirSync(dataDir, { recursive: true });
  clearWorkerFiles();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${TEMPLATE}${suffix}`, { force: true });
  }

  const { createClient } = await import("@libsql/client");
  const { applyMigrations } = await import("./lib/db/migrate");
  const client = createClient({ url: "file:./data/test-template.db" });
  try {
    // applyMigrations rather than runMigrations: the latter memoizes into a
    // module-level promise, and a primed cache would make
    // src/lib/db/__tests__/migrate.test.ts's own call a no-op.
    await applyMigrations(client);
  } finally {
    client.close();
  }
}

export async function teardown() {
  clearWorkerFiles();
}
