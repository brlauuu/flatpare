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

async function migrateLocationsOfInterestBackfill(client: Client): Promise<void> {
  // After 0008 creates `locations_of_interest` and `apartment_distances`,
  // move data over from the legacy single-station setup and drop the old
  // artifacts. Idempotent: only runs when there's nothing in the new tables.
  const newTable = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='locations_of_interest'",
    args: [],
  });
  if (newTable.rows.length === 0) return;

  const existing = await client.execute({
    sql: "SELECT COUNT(*) as n FROM locations_of_interest",
    args: [],
  });
  const alreadyHasLocations = Number(existing.rows[0]?.n ?? 0) > 0;

  if (!alreadyHasLocations) {
    // Determine the default address: prefer app_settings.station_address,
    // fall back to the historical Basel SBB constant.
    let defaultAddress = "Basel SBB, Switzerland";
    const hasSettings = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'",
      args: [],
    });
    if (hasSettings.rows.length > 0) {
      const row = await client.execute({
        sql: "SELECT value FROM app_settings WHERE key = 'station_address' LIMIT 1",
        args: [],
      });
      const value = row.rows[0]?.value;
      if (typeof value === "string" && value.trim() !== "") {
        defaultAddress = value;
      }
    }
    await client.execute({
      sql: "INSERT INTO locations_of_interest (label, icon, address, sort_order) VALUES (?, ?, ?, 0)",
      args: ["Train Station", "Train", defaultAddress],
    });
  }

  // Copy legacy distances into apartment_distances, joining the default
  // location (sort_order = 0). Skip silently if the legacy columns are gone.
  const apartmentsCols = await client.execute({
    sql: "PRAGMA table_info(apartments)",
    args: [],
  });
  const aptColNames = new Set(apartmentsCols.rows.map((r) => String(r.name)));
  if (
    aptColNames.has("distance_bike_min") &&
    aptColNames.has("distance_transit_min")
  ) {
    const distancesEmpty = await client.execute({
      sql: "SELECT COUNT(*) as n FROM apartment_distances",
      args: [],
    });
    if (Number(distancesEmpty.rows[0]?.n ?? 0) === 0) {
      await client.execute({
        sql: `INSERT INTO apartment_distances (apartment_id, location_id, bike_min, transit_min)
              SELECT a.id,
                     (SELECT id FROM locations_of_interest ORDER BY sort_order LIMIT 1),
                     a.distance_bike_min,
                     a.distance_transit_min
              FROM apartments a
              WHERE a.distance_bike_min IS NOT NULL OR a.distance_transit_min IS NOT NULL`,
        args: [],
      });
    }
    await client.execute({
      sql: "ALTER TABLE apartments DROP COLUMN distance_bike_min",
      args: [],
    });
    await client.execute({
      sql: "ALTER TABLE apartments DROP COLUMN distance_transit_min",
      args: [],
    });
  }

  await client.execute({
    sql: "DROP TABLE IF EXISTS app_settings",
    args: [],
  });
}

export async function applyMigrations(client: Client): Promise<void> {
  await ensureListingUrlColumn(client);
  await reconcileHasWashingMachine(client);
  // On Vercel the `drizzle/` folder isn't reliably present in the serverless
  // file trace, so SQL migrations are applied at build time via `drizzle-kit
  // migrate` (see package.json `vercel-build`). Skip the runtime drizzle
  // migrator when the folder is absent — the backfills below are idempotent
  // and only need libsql, no fs.
  if (fs.existsSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"))) {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  await backfillShortCodes(client);
  await migrateLocationsOfInterestBackfill(client);
}

function createDefaultClient(): Client {
  return createClient(
    process.env.TURSO_DATABASE_URL
      ? {
          url: process.env.TURSO_DATABASE_URL,
          authToken: process.env.TURSO_AUTH_TOKEN,
        }
      : {
          url: process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db",
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
