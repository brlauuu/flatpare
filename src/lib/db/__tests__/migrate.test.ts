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

    // 0014: the plaintext data tables are gone, replaced by envelope tables.
    expect(await columnNames(client, "apartments")).toEqual(
      expect.arrayContaining(["id", "household_id", "version", "envelope"])
    );
    expect(await columnNames(client, "apartments")).not.toContain("name");
    expect(await columnNames(client, "ratings")).toEqual(
      expect.arrayContaining(["household_id", "apartment_id", "user_id", "envelope"])
    );
    expect(await columnNames(client, "ratings")).not.toContain("kitchen");
    expect(await columnNames(client, "locations")).toEqual(
      expect.arrayContaining(["id", "household_id", "sort_order", "envelope"])
    );
    for (const gone of ["locations_of_interest", "apartment_distances", "app_settings", "api_usage"]) {
      const res = await client.execute({
        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        args: [gone],
      });
      expect(res.rows, gone).toHaveLength(0);
    }
    expect(await columnNames(client, "households")).toEqual(
      expect.arrayContaining(["id", "name", "owner_id", "tier"])
    );
    expect(await columnNames(client, "household_members")).toEqual(
      expect.arrayContaining(["household_id", "user_id", "role"])
    );
    expect(await columnNames(client, "users")).toEqual(
      expect.arrayContaining(["id", "name", "email"])
    );
    const indexes = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('apartments_household_idx','ratings_household_idx','locations_household_idx')",
      args: [],
    });
    expect(indexes.rows).toHaveLength(3);

    const migrations = await client.execute({
      sql: "SELECT hash FROM __drizzle_migrations",
      args: [],
    });
    expect(migrations.rows).toHaveLength(EXPECTED_MIGRATION_COUNT);
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

  // Reproduces the most likely self-hoster upgrade: a default location and
  // no apartments yet. Before this fix, the preflight counted apartments
  // only, concluded "fresh database, nothing to check", and let the migrator
  // hit the raw "Cannot add a NOT NULL column with default value NULL" error
  // instead of the actionable one.
  it("refuses to migrate a legacy database with a default location and zero apartments", async () => {
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
      sql: `CREATE TABLE locations_of_interest (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        label text NOT NULL,
        icon text NOT NULL,
        address text NOT NULL,
        sort_order integer NOT NULL
      )`,
      args: [],
    });
    // migrateLocationsOfInterestBackfill inserts this default row on every
    // pre-tenancy database, independent of whether any apartments exist.
    await client.execute({
      sql: "INSERT INTO locations_of_interest (label, icon, address, sort_order) VALUES ('Train Station', 'Train', 'Basel SBB, Switzerland', 0)",
      args: [],
    });

    const err = await applyMigrations(client).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/requires a fresh database/i);
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

    // Nothing ran: no migration recorded, and the legacy row survives.
    const applied = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
      args: [],
    });
    expect(applied.rows).toHaveLength(0);
    const rows = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM locations_of_interest",
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
      sql: "INSERT INTO apartments (id, household_id, envelope) VALUES ('a1', 1, '{\"v\":0,\"data\":{}}')",
      args: [],
    });
    // Rows are present, but household_id exists, so re-running is a no-op
    // rather than a refusal.
    await expect(applyMigrations(client)).resolves.toBeUndefined();
  });

  it("refuses to run 0014 on a tenanted database that still holds plaintext rows", async () => {
    const client = createClient({ url: ":memory:" });
    // A database at 0013: tenanted plaintext tables with data.
    await client.execute({
      sql: `CREATE TABLE apartments (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        household_id integer NOT NULL,
        name text NOT NULL
      )`,
      args: [],
    });
    await client.execute({
      sql: `CREATE TABLE locations_of_interest (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        household_id integer NOT NULL,
        label text NOT NULL
      )`,
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO locations_of_interest (household_id, label) VALUES (1, 'Work')",
      args: [],
    });

    await expect(applyMigrations(client)).rejects.toThrow(
      /client-encrypted envelopes[\s\S]*locations_of_interest[\s\S]*data is untouched/
    );
    // Nothing was dropped.
    expect(await columnNames(client, "apartments")).toContain("name");
    const rows = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM locations_of_interest",
      args: [],
    });
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });

  it("the 0014 preflight names only the tables that hold rows", async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute({
      sql: `CREATE TABLE apartments (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        household_id integer NOT NULL,
        name text NOT NULL
      )`,
      args: [],
    });
    await client.execute({
      sql: `CREATE TABLE ratings (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        household_id integer NOT NULL,
        apartment_id integer NOT NULL,
        user_id text NOT NULL
      )`,
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO apartments (household_id, name) VALUES (1, 'Flat')",
      args: [],
    });

    let message = "";
    try {
      await applyMigrations(client);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/Empty these tables before upgrading: apartments\./);
    expect(message).not.toContain("ratings");
  });

  it("creates the unique index on users.email", async () => {
    const client = createClient({ url: ":memory:" });

    await applyMigrations(client);

    const index = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='index' AND name='users_email_unique'",
      args: [],
    });
    expect(index.rows).toHaveLength(1);

    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u1', 'self-hosted@flatpare.local')",
      args: [],
    });
    await expect(
      client.execute({
        sql: "INSERT INTO users (id, email) VALUES ('u2', 'self-hosted@flatpare.local')",
        args: [],
      })
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("the users.email index is case-sensitive, so OAuth keeps its account-linking path", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client);

    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u1', 'alice@example.com')",
      args: [],
    });
    // Must NOT throw: Auth.js's getUserByEmail is a case-sensitive lookup,
    // so a NOCASE index would turn this into an opaque constraint failure
    // instead of the clean OAuthAccountNotLinked response.
    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u2', 'Alice@example.com')",
      args: [],
    });
    const rows = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM users",
      args: [],
    });
    expect(Number(rows.rows[0]?.n)).toBe(2);
  });

  it("refuses to run 0015 on a database that already holds duplicate user emails", async () => {
    const client = createClient({ url: ":memory:" });
    // A database at 0014: users exists, no unique index, two raced rows.
    await client.execute({
      sql: `CREATE TABLE users (
        id text PRIMARY KEY NOT NULL,
        name text,
        email text NOT NULL
      )`,
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u1', 'self-hosted@flatpare.local')",
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u2', 'self-hosted@flatpare.local')",
      args: [],
    });

    await expect(applyMigrations(client)).rejects.toThrow(
      /unique index on `users\.email`[\s\S]*self-hosted@flatpare\.local[\s\S]*u1[\s\S]*u2[\s\S]*data is untouched/
    );
    // Both rows survive: the operator, not the migrator, picks a survivor.
    const rows = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM users",
      args: [],
    });
    expect(Number(rows.rows[0]?.n)).toBe(2);
  });

  it("the 0015 preflight passes on a database whose user emails are all distinct", async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute({
      sql: `CREATE TABLE users (
        id text PRIMARY KEY NOT NULL,
        name text,
        email text NOT NULL
      )`,
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u1', 'a@example.com')",
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u2', 'b@example.com')",
      args: [],
    });

    await expect(applyMigrations(client)).resolves.toBeUndefined();
    const index = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='index' AND name='users_email_unique'",
      args: [],
    });
    expect(index.rows).toHaveLength(1);
  });

  it("the 0015 preflight does not fire on an already-migrated database", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client);
    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u1', 'a@example.com')",
      args: [],
    });

    // The index exists, so the duplicate scan is skipped entirely.
    await expect(applyMigrations(client)).resolves.toBeUndefined();
  });

  it("creates the E2 tables and recovery columns", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client);

    expect(await columnNames(client, "member_keys")).toEqual(
      expect.arrayContaining(["user_id", "public_key", "kdf_salt", "kdf_version"])
    );
    expect(await columnNames(client, "household_key_wraps")).toEqual(
      expect.arrayContaining(["household_id", "user_id", "wrapped_key", "wrapped_by"])
    );
    expect(await columnNames(client, "invitations")).toEqual(
      expect.arrayContaining(["email", "status", "expires_at", "accepted_by"])
    );
    expect(await columnNames(client, "households")).toEqual(
      expect.arrayContaining(["recovery_wrapped_key", "recovery_kdf_version"])
    );
    expect(await columnNames(client, "settings")).toEqual(["key", "value"]);
  });

  it("stamps the encryption mode on first boot and accepts the same mode again", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client, { encryptionMode: "off" });
    const stored = await client.execute({
      sql: "SELECT value FROM settings WHERE key = 'encryption_mode'",
      args: [],
    });
    expect(stored.rows[0]?.value).toBe("off");

    await expect(
      applyMigrations(client, { encryptionMode: "off" })
    ).resolves.toBeUndefined();
  });

  it("refuses to boot when the mode differs from the stamped one", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client, { encryptionMode: "on" });

    await expect(
      applyMigrations(client, { encryptionMode: "off" })
    ).rejects.toThrow(/initialised with FLATPARE_ENCRYPTION=on/);
  });

  it("refuses the first stamp on a non-empty database with FLATPARE_ENCRYPTION unset", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client, { encryptionMode: "off" });
    // Rewind to the state of a database that predates the mode stamp, then
    // give it a row so it is no longer a fresh install.
    await client.execute({
      sql: "DELETE FROM settings WHERE key = 'encryption_mode'",
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO users (id, email) VALUES ('u1', 'u1@example.com')",
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO households (id, name, owner_id) VALUES (1, 'H', 'u1')",
      args: [],
    });
    await client.execute({
      sql: "INSERT INTO apartments (id, household_id, envelope) VALUES ('a1', 1, '{\"v\":0,\"data\":{}}')",
      args: [],
    });

    const saved = process.env.FLATPARE_ENCRYPTION;
    delete process.env.FLATPARE_ENCRYPTION;
    try {
      await expect(
        applyMigrations(client, { encryptionMode: "on" })
      ).rejects.toThrow(/already holds data[\s\S]*FLATPARE_ENCRYPTION explicitly/);
      const none = await client.execute({
        sql: "SELECT value FROM settings WHERE key = 'encryption_mode'",
        args: [],
      });
      expect(none.rows).toHaveLength(0);

      // With the variable set explicitly, the same boot stamps normally.
      process.env.FLATPARE_ENCRYPTION = "off";
      await applyMigrations(client, { encryptionMode: "off" });
      const stamped = await client.execute({
        sql: "SELECT value FROM settings WHERE key = 'encryption_mode'",
        args: [],
      });
      expect(stamped.rows[0]?.value).toBe("off");
    } finally {
      if (saved === undefined) delete process.env.FLATPARE_ENCRYPTION;
      else process.env.FLATPARE_ENCRYPTION = saved;
    }
  });

  it("defaults the stamp to on when no option is passed", async () => {
    const client = createClient({ url: ":memory:" });
    await applyMigrations(client);
    const stored = await client.execute({
      sql: "SELECT value FROM settings WHERE key = 'encryption_mode'",
      args: [],
    });
    expect(stored.rows[0]?.value).toBe("on");
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
