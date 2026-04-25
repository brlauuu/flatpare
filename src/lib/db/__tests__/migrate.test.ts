/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { applyMigrations } from "../migrate";

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

describe("applyMigrations", () => {
  it("creates full schema on a fresh database", async () => {
    const client = createClient({ url: ":memory:" });

    await applyMigrations(client);

    expect(await columnNames(client, "apartments")).toContain("listing_url");
    expect(await columnNames(client, "apartments")).toContain(
      "has_washing_machine"
    );
    expect(await columnNames(client, "ratings")).toContain("user_name");
    expect(await columnNames(client, "api_usage")).toContain("service");
    expect(await columnNames(client, "users")).toContain("name");

    const migrations = await client.execute({
      sql: "SELECT hash FROM __drizzle_migrations",
      args: [],
    });
    expect(migrations.rows).toHaveLength(7);
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
    expect(migrations.rows).toHaveLength(7);
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

    // 0002 recorded via reconcile + 0003, 0004, 0005, and 0006 run normally = 7 total
    // (0000/0001 were seeded, 0002 stamped by reconcile, 0003+0004+0005+0006 by migrator).
    const rows = await client.execute({
      sql: "SELECT COUNT(*) as n FROM __drizzle_migrations",
      args: [],
    });
    expect(Number(rows.rows[0].n)).toBe(7);
  });

  it("backfills the users table from distinct rating user_names", async () => {
    const client = createClient({ url: ":memory:" });

    // Simulate a DB that already has ratings (from before the users table
    // existed): run only the first migration manually, then add some data.
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

    await applyMigrations(client);

    const rows = await client.execute({
      sql: "SELECT name FROM users ORDER BY name",
      args: [],
    });
    expect(rows.rows.map((r) => r.name)).toEqual(["Alice", "Bob"]);
  });
});
