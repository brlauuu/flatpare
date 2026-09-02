/**
 * @vitest-environment node
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "@libsql/client";
import { applyMigrations, runMigrations } from "../migrate";

async function columnNames(
  client: ReturnType<typeof createClient>,
  table: string
): Promise<string[]> {
  const res = await client.execute({
    sql: `PRAGMA table_info(${table})`,
    args: [],
  });
  return res.rows.map((r) => String(r.name));
}

// Derived from the migrations folder rather than hard-coded, so this stays
// correct as migrations are added instead of needing a manual bump each time.
const EXPECTED_MIGRATION_COUNT = (
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "drizzle", "meta", "_journal.json"),
      "utf8"
    )
  ) as { entries: unknown[] }
).entries.length;

describe("applyMigrations", () => {
  it("creates full schema on a fresh database", async () => {
    const client = createClient({ url: ":memory:" });

    await applyMigrations(client);

    expect(await columnNames(client, "apartments")).toContain("listing_url");
    expect(await columnNames(client, "apartments")).toContain(
      "has_washing_machine"
    );
    // 0011 replaced the display-name key with the Auth.js user id and added
    // the tenancy column. Asserting the OLD column is gone as well as the new
    // ones being present: a migration that only added columns would pass a
    // "contains user_id" check on its own.
    expect(await columnNames(client, "ratings")).toContain("user_id");
    expect(await columnNames(client, "ratings")).toContain("household_id");
    expect(await columnNames(client, "ratings")).not.toContain("user_name");
    for (const table of [
      "apartments",
      "locations_of_interest",
      "apartment_distances",
    ]) {
      expect(await columnNames(client, table)).toContain("household_id");
    }
    expect(await columnNames(client, "households")).toEqual(
      expect.arrayContaining(["id", "name", "owner_id", "tier"])
    );
    expect(await columnNames(client, "household_members")).toEqual(
      expect.arrayContaining(["household_id", "user_id", "role"])
    );
    expect(await columnNames(client, "api_usage")).toContain("service");
    // The Auth.js users table, not the legacy name-keyed one.
    expect(await columnNames(client, "users")).toEqual(
      expect.arrayContaining(["id", "name", "email"])
    );
    expect(await columnNames(client, "locations_of_interest")).toEqual(
      expect.arrayContaining(["label", "icon", "address", "sort_order"])
    );
    expect(await columnNames(client, "apartment_distances")).toEqual(
      expect.arrayContaining(["apartment_id", "location_id", "bike_min", "transit_min"])
    );
    expect(await columnNames(client, "apartments")).not.toContain(
      "distance_bike_min"
    );
    expect(await columnNames(client, "apartments")).not.toContain(
      "distance_transit_min"
    );
    const settingsTable = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'",
      args: [],
    });
    expect(settingsTable.rows).toHaveLength(0);

    const migrations = await client.execute({
      sql: "SELECT hash FROM __drizzle_migrations",
      args: [],
    });
    expect(migrations.rows).toHaveLength(EXPECTED_MIGRATION_COUNT);
  });

  it("adds listing_url to a legacy database missing the column", async () => {
    const client = createClient({ url: ":memory:" });

    // Simulate a pre-PR #23 database: apartments without listing_url.
    await client.execute({
      sql: `CREATE TABLE apartments (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        name text NOT NULL
      )`,
      args: [],
    });

    expect(await columnNames(client, "apartments")).not.toContain("listing_url");

    await applyMigrations(client);

    expect(await columnNames(client, "apartments")).toContain("listing_url");
  });

  it("is idempotent when run twice on the same database", async () => {
    const client = createClient({ url: ":memory:" });

    await applyMigrations(client);
    await applyMigrations(client);

    const migrations = await client.execute({
      sql: "SELECT hash FROM __drizzle_migrations",
      args: [],
    });
    expect(migrations.rows).toHaveLength(EXPECTED_MIGRATION_COUNT);
  });

  it("reconciles a DB that already has has_washing_machine but no 0002 marker", async () => {
    const client = createClient({ url: ":memory:" });

    // Simulate a DB migrated against PR #42's amended 0000: has the column
    // and a __drizzle_migrations table with 0000/0001 entries, but no 0002.
    await client.execute({
      sql: `CREATE TABLE apartments (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        name text NOT NULL,
        has_washing_machine integer,
        listing_url text
      )`,
      args: [],
    });
    await client.execute({
      sql: `CREATE TABLE ratings (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        apartment_id integer NOT NULL,
        user_name text NOT NULL,
        kitchen integer,
        balconies integer,
        location integer,
        floorplan integer,
        overall_feeling integer,
        comment text,
        created_at integer,
        updated_at integer
      )`,
      args: [],
    });
    await client.execute({
      sql: `CREATE UNIQUE INDEX ratings_apartment_user_idx ON ratings (apartment_id, user_name)`,
      args: [],
    });
    await client.execute({
      sql: `CREATE TABLE api_usage (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        service text NOT NULL,
        operation text NOT NULL
      )`,
      args: [],
    });
    await client.execute({
      sql: `CREATE TABLE users (name text PRIMARY KEY NOT NULL, created_at integer)`,
      args: [],
    });
    await client.execute({
      sql: `CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)`,
      args: [],
    });
    // Insert old 0000 + 0001 markers (timestamps from journal).
    await client.execute({
      sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('x', 1776832975059), ('y', 1776840392526)",
      args: [],
    });

    // Should NOT throw (would without the reconcile step because 0002 would
    // try to re-add has_washing_machine).
    await applyMigrations(client);

    // 0002 recorded via reconcile + 0003..0010 run normally = 10 total
    // (0000/0001 were seeded, 0002 stamped by reconcile, 0003..0010 by migrator).
    const rows = await client.execute({
      sql: "SELECT COUNT(*) as n FROM __drizzle_migrations",
      args: [],
    });
    expect(Number(rows.rows[0].n)).toBe(EXPECTED_MIGRATION_COUNT);
  });

  // Replaces "backfills the users table from distinct rating user_names".
  // That guarantee no longer exists: 0011 drops and recreates `users` in the
  // Auth.js shape, so whatever 0001 backfilled into the old name-keyed table
  // is gone by the end of the chain — there is nothing left to observe.
  //
  // What IS worth pinning is the boundary this replaced it with, because it
  // is sharp and surprising. 0011 adds `household_id NOT NULL` with no
  // default to four existing tables. SQLite permits that only while the table
  // is empty, so:
  //   - a legacy database with no rows migrates cleanly, and
  //   - a legacy database that still holds pre-tenancy rows aborts.
  // The spec accepts wiping production for this release; a self-hoster
  // upgrading in place hits the abort at boot (instrumentation.ts runs
  // migrations), so this must not regress silently in either direction.
  it("migrates a legacy database that has the old tables but no rows", async () => {
    const client = createClient({ url: ":memory:" });

    await client.execute({
      sql: `CREATE TABLE apartments (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        name text NOT NULL,
        listing_url text
      )`,
      args: [],
    });
    await client.execute({
      sql: `CREATE TABLE ratings (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        apartment_id integer NOT NULL,
        user_name text NOT NULL
      )`,
      args: [],
    });

    await applyMigrations(client);

    expect(await columnNames(client, "ratings")).toContain("household_id");
    expect(await columnNames(client, "ratings")).not.toContain("user_name");
    expect(await columnNames(client, "apartments")).toContain("household_id");
  });

  it("refuses to migrate a legacy database that still holds pre-tenancy rows", async () => {
    const client = createClient({ url: ":memory:" });

    await client.execute({
      sql: `CREATE TABLE apartments (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        name text NOT NULL,
        listing_url text
      )`,
      args: [],
    });
    await client.execute({
      sql: `CREATE TABLE ratings (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        apartment_id integer NOT NULL,
        user_name text NOT NULL
      )`,
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO apartments (name) VALUES ('A'), ('B')",
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO ratings (apartment_id, user_name) VALUES (1, 'Alice'), (1, 'Bob'), (2, 'Alice')",
      args: [],
    });

    // The preflight speaks before the migrator does: the raw failure
    // ("Cannot add a NOT NULL column with default value NULL") names neither
    // the table, the migration, nor the remedy.
    await expect(applyMigrations(client)).rejects.toThrow(
      /requires a fresh database/i
    );
  });

  it("the preflight error names the tables to empty and says data is untouched", async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute({
      sql: `CREATE TABLE apartments (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        name text NOT NULL,
        listing_url text
      )`,
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO apartments (name) VALUES ('A')",
      args: [],
    });

    const err = await applyMigrations(client).catch((e: Error) => e);
    const message = (err as Error).message;
    for (const table of [
      "apartments",
      "ratings",
      "locations_of_interest",
      "apartment_distances",
    ]) {
      expect(message).toContain(table);
    }
    expect(message).toMatch(/untouched/i);
    // ...and it really is untouched: nothing ran, so no migration was
    // recorded and the legacy row survives.
    const applied = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
      args: [],
    });
    expect(applied.rows).toHaveLength(0);
    const rows = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM apartments",
      args: [],
    });
    expect(Number(rows.rows[0].n)).toBe(1);
  });

  it("the preflight does not fire on an already-migrated database", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client);
    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u1', 'u1@example.com')",
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO households (name, owner_id) VALUES ('H', 'u1')",
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO apartments (household_id, name) VALUES (1, 'A')",
      args: [],
    });
    // Rows are present, but household_id exists, so re-running is a no-op
    // rather than a refusal.
    await expect(applyMigrations(client)).resolves.toBeUndefined();
  });
});

describe("runMigrations", () => {
  const tmpDir = path.join(process.cwd(), "data");
  const dbPath = path.join(tmpDir, "migrate-test.db");
  const savedEnv = { ...process.env };

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    process.env.TURSO_DATABASE_URL = "";
    process.env.TURSO_AUTH_TOKEN = "";
    process.env.LOCAL_DB_URL = `file:${dbPath}`;
  });

  afterEach(() => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    process.env = { ...savedEnv };
  });

  it("runs against the local sqlite path resolved from LOCAL_DB_URL", async () => {
    await runMigrations();
    expect(fs.existsSync(dbPath)).toBe(true);

    // Re-validating: a second call resolves immediately thanks to the
    // module-level cachedPromise (no second migration is run, but it must
    // not throw).
    await expect(runMigrations()).resolves.toBeUndefined();
  });
});
