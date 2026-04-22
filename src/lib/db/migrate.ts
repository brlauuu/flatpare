import path from "node:path";
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

export async function applyMigrations(client: Client): Promise<void> {
  await ensureListingUrlColumn(client);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
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
