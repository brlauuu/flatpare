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
    expect(await columnNames(client, "ratings")).toContain("user_name");
    expect(await columnNames(client, "api_usage")).toContain("service");
    expect(await columnNames(client, "users")).toContain("name");

    const migrations = await client.execute({
      sql: "SELECT hash FROM __drizzle_migrations",
      args: [],
    });
    expect(migrations.rows).toHaveLength(2);
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
    expect(migrations.rows).toHaveLength(2);
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
