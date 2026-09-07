import path from "node:path";
import fs from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";
import {
  ENCRYPTION_MODE_SETTING,
  readEncryptionMode,
  type EncryptionMode,
} from "@/lib/encryption-mode";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

let cachedPromise: Promise<void> | null = null;

// Migration 0011 adds `household_id NOT NULL` with no default to the four
// data tables. SQLite permits that only while a table is empty, so a database
// that still holds pre-tenancy rows aborts mid-chain with
// "Cannot add a NOT NULL column with default value NULL" — an error that names
// neither the table, nor the migration, nor what to do about it. The abort is
// atomic (the whole chain rolls back and the legacy data is untouched), but a
// self-hoster hitting it at boot has nothing to act on.
//
// No data migration is possible here: pre-tenancy rows belong to no household,
// and inventing a placeholder would hand the first person to sign in someone
// else's data. So the release genuinely requires a fresh database, and the
// right thing is to say so before the migrator produces its opaque failure.
const TENANCY_TABLES = [
  "apartments",
  "ratings",
  "locations_of_interest",
  "apartment_distances",
] as const;

async function preflightTenancyMigration(client: Client): Promise<void> {
  // Check existence of all four tables 0011 touches, not just `apartments`:
  // a legacy database can hold rows in `locations_of_interest` (the default
  // "Train Station" backfilled by migrateLocationsOfInterestBackfill on
  // every pre-tenancy database) while `apartments` is still empty — that
  // combination is the single most likely self-hoster upgrade, and it must
  // not slip past this preflight into the migrator's raw SQLite error.
  const tables = await client.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${TENANCY_TABLES.map(() => "?").join(",")})`,
    args: [...TENANCY_TABLES],
  });
  const existingTables = new Set(tables.rows.map((r) => String(r.name)));
  if (existingTables.size === 0) return; // fresh database, nothing to check

  if (existingTables.has("apartments")) {
    const cols = await client.execute({
      sql: "PRAGMA table_info(apartments)",
      args: [],
    });
    const alreadyTenanted = cols.rows.some((r) => r.name === "household_id");
    if (alreadyTenanted) return; // 0011 has already run
  }

  let total = 0;
  for (const table of existingTables) {
    const counted = await client.execute({
      sql: `SELECT COUNT(*) AS n FROM ${table}`,
      args: [],
    });
    total += Number(counted.rows[0]?.n ?? 0);
  }
  if (total === 0) return; // every existing table is empty: 0011 will apply

  throw new Error(
    "This release introduces per-household data isolation and requires a " +
      "fresh database. The existing `apartments` table still holds " +
      "pre-tenancy rows, which belong to no household and cannot be " +
      "assigned to one automatically. Empty these tables before upgrading: " +
      "apartments, ratings, locations_of_interest, apartment_distances. " +
      "No migration has been applied and your data is untouched."
  );
}

// Migration 0014 replaces the four plaintext data tables with three
// envelope tables and performs NO data migration: the server never holds a
// household data key, so it cannot encrypt anyone's rows on their behalf.
// `DROP TABLE` would succeed silently, so — as with the tenancy preflight —
// the only honest behaviour on a database that still holds plaintext rows
// is to refuse to boot and say which tables to empty.
const LEGACY_DATA_TABLES = [
  "apartments",
  "ratings",
  "locations_of_interest",
  "apartment_distances",
] as const;

export async function preflightEncryptedModelMigration(
  client: Client
): Promise<void> {
  const tables = await client.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${LEGACY_DATA_TABLES.map(() => "?").join(",")})`,
    args: [...LEGACY_DATA_TABLES],
  });
  const existing = new Set(tables.rows.map((r) => String(r.name)));
  if (!existing.has("apartments")) return; // fresh database

  const cols = await client.execute({
    sql: "PRAGMA table_info(apartments)",
    args: [],
  });
  if (cols.rows.some((r) => r.name === "envelope")) return; // 0014 applied

  const nonEmpty: string[] = [];
  for (const table of LEGACY_DATA_TABLES) {
    if (!existing.has(table)) continue;
    const counted = await client.execute({
      sql: `SELECT COUNT(*) AS n FROM ${table}`,
      args: [],
    });
    if (Number(counted.rows[0]?.n ?? 0) > 0) nonEmpty.push(table);
  }
  if (nonEmpty.length === 0) return;

  throw new Error(
    "This release moves the plaintext data tables into client-encrypted " +
      "envelopes and requires a fresh database: the server never holds the " +
      "household key, so existing plaintext rows cannot be converted. Empty " +
      "these tables before upgrading: " +
      nonEmpty.join(", ") +
      ". No migration has been applied and your data is untouched."
  );
}

// The encryption mode is a property of the DATABASE, fixed on first boot:
// rows written under one mode are unreadable under the other (encrypted
// envelopes need a key that "off" never creates; plaintext envelopes are
// rejected by assertEnvelopeMode when "on"). Refusing to start is the only
// safe response to a mismatch — the operator either fixes the env var or
// points the deployment at a fresh database.
async function readStampedMode(client: Client): Promise<string | null> {
  const res = await client.execute({
    sql: "SELECT value FROM settings WHERE key = ?",
    args: [ENCRYPTION_MODE_SETTING],
  });
  return res.rows.length === 0 ? null : String(res.rows[0].value);
}

function modeMismatchError(stored: string, mode: EncryptionMode): Error {
  return new Error(
    `This database was initialised with FLATPARE_ENCRYPTION=${stored} but ` +
      `the process is running with FLATPARE_ENCRYPTION=${mode}. The ` +
      "encryption mode is fixed on first boot and cannot be switched. " +
      `Run this deployment with FLATPARE_ENCRYPTION=${stored}, or point it ` +
      "at a fresh database."
  );
}

// Taking the one-way encryption decision by default is only safe on a database
// with nothing to lose. On one that already holds rows, defaulting to "on"
// silently commits the operator to a mode in which E3 will reject every
// pre-existing plaintext row — a choice they were never asked to make. So the
// first stamp on a non-empty database requires the variable to be set by hand.
async function assertModeChosenForExistingData(client: Client): Promise<void> {
  const chosen = process.env.FLATPARE_ENCRYPTION;
  if (chosen !== undefined && chosen !== "") return;
  const counted = await client.execute({
    sql: "SELECT COUNT(*) AS n FROM apartments",
    args: [],
  });
  if (Number(counted.rows[0]?.n ?? 0) === 0) return;
  throw new Error(
    "This database already holds data, and the encryption mode has never " +
      "been recorded for it. Set FLATPARE_ENCRYPTION explicitly to `on` or " +
      "`off` before this boot: `off` keeps the existing rows readable, `on` " +
      "starts encrypting and makes them unreadable to a later release. The " +
      "choice is permanent for this database — changing it afterwards means " +
      "a fresh database, or the export/import path tracked in #191. No " +
      "encryption mode has been stamped and your data is untouched."
  );
}

export async function stampEncryptionMode(
  client: Client,
  mode: EncryptionMode
): Promise<void> {
  let stored = await readStampedMode(client);
  if (stored === null) {
    await assertModeChosenForExistingData(client);
    // Two cold instances can reach a fresh database at the same moment and
    // both see no row. ON CONFLICT lets the loser proceed; the re-read below
    // then decides whether what actually landed agrees with this process.
    await client.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
      args: [ENCRYPTION_MODE_SETTING, mode],
    });
    stored = await readStampedMode(client);
    if (stored === null) {
      throw new Error(
        "Failed to record the encryption mode in the `settings` table."
      );
    }
  }
  if (stored === mode) return;
  throw modeMismatchError(stored, mode);
}

export async function applyMigrations(
  client: Client,
  options: { encryptionMode?: EncryptionMode } = {}
): Promise<void> {
  await preflightTenancyMigration(client);
  await preflightEncryptedModelMigration(client);
  // On Vercel the `drizzle/` folder isn't reliably present in the serverless
  // file trace, so SQL migrations are applied at build time via `drizzle-kit
  // migrate` (see package.json `vercel-build`). Skip the runtime drizzle
  // migrator when the folder is absent.
  if (fs.existsSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"))) {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  // Last, because the `settings` table is created by 0013 above. Reading
  // the env var here (not at module load) keeps tests able to pass a mode.
  await stampEncryptionMode(
    client,
    options.encryptionMode ?? readEncryptionMode()
  );
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
