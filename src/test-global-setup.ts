import fs from "node:fs";
import path from "node:path";

// Use a dedicated sqlite file for tests so we don't trample the dev DB
// (and so CI gets a fresh DB that runs every migration cleanly).
process.env.LOCAL_DB_URL = "file:./data/test.db";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const testDbPath = path.join(dataDir, "test.db");
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const { runMigrations } = await import("./lib/db/migrate");

export async function setup() {
  await runMigrations();
}
