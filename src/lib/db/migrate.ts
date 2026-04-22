import path from "node:path";
import fs from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

let cachedPromise: Promise<void> | null = null;

async function ensureListingUrlColumn(client: Client): Promise<void> {
  // Repair legacy databases (pre-PR #23) where `apartments` predates
  // `listing_url`. Our baseline migration uses CREATE TABLE IF NOT EXISTS,
  // which is a no-op on existing tables and therefore can't add the column.
  const tables = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='apartments'",
    args: [],
  });
  if (tables.rows.length === 0) return;

  const cols = await client.execute({
    sql: "PRAGMA table_info(apartments)",
    args: [],
  });
  const hasListingUrl = cols.rows.some((row) => row.name === "listing_url");
  if (hasListingUrl) return;

  await client.execute({
    sql: "ALTER TABLE apartments ADD COLUMN listing_url text",
    args: [],
  });
}

async function reconcileHasWashingMachine(client: Client): Promise<void> {
  // PR #42 amended drizzle/0000_initial_schema.sql to include
  // has_washing_machine, so DBs that ran that amended 0000 already have the
  // column but no migration marker for 0002. Without this reconcile, 0002's
  // ALTER TABLE ADD COLUMN would fail with "duplicate column name."
  const apartmentsRes = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='apartments'",
    args: [],
  });
  if (apartmentsRes.rows.length === 0) return;

  const migrationsTableRes = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
    args: [],
  });
  if (migrationsTableRes.rows.length === 0) return;

  const cols = await client.execute({
    sql: "PRAGMA table_info(apartments)",
    args: [],
  });
  const hasColumn = cols.rows.some((r) => r.name === "has_washing_machine");
  if (!hasColumn) return;

  const journalPath = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const entry = journal.entries.find((e) => e.tag === "0002_has_washing_machine");
  if (!entry) return;

  const lastRes = await client.execute({
    sql: "SELECT MAX(created_at) as ts FROM __drizzle_migrations",
    args: [],
  });
  const lastTs = Number(lastRes.rows[0]?.ts ?? 0);
  if (lastTs >= entry.when) return;

  await client.execute({
    sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    args: ["repair-has-washing-machine", entry.when],
  });
}

async function backfillShortCodes(client: Client): Promise<void> {
  // After 0003 adds short_code as nullable, any pre-existing rows need a
  // code. New inserts generate one at POST time; this handles the gap.
  // Idempotent: only rows with NULL short_code are processed.
  const tables = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='apartments'",
    args: [],
  });
  if (tables.rows.length === 0) return;

  const cols = await client.execute({
    sql: "PRAGMA table_info(apartments)",
    args: [],
  });
  const colNames = new Set(cols.rows.map((r) => String(r.name)));
  const required = [
    "short_code",
    "num_rooms",
    "num_bathrooms",
    "has_washing_machine",
    "address",
  ];
  if (required.some((c) => !colNames.has(c))) return;

  const pending = await client.execute({
    sql: `SELECT id, num_rooms, num_bathrooms, has_washing_machine, address
          FROM apartments WHERE short_code IS NULL`,
    args: [],
  });
  if (pending.rows.length === 0) return;

  const { computeShortCodeParts, buildShortCode, pickLetters } = await import(
    "@/lib/short-code"
  );

  for (const row of pending.rows) {
    const input = {
      numRooms:
        row.num_rooms != null ? Number(row.num_rooms) : null,
      numBathrooms:
        row.num_bathrooms != null ? Number(row.num_bathrooms) : null,
      hasWashingMachine:
        row.has_washing_machine == null
          ? null
          : Number(row.has_washing_machine) === 1,
      address:
        typeof row.address === "string" && row.address.length > 0
          ? row.address
          : null,
    };
    const parts = await computeShortCodeParts(input);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = buildShortCode(parts, pickLetters());
      try {
        await client.execute({
          sql: "UPDATE apartments SET short_code = ? WHERE id = ?",
          args: [code, row.id as number],
        });
        break;
      } catch (err) {
        if (
          err instanceof Error &&
          /unique/i.test(err.message) &&
          attempt < 4
        ) {
          continue;
        }
        throw err;
      }
    }
  }
}

export async function applyMigrations(client: Client): Promise<void> {
  await ensureListingUrlColumn(client);
  await reconcileHasWashingMachine(client);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await backfillShortCodes(client);
}

function createDefaultClient(): Client {
  return createClient(
    process.env.TURSO_DATABASE_URL
      ? {
          url: process.env.TURSO_DATABASE_URL,
          authToken: process.env.TURSO_AUTH_TOKEN,
        }
      : {
          url: "file:./data/flatpare.db",
        }
  );
}

export async function runMigrations(): Promise<void> {
  if (cachedPromise) return cachedPromise;

  const client = createDefaultClient();
  cachedPromise = applyMigrations(client)
    .catch((err) => {
      cachedPromise = null;
      throw err;
    })
    .finally(() => {
      client.close();
    });

  return cachedPromise;
}
