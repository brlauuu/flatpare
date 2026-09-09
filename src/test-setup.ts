import fs from "node:fs";
import path from "node:path";
import { configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// testing-library's waitFor/findBy ceiling. 2000ms rather than the 1000ms
// default — not to mask a race (#227 removed the three that existed), but
// because CI runners are slower and more contended than a 16-core dev box and
// 1000ms is tight for a component that renders after a decrypt.
//
// This is no longer load-bearing: the flakes it was introduced to hide were
// a DOM/effect observation split, an uncancelled navigation timer leaking
// across tests, and two synchronous queries against asynchronously-opened
// popovers. All three are fixed at the source, so lowering this back to the
// default should now be a no-op rather than a way to reintroduce them.
configure({ asyncUtilTimeout: 2000 });

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
