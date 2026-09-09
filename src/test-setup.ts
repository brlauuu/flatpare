import fs from "node:fs";
import path from "node:path";
import { configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// testing-library's waitFor/findBy default to a 1000ms ceiling, which was
// comfortable when test files ran one at a time and is not when 16 run at
// once under v8 coverage instrumentation. One run of
// household-data-provider.test.tsx failed that way (a waitFor resolved late
// enough that the assertion after it saw pre-load state) in 1 of 7 coverage
// runs; 0 of 6 plain runs. Raising the ceiling weakens no assertion — an
// expectation that is never going to hold still fails, just later.
configure({ asyncUtilTimeout: 5000 });

// Give this test file its own database (#202).
//
// The real-database suites used to share one libSQL file, which produced ~36
// SQLITE_BUSY failures under file parallelism and forced
// `fileParallelism: false` — serializing the suite from ~22s to ~85s. A
// private copy per file removes the contention instead of avoiding it.
//
// The copy is of the already-migrated template built once by
// src/test-global-setup.ts, so this costs a file copy rather than a migration
// chain. Keyed on the pid because vitest runs each test file in its own
// process under `isolate: true`; a pid is therefore unique among the files
// running concurrently, which is the only uniqueness required.
//
// This must run before the test file's imports: `src/lib/db` reads
// LOCAL_DB_URL at module load.
const dataDir = path.join(process.cwd(), "data");
const dbFile = `test-${process.pid}.db`;
const dbPath = path.join(dataDir, dbFile);

process.env.LOCAL_DB_URL = `file:./data/${dbFile}`;

for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
fs.copyFileSync(path.join(dataDir, "test-template.db"), dbPath);
