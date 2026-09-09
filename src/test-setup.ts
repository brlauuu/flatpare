import fs from "node:fs";
import path from "node:path";
import "@testing-library/jest-dom/vitest";

// testing-library's waitFor/findBy ceiling, left at the 1000ms default.
//
// It was raised to 5000ms in #226 to hide flakes, then to 2000ms as a comfort
// margin. #227 removed the three actual races — a DOM/effect observation
// split, an uncancelled navigation timer leaking across tests, and two
// synchronous queries against asynchronously-opened popovers — so the margin
// should not be needed. Returned to the default deliberately, to prove that.
//
// If this starts flaking again, the answer is NOT to raise it: find the
// pending work the assertion is racing and give it an anchor. See AGENTS.md,
// Tests, for the two shapes that caused it last time.

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
