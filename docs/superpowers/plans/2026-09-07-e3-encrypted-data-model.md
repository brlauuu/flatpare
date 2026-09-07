# E3 — Encrypted Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apartments, ratings and locations become client-encrypted envelope blobs sealed with the E2 household data key; the server stores, versions and scopes them but never reads them, and every derived view (sort, search, averages, distances) is computed in the browser from one in-memory store.

**Architecture:** Migration 0014 replaces the four plaintext data tables with three envelope tables (`apartments`, `ratings`, `locations`) keyed by client-minted UUIDs. Data routes accept and return envelopes only. Third-party processing (geocode, distance, listing check, PDF extraction) moves to `/api/process/*` blind proxies that touch no table. A pure `src/lib/household-data` layer (types, schemas, codec, derivation, enrichment) feeds a single `HouseholdDataProvider` React store that every page reads through `useHouseholdData()`. PDFs are encrypted client-side with `sealBytes`/`openBytes` and stored as opaque bytes.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + libSQL, Auth.js v5, zod 4, Web Crypto (AES-256-GCM via `@/lib/crypto`), Vercel Blob (`@vercel/blob`), react-leaflet 5, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-e3-encrypted-data-model-design.md` (parent: `docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md`, E2: `docs/superpowers/specs/2026-09-06-e2-crypto-core-design.md`).

## Global Constraints

- **Branch:** all work on `feat/e3-encrypted-data-model`; one PR at the end. Commit trailers on every commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH`.
- **Never run `npm run dev` or `npm run start`.** `.env.local` sets `TURSO_DATABASE_URL`, so the dev server writes to the production database. Tests use `file:./data/test.db` (set by `src/test-global-setup.ts`) and are safe.
- **Vitest, not Jest.** Tests live in co-located `__tests__/` directories. `vitest.config.ts` has `mockReset: true` — a mock's implementation must be set inside `beforeEach` or the test itself, never at declaration. Run a single file with `npx vitest run <path>`.
- **The suite is red from Task 1 through Task 15.** Task 1 deletes the plaintext routes and pages keep importing the old schema until their own task lands. Tasks 1–15 run **only the test files they name**; Task 16 is the first task after which the whole suite must be green (its last step runs `npm test`, `npm run typecheck`, `npm run lint`), and Task 17 is the gate that re-runs those plus `npm run test:coverage`. Do not "fix" unrelated red tests in earlier tasks.
- **Coverage floors (CI, `vitest.config.ts`):** lines ≥ 80, statements ≥ 80, functions ≥ 78, branches ≥ 75, over files imported by any test. `src/components/ui/**` and `src/lib/db/schema.ts` are excluded — never write tests targeting those.
- **ESLint crypto layering (`cryptoLayering` in `eslint.config.mjs`):** `crypto.subtle`, `crypto.getRandomValues` and `hash-wasm` may appear only under `src/lib/crypto/**`. Everything else imports named functions from `@/lib/crypto` — never `@/lib/crypto/<submodule>`. `crypto.randomUUID()` is not restricted.
- **Never read `process.env.FLATPARE_ENCRYPTION` in a `"use client"` file.** The mode reaches the client only through `<CryptoProvider mode>`; `readEncryptionMode()` is server-only.
- **Envelope mode:** `FLATPARE_ENCRYPTION=on` ⇒ every stored envelope is `{ v: 1, iv, ct }`; `off` ⇒ `{ v: 0, data }`. Route handlers reject the wrong version with `400` **before** writing.
- **Error contract (spec §Errors):** 400 schema / envelope mode / foreign `pdfPath`; 404 unknown **or foreign** row (never 403 — a 403 confirms the row exists elsewhere); 409 `{ error: "Duplicate id" }`, `{ error: "Stale version", version }`, `{ error: "Too many locations" }`; 413 `{ error: "PDF too large to extract" }`.
- **Every data route:** `requireMember()` (session + database membership re-check, from Task 3) → `parseBody` → work. Process routes additionally touch no table and carry the privacy-exception comment (spec §Process endpoints).
- **Row ids** are client-minted UUIDs (`newRowId()` = `crypto.randomUUID()`); the server validates with `z.uuid()`.
- **Short code letters** come from the 23-letter pool `ABCDEFGHJKMNPQRSTUVWXYZ` (no I, O, L); format `LLL-<rooms>B-<baths>b-W<Y|N|?>-<postcode|?>`.
- **`MAX_LOCATIONS = 5`** (`src/lib/location-icons.ts`), unchanged.
- **enola:** run `set_baseline` (MCP) once before Task 1 starts. Intended layering: `src/components/household-data → src/lib/household-data → src/lib/crypto`; `src/lib/household-data` imports nothing outside itself except `@/lib/crypto`. Only Task 17 re-pins (`enola baseline pin`); no other task may. The Stop hook runs `enola check --fail-on=cycles`; a new cross-module cycle is a defect to fix, not to mention.
- **Auto mode preference:** implementers use Bash (`cat`, `sed -n`, heredocs) where it does the job.

---

## File structure

**Created**

| Path | Responsibility |
|---|---|
| `drizzle/0014_e3_encrypted_data_model.sql` | Drop the four plaintext tables, create the three envelope tables |
| `src/lib/crypto/bytes.ts` | `sealBytes` / `openBytes` — AES-GCM over raw bytes (PDFs) |
| `src/lib/household-data/types.ts` | Plaintext shapes `Apartment`, `Rating`, `Location`, `ApartmentPdf`, `ApartmentDistance`; view types; `emptyApartment()`, `EMPTY_RATING` |
| `src/lib/household-data/schemas.ts` | zod schemas for the three plaintext shapes |
| `src/lib/household-data/wire.ts` | `ApartmentRow`, `RatingRow`, `LocationRow` — what the routes send |
| `src/lib/household-data/ids.ts` | `newRowId()` |
| `src/lib/household-data/codec.ts` | seal/open one row of each table with the right AAD; schema-failure ⇒ `null` |
| `src/lib/household-data/derive.ts` | `deriveApartments`, `deriveLocations` — rows ⇒ views (averages, my rating, corrupt placeholders) |
| `src/lib/household-data/short-code.ts` | pure short-code builder with uniqueness re-roll |
| `src/lib/household-data/enrich.ts` | `planEnrichment`, `missingDistances` — pure decisions about what to compute |
| `src/lib/household-data/maintenance.ts` | pure planners for the three maintenance kinds |
| `src/lib/household-data/concurrency.ts` | `mapConcurrent` — bounded-parallel map used by enrichment and maintenance |
| `src/lib/data-rows.ts` | server-side record → wire-row mappers (`apartmentRow`, `ratingRow`, `locationRow`, `parseStoredEnvelope`) |
| `src/lib/process-schemas.ts` | zod request schemas and size limit for `/api/process/*` |
| `src/lib/locations.ts` | (rewritten) server-side locations store over envelopes |
| `src/app/api/apartments/[id]/ratings/me/route.ts` | PUT/DELETE the caller's own rating |
| `src/app/api/ratings/route.ts` | GET all rating rows of the household |
| `src/app/api/process/{geocode,distance,check-listing,parse-pdf}/route.ts` | blind proxies to third parties |
| `src/app/api/files/route.ts` | local-mode multipart upload of an encrypted file |
| `src/app/api/files/upload-token/route.ts` | (moved from `parse-pdf/upload-token`) Blob client token |
| `src/components/household-data/api-client.ts` | typed `fetch` wrappers + `ApiClientError` |
| `src/components/household-data/process-client.ts` | client calls to `/api/process/*` |
| `src/components/household-data/pdf-files.ts` | encrypt+upload / download+decrypt a PDF |
| `src/components/household-data/enrichment.ts` | runs a plan: geocode → short code → distances |
| `src/components/household-data/household-data-provider.tsx` | the store: load, decode, write, retry, enrichment, maintenance |
| `src/components/household-data/use-household-data.ts` | `useHouseholdData()` |
| `src/components/household-data/__tests__/fake-household-data.tsx` | test helper: render under a fake context |
| `src/components/apartment-location-map.tsx` | Leaflet single-pin map for the detail page (replaces the iframe) |
| `src/components/apartment-location-map-inner.tsx` | the `ssr:false` Leaflet body behind it |

**Modified**: `src/lib/db/schema.ts`, `src/lib/db/migrate.ts`, `src/lib/crypto/index.ts`, `src/lib/crypto-schemas.ts`, `src/lib/api-route.ts`, `src/lib/storage.ts`, `src/lib/upload-pdf.ts`, `src/lib/apartment-sort.ts`, `src/lib/use-apartment-pager.ts`, `src/lib/edited-fields.ts`, `src/lib/fetch-error.ts`, `src/lib/listing-status.ts`, `src/components/crypto/crypto-gate.tsx`, `src/components/apartment-form-fields.tsx`, `src/components/apartment-rating-panel.tsx`, `src/app/api/apartments/route.ts`, `src/app/api/apartments/[id]/route.ts`, `src/app/api/locations/**`, `src/app/api/uploads/[...path]/route.ts`, all five pages and their components, `src/components/apartments-overview-map*.tsx`, `AGENTS.md`, `docs/security-notes.md`, `docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md` (deviation note).

**Deleted**: `src/lib/map-embed.ts`, `src/lib/short-code.ts`, `src/components/apartment-map.tsx`, `src/app/api/apartments/check-listings`, `src/app/api/apartments/[id]/reprocess`, `src/app/api/apartments/[id]/ratings/route.ts`, `src/app/api/geocode`, `src/app/api/settings`, `src/app/api/parse-pdf/route.ts`, `src/app/apartments/_components/apartment-summary.ts`, `src/app/apartments/new/__tests__/blob-upload.test.tsx`, the cross-cutting `src/app/api/__tests__/*` suite, and every test of a deleted module.

---

### Task 1: Schema, migration 0014, preflight, legacy removal

**Files:**
- Modify: `src/lib/db/schema.ts:1-9` (imports) and `:145-255` (data tables)
- Create: `drizzle/0014_e3_encrypted_data_model.sql`; generated: `drizzle/meta/0014_snapshot.json`, `drizzle/meta/_journal.json`
- Modify: `src/lib/db/migrate.ts`
- Modify: `src/lib/db/__tests__/migrate.test.ts`, `src/lib/db/__tests__/tenancy.test.ts`
- Delete (routes + their tests): `src/app/api/apartments/route.ts`, `src/app/api/apartments/[id]/route.ts`, `src/app/api/apartments/[id]/__tests__/`, `src/app/api/apartments/[id]/ratings/route.ts`, `src/app/api/apartments/[id]/reprocess/`, `src/app/api/apartments/check-listings/`, `src/app/api/geocode/`, `src/app/api/settings/`, `src/app/api/locations/`, `src/app/api/parse-pdf/route.ts` (keep `parse-pdf/upload-token/` — Task 10 moves it), `src/app/api/__tests__/` (all seven files)
- Delete (libs + tests): `src/lib/map-embed.ts`, `src/lib/__tests__/map-embed.test.ts`, `src/lib/short-code.ts`, `src/lib/__tests__/short-code.test.ts`, `src/lib/locations.ts`, `src/lib/__tests__/locations.test.ts`, `src/components/apartment-map.tsx`, `src/components/__tests__/apartment-map.test.tsx`

**Interfaces:**
- Produces: Drizzle tables `apartments { id: text PK, householdId, version, envelope, createdAt, updatedAt }`, `ratings { householdId, apartmentId, userId, envelope, createdAt, updatedAt; PK(apartmentId, userId) }`, `locations { id: text PK, householdId, sortOrder, envelope, createdAt, updatedAt }`; types `ApartmentRecord`, `RatingRecord`, `LocationRecord`. `preflightEncryptedModelMigration(client)` exported from `src/lib/db/migrate.ts`.

- [ ] **Step 1: Replace the data tables in `src/lib/db/schema.ts`**

Replace the import block (lines 1–9) with:

```ts
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./schema-auth";
```

Replace everything from `export const apartments = sqliteTable("apartments", {` down to (and including) `export type LocationOfInterest = typeof locationsOfInterest.$inferSelect;` with:

```ts
// E3: the three data tables hold one client-sealed envelope per row (see
// src/lib/crypto/envelope.ts). The server stores, versions and scopes them;
// it never reads a field inside. Ids are client-minted UUIDs so the client
// can bind the ciphertext to its row id (AAD) before the row exists.
export const apartments = sqliteTable(
  "apartments",
  {
    id: text("id").primaryKey(),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // Bumped on every write; PUT carries the version it read and loses
    // with 409 when it is stale.
    version: integer("version").notNull().default(1),
    envelope: text("envelope").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [index("apartments_household_idx").on(table.householdId)]
);

export const ratings = sqliteTable(
  "ratings",
  {
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    apartmentId: text("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    envelope: text("envelope").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [
    primaryKey({ columns: [table.apartmentId, table.userId] }),
    index("ratings_household_idx").on(table.householdId),
  ]
);

export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    envelope: text("envelope").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [index("locations_household_idx").on(table.householdId)]
);

export type ApartmentRecord = typeof apartments.$inferSelect;
export type RatingRecord = typeof ratings.$inferSelect;
export type LocationRecord = typeof locations.$inferSelect;
```

- [ ] **Step 2: Generate the migration scaffold, then overwrite its SQL by hand**

Run: `npx drizzle-kit generate --name e3_encrypted_data_model`

If drizzle-kit asks whether a table/column was **renamed** or **created**, always answer **create** (never rename). It writes `drizzle/0014_e3_encrypted_data_model.sql`, `drizzle/meta/0014_snapshot.json` and appends idx 14 to `drizzle/meta/_journal.json`. Keep the snapshot and journal as generated; replace the SQL file's whole content with:

```sql
DROP TABLE IF EXISTS `app_settings`;--> statement-breakpoint
DROP TABLE IF EXISTS `apartment_distances`;--> statement-breakpoint
DROP TABLE IF EXISTS `ratings`;--> statement-breakpoint
DROP TABLE IF EXISTS `locations_of_interest`;--> statement-breakpoint
DROP TABLE IF EXISTS `apartments`;--> statement-breakpoint
CREATE TABLE `apartments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `apartments_household_idx` ON `apartments` (`household_id`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`household_id` integer NOT NULL,
	`apartment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`apartment_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`apartment_id`) REFERENCES `apartments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `ratings_household_idx` ON `ratings` (`household_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`envelope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `locations_household_idx` ON `locations` (`household_id`);
```

(`app_settings` is dropped here because the `migrateLocationsOfInterestBackfill` step that used to drop it is deleted in Step 4; the drop order is children before parents so the `ratings → apartments` foreign key never blocks.)

- [ ] **Step 3: Write the failing migrate tests**

In `src/lib/db/__tests__/migrate.test.ts`:

1. Delete the tests `"adds listing_url to a legacy database missing the column"` and `"reconciles a DB that already has has_washing_machine but no 0002 marker"` entirely.
2. Replace the body of `"creates full schema on a fresh database"` with:

```ts
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
```

3. In `"refuses the first stamp on a non-empty database with FLATPARE_ENCRYPTION unset"`, replace the `INSERT INTO apartments (household_id, name) VALUES (1, 'Flat')` statement with:

```ts
    await client.execute({
      sql: "INSERT INTO apartments (id, household_id, envelope) VALUES ('a1', 1, '{\"v\":0,\"data\":{}}')",
      args: [],
    });
```

4. Add these two tests inside `describe("applyMigrations", ...)`, after `"the preflight does not fire on an already-migrated database"`:

```ts
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
```

Replace `src/lib/db/__tests__/tenancy.test.ts` entirely with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, apartments } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";

// Real database, not mocks: a mocked db returns its fixture regardless of
// the where clause, so a mocked isolation test passes even with no scoping.
beforeEach(async () => {
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function seedHousehold(userId: string, name: string) {
  await db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  const [h] = await db
    .insert(households)
    .values({ name, ownerId: userId })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: h.id, userId, role: "owner" });
  return h;
}

const PLAIN = JSON.stringify({ v: 0, data: {} });

describe("household scoping", () => {
  it("keeps apartments in separate households apart", async () => {
    const a = await seedHousehold("user-a", "A");
    const b = await seedHousehold("user-b", "B");

    await db.insert(apartments).values({ id: "a1", householdId: a.id, envelope: PLAIN });
    await db.insert(apartments).values({ id: "b1", householdId: b.id, envelope: PLAIN });

    const forA = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(eq(apartments.householdId, a.id));
    expect(forA.map((r) => r.id)).toEqual(["a1"]);
  });

  it("cascades apartments when the household is deleted", async () => {
    const a = await seedHousehold("user-a", "A");
    await db.insert(apartments).values({ id: "a1", householdId: a.id, envelope: PLAIN });

    await db.delete(households).where(eq(households.id, a.id));

    const left = await db.select({ id: apartments.id }).from(apartments);
    expect(left).toHaveLength(0);
  });

  it("defaults version to 1", async () => {
    const a = await seedHousehold("user-a", "A");
    await db.insert(apartments).values({ id: "a1", householdId: a.id, envelope: PLAIN });
    const [row] = await db.select().from(apartments);
    expect(row.version).toBe(1);
  });
});
```

- [ ] **Step 4: Run the two files to verify they fail**

Run: `npx vitest run src/lib/db/__tests__/migrate.test.ts src/lib/db/__tests__/tenancy.test.ts`
Expected: FAIL — `apartments` still has `name`, no `envelope`, `locations` table missing, `preflight` error not thrown.

- [ ] **Step 5: Rewrite `src/lib/db/migrate.ts`**

Delete the functions `ensureListingUrlColumn`, `reconcileHasWashingMachine`, `backfillShortCodes` and `migrateLocationsOfInterestBackfill` (everything between `let cachedPromise` and the `TENANCY_TABLES` comment block). Keep `preflightTenancyMigration`, `readStampedMode`, `modeMismatchError`, `assertModeChosenForExistingData`, `stampEncryptionMode`, `createDefaultClient`, `runMigrations` unchanged. Insert this after `preflightTenancyMigration`:

```ts
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
    "This release moves apartments, ratings and locations into " +
      "client-encrypted envelopes and requires a fresh database: the server " +
      "never holds the household key, so existing plaintext rows cannot be " +
      "converted. Empty these tables before upgrading: " +
      nonEmpty.join(", ") +
      ". No migration has been applied and your data is untouched."
  );
}
```

Replace `applyMigrations` with:

```ts
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
```

- [ ] **Step 6: Run the two files to verify they pass**

Run: `npx vitest run src/lib/db/__tests__/migrate.test.ts src/lib/db/__tests__/tenancy.test.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 7: Delete the legacy routes, libs and tests**

```bash
git rm -r -q src/app/api/apartments/route.ts "src/app/api/apartments/[id]/route.ts" \
  "src/app/api/apartments/[id]/__tests__" "src/app/api/apartments/[id]/ratings/route.ts" \
  "src/app/api/apartments/[id]/reprocess" src/app/api/apartments/check-listings \
  src/app/api/geocode src/app/api/settings src/app/api/locations \
  src/app/api/parse-pdf/route.ts src/app/api/__tests__ \
  src/lib/map-embed.ts src/lib/__tests__/map-embed.test.ts \
  src/lib/short-code.ts src/lib/__tests__/short-code.test.ts \
  src/lib/locations.ts src/lib/__tests__/locations.test.ts \
  src/components/apartment-map.tsx src/components/__tests__/apartment-map.test.tsx
```

Then confirm nothing under `src/lib` or `src/app/api` still imports a deleted module (page files will — that is expected until their tasks):

Run: `grep -rln "map-embed\|@/lib/short-code\|@/lib/locations\|apartment-map\"" src/lib src/app/api src/components || echo clean`
Expected: `clean`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(e3): migration 0014 — envelope tables, preflight, drop plaintext routes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 2: `sealBytes` / `openBytes` for encrypted files

**Files:**
- Create: `src/lib/crypto/bytes.ts`
- Modify: `src/lib/crypto/index.ts`
- Test: `src/lib/crypto/__tests__/bytes.test.ts`

**Interfaces:**
- Consumes: `randomIv()` from `./keys`, `toBase64`/`fromBase64` from `./encoding`.
- Produces: `interface SealedBytes { iv: string | null; ct: Uint8Array<ArrayBuffer> }`; `sealBytes(key: CryptoKey | null, bytes: Uint8Array<ArrayBuffer>, aad: string): Promise<SealedBytes>`; `openBytes(key: CryptoKey | null, sealed: SealedBytes, aad: string): Promise<Uint8Array<ArrayBuffer>>`. Both re-exported from `@/lib/crypto`.

- [ ] **Step 1: Write the failing test**

`src/lib/crypto/__tests__/bytes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateDataKey } from "../keys";
import { openBytes, sealBytes } from "../bytes";

const AAD = "1:pdf:apt-1";

function bytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  for (let i = 0; i < n; i++) out[i] = (i * 7) % 256;
  return out;
}

describe("sealBytes / openBytes", () => {
  it("round-trips under a key and hides the plaintext", async () => {
    const key = await generateDataKey();
    const plain = bytes(1000);
    const sealed = await sealBytes(key, plain, AAD);
    expect(sealed.iv).not.toBeNull();
    expect(sealed.ct.length).toBe(plain.length + 16); // GCM tag
    expect(Buffer.from(sealed.ct).equals(Buffer.from(plain))).toBe(false);
    const opened = await openBytes(key, sealed, AAD);
    expect(Buffer.from(opened).equals(Buffer.from(plain))).toBe(true);
  });

  it("fails to open under a different AAD", async () => {
    const key = await generateDataKey();
    const sealed = await sealBytes(key, bytes(32), AAD);
    await expect(openBytes(key, sealed, "1:pdf:apt-2")).rejects.toThrow();
  });

  it("passes bytes through with a null iv when the key is null (encryption off)", async () => {
    const plain = bytes(16);
    const sealed = await sealBytes(null, plain, AAD);
    expect(sealed.iv).toBeNull();
    expect(sealed.ct).toBe(plain);
    expect(await openBytes(null, sealed, AAD)).toBe(plain);
  });

  it("refuses plaintext bytes when a key is present", async () => {
    const key = await generateDataKey();
    await expect(
      openBytes(key, { iv: null, ct: bytes(4) }, AAD)
    ).rejects.toThrow("Plaintext bytes in an encrypted deployment");
  });

  it("refuses encrypted bytes without a key", async () => {
    const key = await generateDataKey();
    const sealed = await sealBytes(key, bytes(4), AAD);
    await expect(openBytes(null, sealed, AAD)).rejects.toThrow(
      "Cannot open encrypted bytes without a key"
    );
  });

  it("requires an AAD", async () => {
    await expect(sealBytes(null, bytes(4), "")).rejects.toThrow(
      "Envelope AAD is required"
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/crypto/__tests__/bytes.test.ts`
Expected: FAIL — `Failed to resolve import "../bytes"`.

- [ ] **Step 3: Implement `src/lib/crypto/bytes.ts`**

```ts
import { fromBase64, toBase64 } from "./encoding";
import { randomIv } from "./keys";

// The file-shaped sibling of envelope.ts: AES-256-GCM over raw bytes (a
// PDF), bound to its row by AAD so a ciphertext cannot be moved between
// apartments or households. `iv: null` marks bytes stored in the clear,
// which only an encryption-off deployment produces.
export interface SealedBytes {
  iv: string | null;
  ct: Uint8Array<ArrayBuffer>;
}

const enc = new TextEncoder();

function requireAad(aad: string): Uint8Array<ArrayBuffer> {
  if (!aad) throw new Error("Envelope AAD is required");
  return new Uint8Array(enc.encode(aad));
}

export async function sealBytes(
  key: CryptoKey | null,
  bytes: Uint8Array<ArrayBuffer>,
  aad: string
): Promise<SealedBytes> {
  const additionalData = requireAad(aad);
  if (key === null) return { iv: null, ct: bytes };
  const iv = randomIv();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    bytes
  );
  return { iv: toBase64(iv), ct: new Uint8Array(ct) };
}

export async function openBytes(
  key: CryptoKey | null,
  sealed: SealedBytes,
  aad: string
): Promise<Uint8Array<ArrayBuffer>> {
  const additionalData = requireAad(aad);
  if (sealed.iv === null) {
    if (key !== null) {
      throw new Error("Plaintext bytes in an encrypted deployment");
    }
    return sealed.ct;
  }
  if (key === null) {
    throw new Error("Cannot open encrypted bytes without a key");
  }
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData },
    key,
    sealed.ct
  );
  return new Uint8Array(pt);
}
```

Append to `src/lib/crypto/index.ts`:

```ts
export { openBytes, sealBytes, type SealedBytes } from "./bytes";
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/crypto/__tests__/bytes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto/bytes.ts src/lib/crypto/index.ts src/lib/crypto/__tests__/bytes.test.ts
git commit -m "feat(crypto): sealBytes/openBytes for encrypted files

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 3: Route helpers — `envelopeSchema`, `requireMember`, `requireEnvelopeMode`, stored-path helpers

**Files:**
- Modify: `src/lib/crypto-schemas.ts`
- Modify: `src/lib/api-route.ts`
- Modify: `src/lib/storage.ts`
- Test: `src/lib/__tests__/crypto-schemas.test.ts`, `src/lib/__tests__/api-route.test.ts`, `src/lib/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `assertEnvelopeMode`, `Envelope` from `@/lib/crypto`; `requireHousehold` from `@/lib/session`; `assertMembership`, `ForbiddenError` from `@/lib/household`.
- Produces:
  - `envelopeSchema: ZodType<Envelope>` (`{ v: 1, iv: base64, ct: base64 ≤ 2_000_000 chars } | { v: 0, data: unknown }`).
  - `requireMember(): Promise<{ householdId: number; userId: string; role: Role }>` — `requireHousehold()` then `assertMembership`; a non-member gets `ApiError("Not found", 404)`.
  - `requireEnvelopeMode(envelope: Envelope): void` — throws `ApiError(<assertEnvelopeMode message>, 400)`.
  - `isUniqueConstraintError(err: unknown): boolean` from `@/lib/api-route`.
  - `storedPathHousehold(url: string): { householdId: number; canonicalUrl: string } | null` from `@/lib/storage`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/crypto-schemas.test.ts` (inside the file's top-level scope; add `import { envelopeSchema } from "@/lib/crypto-schemas";` if the existing import line does not already pull it):

```ts
describe("envelopeSchema", () => {
  it("accepts a v1 envelope with a large ciphertext", () => {
    const ct = "A".repeat(500_000);
    expect(
      envelopeSchema.parse({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct })
    ).toEqual({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct });
  });

  it("accepts a v0 envelope with arbitrary data", () => {
    expect(envelopeSchema.parse({ v: 0, data: { name: "Flat" } })).toEqual({
      v: 0,
      data: { name: "Flat" },
    });
  });

  it("rejects unknown versions and non-base64 ciphertext", () => {
    expect(envelopeSchema.safeParse({ v: 2, iv: "AA==", ct: "AA==" }).success).toBe(false);
    expect(envelopeSchema.safeParse({ v: 1, iv: "AA==", ct: "not base64!" }).success).toBe(false);
    expect(envelopeSchema.safeParse({ v: 1, iv: "AA==" }).success).toBe(false);
  });
});
```

Append to `src/lib/__tests__/api-route.test.ts`. The file already imports from `vitest`; add these mocks at the **top** of the file (before any import of `@/lib/api-route`, hoisted by vitest anyway):

```ts
const sessionState = vi.hoisted(() => ({
  current: { householdId: 1, userId: "u1", role: "owner" as const },
  member: true,
}));
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => ({ ...sessionState.current })),
}));
vi.mock("@/lib/household", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/household")>();
  return {
    ...actual,
    assertMembership: vi.fn(async () => {
      if (!sessionState.member) throw new actual.ForbiddenError();
      return "owner";
    }),
  };
});
```

and these tests at the bottom:

```ts
import { isUniqueConstraintError, requireEnvelopeMode, requireMember } from "@/lib/api-route";
import { ApiError } from "@/lib/api-error";

describe("requireMember", () => {
  beforeEach(() => {
    sessionState.member = true;
  });

  it("returns the session when the database confirms membership", async () => {
    await expect(requireMember()).resolves.toEqual({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
  });

  it("answers 404, not 403, for a removed member with a still-valid token", async () => {
    sessionState.member = false;
    const err = await requireMember().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
  });
});

describe("requireEnvelopeMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the envelope version matching the deployment mode", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "on");
    expect(() => requireEnvelopeMode({ v: 1, iv: "AA==", ct: "AA==" })).not.toThrow();
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    expect(() => requireEnvelopeMode({ v: 0, data: {} })).not.toThrow();
  });

  it("rejects a plaintext envelope under encryption on with 400", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "on");
    const err = (() => {
      try {
        requireEnvelopeMode({ v: 0, data: {} });
      } catch (e) {
        return e as ApiError;
      }
    })();
    expect(err).toBeInstanceOf(ApiError);
    expect(err?.status).toBe(400);
    expect(err?.message).toBe("Plaintext envelope in an encrypted deployment");
  });

  it("rejects an encrypted envelope under encryption off with 400", () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    expect(() => requireEnvelopeMode({ v: 1, iv: "AA==", ct: "AA==" })).toThrow(
      "Encrypted envelope in a deployment with encryption off"
    );
  });
});

describe("isUniqueConstraintError", () => {
  it("matches libsql's unique-constraint message", () => {
    expect(isUniqueConstraintError(new Error("UNIQUE constraint failed: apartments.id"))).toBe(true);
    expect(isUniqueConstraintError(new Error("no such table"))).toBe(false);
    expect(isUniqueConstraintError("nope")).toBe(false);
  });
});
```

(Add `beforeEach`/`afterEach` to the vitest import if missing.)

Append to `src/lib/__tests__/storage.test.ts`. The file calls `vi.resetModules()` after every test and imports `@/lib/storage` dynamically inside each test — keep that pattern (a static import at the top would be evaluated before the per-test `vi.doMock` calls):

```ts
describe("storedPathHousehold", () => {
  it("resolves the household of a /api/pdf/ path and canonicalizes it", async () => {
    const { storedPathHousehold } = await import("../storage");
    expect(storedPathHousehold("/api/pdf/households/7/a/../x.pdf.enc")).toEqual({
      householdId: 7,
      canonicalUrl: "/api/pdf/households/7/x.pdf.enc",
    });
  });

  it("resolves the household of a /api/uploads/ path", async () => {
    const { storedPathHousehold } = await import("../storage");
    expect(storedPathHousehold("/api/uploads/households/3/x.pdf.enc")).toEqual({
      householdId: 3,
      canonicalUrl: "/api/uploads/households/3/x.pdf.enc",
    });
  });

  it("returns null for foreign shapes", async () => {
    const { storedPathHousehold } = await import("../storage");
    expect(storedPathHousehold("https://evil.example/x")).toBeNull();
    expect(storedPathHousehold("/api/pdf/other/7/x.pdf")).toBeNull();
    expect(storedPathHousehold("/api/uploads/households/../x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/__tests__/crypto-schemas.test.ts src/lib/__tests__/api-route.test.ts src/lib/__tests__/storage.test.ts`
Expected: FAIL — `envelopeSchema`, `requireMember`, `requireEnvelopeMode`, `storedPathHousehold`, `isUniqueConstraintError` are not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/crypto-schemas.ts`:

```ts
// An apartment's ciphertext carries rawExtractedData, so it is far larger
// than a wrapped key. 2 000 000 base64 chars ≈ 1.5 MB of plaintext.
const ciphertext = z
  .string()
  .min(1)
  .max(2_000_000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be base64");

export const envelopeSchema = z.discriminatedUnion("v", [
  z.object({ v: z.literal(1), iv: base64, ct: ciphertext }),
  z.object({ v: z.literal(0), data: z.unknown() }),
]);
```

In `src/lib/api-route.ts`, add imports and two functions:

```ts
import { assertEnvelopeMode, type Envelope } from "@/lib/crypto";
import { assertMembership, type Role } from "@/lib/household";
import { requireHousehold } from "@/lib/session";
```

(keep the existing `ForbiddenError, UnauthorizedError` import from `@/lib/household`), then append:

```ts
// The session's householdId is a JWT claim that can outlive a membership by
// up to 24h. Every E3 data route re-checks the database, and a non-member
// gets 404 — the same answer as a row that never existed — so that a
// removed member's probes cannot tell "gone" from "not yours".
export async function requireMember(): Promise<{
  householdId: number;
  userId: string;
  role: Role;
}> {
  const { householdId, userId } = await requireHousehold();
  try {
    const role = await assertMembership(householdId, userId);
    return { householdId, userId, role };
  } catch (err) {
    if (err instanceof ForbiddenError) throw new ApiError("Not found", 404);
    throw err;
  }
}

// A client that sends a v0 envelope to an encrypted deployment (or v1 to an
// unencrypted one) has a bug; the row must not be written.
export function requireEnvelopeMode(envelope: Envelope): void {
  try {
    assertEnvelopeMode(envelope, readEncryptionMode());
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "Bad envelope", 400);
  }
}

// libsql reports a primary-key clash as a plain Error; POST handlers turn
// it into 409 "Duplicate id" instead of 500.
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /unique constraint|UNIQUE constraint/i.test(err.message)
  );
}
```

Append to `src/lib/storage.ts`:

```ts
// Resolves a client-supplied stored-file URL (as written into an
// apartment's `pdf.path`) to the household that owns it, in canonical form.
// Route handlers compare the household against the caller's and persist or
// act on `canonicalUrl`, never the raw input.
export function storedPathHousehold(
  url: string
): { householdId: number; canonicalUrl: string } | null {
  try {
    if (url.startsWith("/api/pdf/")) {
      const key = canonicalizePathname(url.slice("/api/pdf/".length));
      const householdId = householdIdFromStoredPath(key);
      if (householdId === null) return null;
      return { householdId, canonicalUrl: `/api/pdf/${key}` };
    }
    if (url.startsWith("/api/uploads/")) {
      const key = decodeURIComponent(url.slice("/api/uploads/".length));
      const householdId = householdIdFromStoredPath(key);
      if (householdId === null) return null;
      return { householdId, canonicalUrl: `/api/uploads/${key}` };
    }
  } catch {
    return null;
  }
  return null;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/__tests__/crypto-schemas.test.ts src/lib/__tests__/api-route.test.ts src/lib/__tests__/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto-schemas.ts src/lib/api-route.ts src/lib/storage.ts src/lib/__tests__
git commit -m "feat(api): envelopeSchema, requireMember, requireEnvelopeMode, stored-path helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 4: `src/lib/household-data` — types, schemas, wire, ids, codec

**Files:**
- Create: `src/lib/household-data/types.ts`, `schemas.ts`, `wire.ts`, `ids.ts`, `codec.ts`
- Test: `src/lib/household-data/__tests__/codec.test.ts`, `src/lib/household-data/__tests__/schemas.test.ts`

**Interfaces:**
- Consumes: `seal`, `open`, `envelopeAad`, `type Envelope` from `@/lib/crypto`.
- Produces (all later tasks depend on these exact names):
  - `types.ts`: `ApartmentDistance`, `ApartmentPdf`, `Apartment`, `Rating`, `Location`, `RatingView`, `ApartmentView`, `LocationView`, `emptyApartment(name?: string): Apartment`, `EMPTY_RATING: Rating`, `DecodedApartment`, `DecodedRating`, `DecodedLocation`.
  - `schemas.ts`: `apartmentSchema`, `ratingSchema`, `locationSchema`.
  - `wire.ts`: `ApartmentRow`, `RatingRow`, `LocationRow`.
  - `ids.ts`: `newRowId(): string`.
  - `codec.ts`: `sealApartment(key, householdId, id, data)`, `openApartment(key, householdId, id, envelope)`, `sealRating(key, householdId, apartmentId, userId, data)`, `openRating(key, householdId, apartmentId, userId, envelope)`, `sealLocation(key, householdId, id, data)`, `openLocation(key, householdId, id, envelope)`; `open*` return `Promise<T | null>` (null ⇒ corrupt).

- [ ] **Step 1: Write the failing tests**

`src/lib/household-data/__tests__/schemas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { apartmentSchema, locationSchema, ratingSchema } from "../schemas";
import { EMPTY_RATING, emptyApartment } from "../types";

describe("household-data schemas", () => {
  it("accepts the empty apartment and rejects a missing distances map", () => {
    expect(apartmentSchema.safeParse(emptyApartment("Flat")).success).toBe(true);
    const { distances: _d, ...noDistances } = emptyApartment("Flat");
    expect(apartmentSchema.safeParse(noDistances).success).toBe(false);
  });

  it("accepts a fully populated apartment", () => {
    const full = {
      ...emptyApartment("Flat"),
      address: "Bahnhofstrasse 1, 8001 Zürich",
      sizeM2: 80.5,
      numRooms: 3.5,
      numBathrooms: 1,
      numBalconies: 1,
      hasWashingMachine: true,
      rentChf: 2500,
      listingUrl: "https://example.com/x",
      summary: "Nice",
      availableFrom: "2026-10-01",
      shortCode: "ABC-3.5B-1b-WY-8001",
      rawExtractedData: { anything: [1, 2, 3] },
      userEditedFields: ["name"],
      latitude: 47.37,
      longitude: 8.54,
      listingGone: true,
      listingCheckedAt: "2026-09-07T10:00:00.000Z",
      distances: { "loc-1": { bikeMin: 12, transitMin: null } },
      pdf: { path: "/api/pdf/households/1/x.pdf.enc", iv: "AAAA" },
    };
    expect(apartmentSchema.parse(full)).toEqual(full);
  });

  it("bounds ratings to 0..5 integers", () => {
    expect(ratingSchema.safeParse(EMPTY_RATING).success).toBe(true);
    expect(ratingSchema.safeParse({ ...EMPTY_RATING, kitchen: 6 }).success).toBe(false);
    expect(ratingSchema.safeParse({ ...EMPTY_RATING, kitchen: 2.5 }).success).toBe(false);
  });

  it("requires label, icon and address on a location", () => {
    expect(
      locationSchema.safeParse({ label: "Work", icon: "Briefcase", address: "X 1", latitude: null, longitude: null }).success
    ).toBe(true);
    expect(locationSchema.safeParse({ label: "Work", icon: "Briefcase" }).success).toBe(false);
  });
});
```

`src/lib/household-data/__tests__/codec.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateDataKey } from "@/lib/crypto";
import {
  openApartment,
  openLocation,
  openRating,
  sealApartment,
  sealLocation,
  sealRating,
} from "../codec";
import { EMPTY_RATING, emptyApartment } from "../types";

describe("household-data codec", () => {
  it("round-trips an apartment under a key", async () => {
    const key = await generateDataKey();
    const data = { ...emptyApartment("Flat"), rentChf: 1800 };
    const env = await sealApartment(key, 1, "apt-1", data);
    expect(env.v).toBe(1);
    expect(await openApartment(key, 1, "apt-1", env)).toEqual(data);
  });

  it("round-trips as v0 when the key is null", async () => {
    const data = emptyApartment("Flat");
    const env = await sealApartment(null, 1, "apt-1", data);
    expect(env).toEqual({ v: 0, data });
    expect(await openApartment(null, 1, "apt-1", env)).toEqual(data);
  });

  it("returns null when the row id, household or table differ (AAD mismatch)", async () => {
    const key = await generateDataKey();
    const env = await sealApartment(key, 1, "apt-1", emptyApartment("Flat"));
    expect(await openApartment(key, 1, "apt-2", env)).toBeNull();
    expect(await openApartment(key, 2, "apt-1", env)).toBeNull();
    expect(await openLocation(key, 1, "apt-1", env)).toBeNull();
  });

  it("returns null when the plaintext fails the schema", async () => {
    const key = await generateDataKey();
    const env = await sealApartment(
      key, 1, "apt-1",
      { name: 42 } as unknown as ReturnType<typeof emptyApartment>
    );
    expect(await openApartment(key, 1, "apt-1", env)).toBeNull();
  });

  it("binds ratings to apartment and user", async () => {
    const key = await generateDataKey();
    const env = await sealRating(key, 1, "apt-1", "u1", { ...EMPTY_RATING, kitchen: 4 });
    expect(await openRating(key, 1, "apt-1", "u1", env)).toEqual({ ...EMPTY_RATING, kitchen: 4 });
    expect(await openRating(key, 1, "apt-1", "u2", env)).toBeNull();
  });

  it("round-trips a location", async () => {
    const key = await generateDataKey();
    const loc = { label: "Work", icon: "Briefcase", address: "X 1", latitude: 1, longitude: 2 };
    const env = await sealLocation(key, 1, "loc-1", loc);
    expect(await openLocation(key, 1, "loc-1", env)).toEqual(loc);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/household-data`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the five modules**

`src/lib/household-data/types.ts`:

```ts
// Plaintext shapes of the three encrypted tables. Everything the server used
// to hold as columns lives inside the envelope now, including the short code
// and the per-location distances. These types are the contract between the
// codec (which validates them on open) and every page (which reads views).

export interface ApartmentDistance {
  bikeMin: number | null;
  transitMin: number | null;
}

export interface ApartmentPdf {
  // Stored-file URL as returned by uploadEncryptedFile: /api/pdf/... or
  // /api/uploads/... . Server-validated to belong to the household.
  path: string;
  // AES-GCM iv (base64) of the encrypted bytes; null when stored in the clear.
  iv: string | null;
}

export interface Apartment {
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  listingUrl: string | null;
  summary: string | null;
  availableFrom: string | null;
  shortCode: string | null;
  rawExtractedData: unknown | null;
  userEditedFields: string[];
  latitude: number | null;
  longitude: number | null;
  listingGone: boolean;
  listingCheckedAt: string | null;
  // Keyed by location id.
  distances: Record<string, ApartmentDistance>;
  pdf: ApartmentPdf | null;
}

export interface Rating {
  kitchen: number;
  balconies: number;
  location: number;
  floorplan: number;
  overallFeeling: number;
  comment: string;
}

export interface Location {
  label: string;
  icon: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export function emptyApartment(name = ""): Apartment {
  return {
    name,
    address: null,
    sizeM2: null,
    numRooms: null,
    numBathrooms: null,
    numBalconies: null,
    hasWashingMachine: null,
    rentChf: null,
    listingUrl: null,
    summary: null,
    availableFrom: null,
    shortCode: null,
    rawExtractedData: null,
    userEditedFields: [],
    latitude: null,
    longitude: null,
    listingGone: false,
    listingCheckedAt: null,
    distances: {},
    pdf: null,
  };
}

export const EMPTY_RATING: Rating = {
  kitchen: 0,
  balconies: 0,
  location: 0,
  floorplan: 0,
  overallFeeling: 0,
  comment: "",
};

// A row after decoding. `data: null` means the envelope could not be opened
// or failed its schema — the view layer shows a placeholder for it.
export interface DecodedApartment {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  data: Apartment | null;
}

export interface DecodedRating {
  apartmentId: string;
  userId: string;
  userName: string;
  updatedAt: string;
  data: Rating | null;
}

export interface DecodedLocation {
  id: string;
  sortOrder: number;
  data: Location | null;
}

// Views are what pages render: plaintext plus row metadata plus derived
// values, all computed in the browser (src/lib/household-data/derive.ts).
export interface RatingView extends Rating {
  userId: string;
  userName: string;
  updatedAt: string;
}

export interface ApartmentView extends Apartment {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  ratings: RatingView[];
  avgKitchen: number | null;
  avgBalconies: number | null;
  avgLocation: number | null;
  avgFloorplan: number | null;
  avgOverall: number | null;
  // The caller's own overallFeeling, or null when they have not rated.
  myRating: number | null;
  corrupt?: true;
}

export interface LocationView extends Location {
  id: string;
  sortOrder: number;
}
```

`src/lib/household-data/schemas.ts`:

```ts
import { z } from "zod";
import type { Apartment, Location, Rating } from "./types";

const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();
const stars = z.number().int().min(0).max(5);

export const distanceSchema = z.object({
  bikeMin: z.number().int().nullable(),
  transitMin: z.number().int().nullable(),
});

export const apartmentSchema: z.ZodType<Apartment> = z.object({
  name: z.string(),
  address: nullableString,
  sizeM2: nullableNumber,
  numRooms: nullableNumber,
  numBathrooms: nullableNumber,
  numBalconies: nullableNumber,
  hasWashingMachine: z.boolean().nullable(),
  rentChf: nullableNumber,
  listingUrl: nullableString,
  summary: nullableString,
  availableFrom: nullableString,
  shortCode: nullableString,
  rawExtractedData: z.unknown().nullable(),
  userEditedFields: z.array(z.string()),
  latitude: nullableNumber,
  longitude: nullableNumber,
  listingGone: z.boolean(),
  listingCheckedAt: nullableString,
  distances: z.record(z.string(), distanceSchema),
  pdf: z.object({ path: z.string(), iv: nullableString }).nullable(),
});

export const ratingSchema: z.ZodType<Rating> = z.object({
  kitchen: stars,
  balconies: stars,
  location: stars,
  floorplan: stars,
  overallFeeling: stars,
  comment: z.string(),
});

export const locationSchema: z.ZodType<Location> = z.object({
  label: z.string().min(1),
  icon: z.string().min(1),
  address: z.string().min(1),
  latitude: nullableNumber,
  longitude: nullableNumber,
});
```

`src/lib/household-data/wire.ts`:

```ts
import type { Envelope } from "@/lib/crypto";

// What the data routes send and accept. Timestamps are ISO strings.
export interface ApartmentRow {
  id: string;
  version: number;
  envelope: Envelope;
  createdAt: string;
  updatedAt: string;
}

export interface RatingRow {
  apartmentId: string;
  userId: string;
  userName: string;
  envelope: Envelope;
  updatedAt: string;
}

export interface LocationRow {
  id: string;
  sortOrder: number;
  envelope: Envelope;
  createdAt: string;
  updatedAt: string;
}
```

`src/lib/household-data/ids.ts`:

```ts
// Row ids are minted in the browser so the ciphertext can be bound to its
// id (envelopeAad) before the server has ever seen the row.
export function newRowId(): string {
  return crypto.randomUUID();
}
```

`src/lib/household-data/codec.ts`:

```ts
import { envelopeAad, open, seal, type Envelope } from "@/lib/crypto";
import type { ZodType } from "zod";
import { apartmentSchema, locationSchema, ratingSchema } from "./schemas";
import type { Apartment, Location, Rating } from "./types";

// One AAD per table so a ciphertext sealed as a rating can never be
// presented as an apartment, and per row so it can never move between rows.
const TABLE = {
  apartments: "apartments",
  ratings: "ratings",
  locations: "locations",
} as const;

function ratingRowId(apartmentId: string, userId: string): string {
  return `${apartmentId}:${userId}`;
}

// A row that fails to decrypt or to validate is "corrupt": the caller gets
// null and shows a placeholder rather than crashing the whole household.
async function openRow<T>(
  key: CryptoKey | null,
  envelope: Envelope,
  aad: string,
  schema: ZodType<T>
): Promise<T | null> {
  try {
    const value = await open(key, envelope, aad);
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function sealApartment(
  key: CryptoKey | null,
  householdId: number,
  id: string,
  data: Apartment
): Promise<Envelope> {
  return seal(key, data, envelopeAad(householdId, TABLE.apartments, id));
}

export function openApartment(
  key: CryptoKey | null,
  householdId: number,
  id: string,
  envelope: Envelope
): Promise<Apartment | null> {
  return openRow(key, envelope, envelopeAad(householdId, TABLE.apartments, id), apartmentSchema);
}

export function sealRating(
  key: CryptoKey | null,
  householdId: number,
  apartmentId: string,
  userId: string,
  data: Rating
): Promise<Envelope> {
  return seal(
    key,
    data,
    envelopeAad(householdId, TABLE.ratings, ratingRowId(apartmentId, userId))
  );
}

export function openRating(
  key: CryptoKey | null,
  householdId: number,
  apartmentId: string,
  userId: string,
  envelope: Envelope
): Promise<Rating | null> {
  return openRow(
    key,
    envelope,
    envelopeAad(householdId, TABLE.ratings, ratingRowId(apartmentId, userId)),
    ratingSchema
  );
}

export function sealLocation(
  key: CryptoKey | null,
  householdId: number,
  id: string,
  data: Location
): Promise<Envelope> {
  return seal(key, data, envelopeAad(householdId, TABLE.locations, id));
}

export function openLocation(
  key: CryptoKey | null,
  householdId: number,
  id: string,
  envelope: Envelope
): Promise<Location | null> {
  return openRow(key, envelope, envelopeAad(householdId, TABLE.locations, id), locationSchema);
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/household-data`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/household-data
git commit -m "feat(household-data): plaintext types, schemas, wire rows, ids, codec

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 5: `derive`, `short-code`, `enrich`, `maintenance` planners (pure)

**Files:**
- Create: `src/lib/household-data/derive.ts`, `short-code.ts`, `enrich.ts`, `maintenance.ts`
- Test: `src/lib/household-data/__tests__/derive.test.ts`, `short-code.test.ts`, `enrich.test.ts`, `maintenance.test.ts`

**Interfaces:**
- Consumes: types from Task 4.
- Produces:
  - `deriveApartments(apartments: DecodedApartment[], ratings: DecodedRating[], userId: string): ApartmentView[]`; `deriveLocations(locations: DecodedLocation[]): LocationView[]` (corrupt locations are dropped; sorted by `sortOrder`).
  - `pickLetters(random?: () => number): string`; `buildShortCode(parts: ShortCodeInput, letters?: string): string`; `uniqueShortCode(parts: ShortCodeInput, taken: Set<string>, random?: () => number): string` where `ShortCodeInput = { numRooms: number|null; numBathrooms: number|null; hasWashingMachine: boolean|null; postcode: string|null }`; `postcodeFromShortCode(code: string): string | null`.
  - `planEnrichment(previous: Apartment | null, next: Apartment): EnrichmentPlan` with `EnrichmentPlan = { geocode: boolean; shortCode: boolean; distances: boolean }`; `missingDistances(apartment: Apartment, locations: LocationView[]): LocationView[]`; `pruneDistances(apartment: Apartment, locations: LocationView[]): Apartment`.
  - `planGeocodeMaintenance(apartments: ApartmentView[]): ApartmentView[]`; `planDistanceMaintenance(apartments, locations, mode: "missing" | "all" = "missing"): { apartment: ApartmentView; locations: LocationView[] }[]`; `planListingMaintenance(apartments): ApartmentView[]`; `MaintenanceKind = "geocode" | "distances" | "listings"`; `MaintenanceReport = { updated: number; skipped: number; failed: { id: string; reason: string }[] }`.

- [ ] **Step 1: Write the failing tests**

`src/lib/household-data/__tests__/derive.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveApartments, deriveLocations } from "../derive";
import { EMPTY_RATING, emptyApartment, type DecodedApartment, type DecodedRating } from "../types";

const apt = (id: string, data = emptyApartment(`Flat ${id}`)): DecodedApartment => ({
  id, version: 1, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", data,
});
const rating = (apartmentId: string, userId: string, overallFeeling: number, kitchen = 0): DecodedRating => ({
  apartmentId, userId, userName: userId.toUpperCase(), updatedAt: "2026-09-02T00:00:00.000Z",
  data: { ...EMPTY_RATING, overallFeeling, kitchen },
});

describe("deriveApartments", () => {
  it("attaches ratings, averages over non-zero scores, and finds my rating", () => {
    const views = deriveApartments(
      [apt("a")],
      [rating("a", "u1", 4, 2), rating("a", "u2", 2, 0)],
      "u1"
    );
    expect(views).toHaveLength(1);
    expect(views[0].ratings.map((r) => r.userName)).toEqual(["U1", "U2"]);
    expect(views[0].avgOverall).toBe(3);
    expect(views[0].avgKitchen).toBe(2); // u2's 0 is "unrated", not a score
    expect(views[0].myRating).toBe(4);
  });

  it("returns null averages and myRating without ratings", () => {
    const [v] = deriveApartments([apt("a")], [], "u1");
    expect(v.avgOverall).toBeNull();
    expect(v.myRating).toBeNull();
    expect(v.ratings).toEqual([]);
  });

  it("renders a corrupt apartment as a placeholder that keeps its id", () => {
    const [v] = deriveApartments([apt("a", null as never)], [], "u1");
    expect(v.corrupt).toBe(true);
    expect(v.id).toBe("a");
    expect(v.name).toBe("Unreadable apartment");
  });

  it("drops corrupt ratings and ratings of unknown apartments", () => {
    const [v] = deriveApartments(
      [apt("a")],
      [{ ...rating("a", "u1", 3), data: null }, rating("zzz", "u2", 5)],
      "u1"
    );
    expect(v.ratings).toEqual([]);
    expect(v.avgOverall).toBeNull();
  });
});

describe("deriveLocations", () => {
  it("sorts by sortOrder and drops corrupt rows", () => {
    const loc = { label: "L", icon: "Briefcase", address: "A", latitude: null, longitude: null };
    const views = deriveLocations([
      { id: "b", sortOrder: 2, data: { ...loc, label: "B" } },
      { id: "x", sortOrder: 1, data: null },
      { id: "a", sortOrder: 0, data: { ...loc, label: "A" } },
    ]);
    expect(views.map((v) => v.label)).toEqual(["A", "B"]);
    expect(views[0]).toMatchObject({ id: "a", sortOrder: 0 });
  });
});
```

`src/lib/household-data/__tests__/short-code.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildShortCode, pickLetters, postcodeFromShortCode, uniqueShortCode } from "../short-code";

const parts = { numRooms: 3.5, numBathrooms: 1, hasWashingMachine: true, postcode: "8001" };

describe("short-code", () => {
  it("builds the documented format", () => {
    expect(buildShortCode(parts, "ABC")).toBe("ABC-3.5B-1b-WY-8001");
    expect(
      buildShortCode({ numRooms: null, numBathrooms: null, hasWashingMachine: null, postcode: null }, "XYZ")
    ).toBe("XYZ-?B-?b-W?-?");
    expect(buildShortCode({ ...parts, hasWashingMachine: false }, "ABC")).toBe("ABC-3.5B-1b-WN-8001");
  });

  it("picks letters from the 23-letter pool only", () => {
    for (let i = 0; i < 200; i++) {
      expect(pickLetters()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{3}$/);
    }
    expect(pickLetters(() => 0)).toBe("AAA");
    expect(pickLetters(() => 0.999)).toBe("ZZZ");
  });

  it("re-rolls letters until the code is not taken", () => {
    const rolls = [0, 0, 0, 0.5, 0.5, 0.5]; // AAA then MMM
    let i = 0;
    const random = () => rolls[i++ % rolls.length];
    const taken = new Set(["AAA-3.5B-1b-WY-8001"]);
    expect(uniqueShortCode(parts, taken, random)).toBe("MMM-3.5B-1b-WY-8001");
  });

  it("reads the postcode back out of a code", () => {
    expect(postcodeFromShortCode("ABC-3.5B-1b-WY-8001")).toBe("8001");
    expect(postcodeFromShortCode("ABC-3.5B-1b-WY-?")).toBeNull();
    expect(postcodeFromShortCode("garbage")).toBeNull();
  });
});
```

`src/lib/household-data/__tests__/enrich.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { missingDistances, planEnrichment, pruneDistances } from "../enrich";
import { emptyApartment, type LocationView } from "../types";

const base = { ...emptyApartment("Flat"), address: "A 1", numRooms: 3, numBathrooms: 1, hasWashingMachine: true };
const loc = (id: string): LocationView => ({
  id, sortOrder: 0, label: id, icon: "Briefcase", address: "X", latitude: 1, longitude: 2,
});

describe("planEnrichment", () => {
  it("does everything for a new apartment with an address", () => {
    expect(planEnrichment(null, base)).toEqual({ geocode: true, shortCode: true, distances: true });
  });

  it("only builds a short code for a new apartment without an address", () => {
    expect(planEnrichment(null, { ...base, address: null })).toEqual({
      geocode: false, shortCode: true, distances: false,
    });
  });

  it("re-geocodes and recomputes distances when the address changes", () => {
    expect(planEnrichment(base, { ...base, address: "B 2" })).toEqual({
      geocode: true, shortCode: true, distances: true,
    });
  });

  it("re-rolls only the short code when rooms, baths or washing machine change", () => {
    expect(planEnrichment(base, { ...base, numRooms: 4 })).toEqual({
      geocode: false, shortCode: true, distances: false,
    });
    expect(planEnrichment(base, { ...base, hasWashingMachine: null })).toEqual({
      geocode: false, shortCode: true, distances: false,
    });
  });

  it("does nothing when only unrelated fields change", () => {
    expect(planEnrichment(base, { ...base, rentChf: 999, summary: "x" })).toEqual({
      geocode: false, shortCode: false, distances: false,
    });
  });
});

describe("missingDistances / pruneDistances", () => {
  it("lists located locations the apartment has no distance for", () => {
    const apt = { ...base, distances: { a: { bikeMin: 1, transitMin: 2 } } };
    const nowhere = { ...loc("c"), latitude: null, longitude: null };
    expect(missingDistances(apt, [loc("a"), loc("b"), nowhere]).map((l) => l.id)).toEqual(["b"]);
  });

  it("drops distances for locations that no longer exist", () => {
    const apt = { ...base, distances: { a: { bikeMin: 1, transitMin: 2 }, gone: { bikeMin: 3, transitMin: 4 } } };
    expect(pruneDistances(apt, [loc("a")]).distances).toEqual({ a: { bikeMin: 1, transitMin: 2 } });
  });
});
```

`src/lib/household-data/__tests__/maintenance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planDistanceMaintenance, planGeocodeMaintenance, planListingMaintenance } from "../maintenance";
import { emptyApartment, type ApartmentView, type LocationView } from "../types";

const view = (id: string, over: Partial<ApartmentView> = {}): ApartmentView => ({
  ...emptyApartment(id), id, version: 1, createdAt: "", updatedAt: "", ratings: [],
  avgKitchen: null, avgBalconies: null, avgLocation: null, avgFloorplan: null, avgOverall: null, myRating: null,
  ...over,
});
const loc = (id: string, latitude: number | null = 1): LocationView => ({
  id, sortOrder: 0, label: id, icon: "Briefcase", address: "X", latitude, longitude: latitude,
});

describe("maintenance planners", () => {
  it("geocode: apartments with an address but no coordinates, never corrupt ones", () => {
    const plan = planGeocodeMaintenance([
      view("a", { address: "A" }),
      view("b", { address: "B", latitude: 1, longitude: 1 }),
      view("c"),
      view("d", { address: "D", corrupt: true }),
    ]);
    expect(plan.map((a) => a.id)).toEqual(["a"]);
  });

  it("distances: located apartments paired with the located locations they lack", () => {
    const plan = planDistanceMaintenance(
      [
        view("a", { address: "A", latitude: 1, longitude: 1, distances: { l1: { bikeMin: 1, transitMin: 1 } } }),
        view("b", { address: "B" }),
      ],
      [loc("l1"), loc("l2"), loc("l3", null)]
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].apartment.id).toBe("a");
    expect(plan[0].locations.map((l) => l.id)).toEqual(["l2"]);
  });

  it('distances "all": every located pair, including ones already present', () => {
    const plan = planDistanceMaintenance(
      [view("a", { address: "A", latitude: 1, longitude: 1, distances: { l1: { bikeMin: 1, transitMin: 1 } } })],
      [loc("l1"), loc("l2"), loc("l3", null)],
      "all"
    );
    expect(plan[0].locations.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("listings: apartments with a listing url", () => {
    const plan = planListingMaintenance([
      view("a", { listingUrl: "https://x" }),
      view("b"),
      view("c", { listingUrl: "https://y", corrupt: true }),
    ]);
    expect(plan.map((a) => a.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/household-data`
Expected: FAIL — the four modules do not exist.

- [ ] **Step 3: Implement**

`src/lib/household-data/derive.ts`:

```ts
import {
  emptyApartment,
  type ApartmentView,
  type DecodedApartment,
  type DecodedLocation,
  type DecodedRating,
  type LocationView,
  type Rating,
  type RatingView,
} from "./types";

type Category = keyof Omit<Rating, "comment">;

// 0 means "not rated" on every category, so it never drags an average down.
function average(ratings: RatingView[], category: Category): number | null {
  const scores = ratings.map((r) => r[category]).filter((v) => v > 0);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function deriveApartments(
  apartments: DecodedApartment[],
  ratings: DecodedRating[],
  userId: string
): ApartmentView[] {
  const byApartment = new Map<string, RatingView[]>();
  for (const r of ratings) {
    if (r.data === null) continue;
    const list = byApartment.get(r.apartmentId) ?? [];
    list.push({ ...r.data, userId: r.userId, userName: r.userName, updatedAt: r.updatedAt });
    byApartment.set(r.apartmentId, list);
  }

  return apartments.map((row) => {
    const mine = byApartment.get(row.id) ?? [];
    const meta = {
      id: row.id,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ratings: mine,
      avgKitchen: average(mine, "kitchen"),
      avgBalconies: average(mine, "balconies"),
      avgLocation: average(mine, "location"),
      avgFloorplan: average(mine, "floorplan"),
      avgOverall: average(mine, "overallFeeling"),
      myRating: mine.find((r) => r.userId === userId)?.overallFeeling || null,
    };
    if (row.data === null) {
      return { ...emptyApartment("Unreadable apartment"), ...meta, corrupt: true as const };
    }
    return { ...row.data, ...meta };
  });
}

export function deriveLocations(locations: DecodedLocation[]): LocationView[] {
  return locations
    .filter((l): l is DecodedLocation & { data: NonNullable<DecodedLocation["data"]> } => l.data !== null)
    .map((l) => ({ ...l.data, id: l.id, sortOrder: l.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
```

`src/lib/household-data/short-code.ts`:

```ts
// 23-letter pool: A–Z minus visually ambiguous letters (I, O, L).
const LETTER_POOL = "ABCDEFGHJKMNPQRSTUVWXYZ";
const MAX_REROLLS = 100;

export interface ShortCodeInput {
  numRooms: number | null;
  numBathrooms: number | null;
  hasWashingMachine: boolean | null;
  postcode: string | null;
}

export function pickLetters(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += LETTER_POOL[Math.floor(random() * LETTER_POOL.length)];
  }
  return out;
}

function formatNumber(v: number | null): string {
  return v == null ? "?" : String(v);
}

function formatWashing(v: boolean | null): string {
  if (v === true) return "Y";
  if (v === false) return "N";
  return "?";
}

export function buildShortCode(
  parts: ShortCodeInput,
  letters: string = pickLetters()
): string {
  return `${letters}-${formatNumber(parts.numRooms)}B-${formatNumber(parts.numBathrooms)}b-W${formatWashing(parts.hasWashingMachine)}-${parts.postcode ?? "?"}`;
}

// Uniqueness used to be a database constraint; the server can no longer see
// codes, so the client re-rolls the letters against the codes it holds.
// After MAX_REROLLS the last candidate is returned — 12 167 letter
// combinations make a persistent collision a bug, not a real state.
export function uniqueShortCode(
  parts: ShortCodeInput,
  taken: Set<string>,
  random: () => number = Math.random
): string {
  let code = buildShortCode(parts, pickLetters(random));
  for (let i = 0; i < MAX_REROLLS && taken.has(code); i++) {
    code = buildShortCode(parts, pickLetters(random));
  }
  return code;
}

// The postcode segment is the last one; "?" means unknown.
export function postcodeFromShortCode(code: string): string | null {
  const parts = code.split("-");
  if (parts.length !== 5) return null;
  const postcode = parts[4];
  return postcode === "?" || postcode === "" ? null : postcode;
}
```

`src/lib/household-data/enrich.ts`:

```ts
import type { Apartment, LocationView } from "./types";

export interface EnrichmentPlan {
  geocode: boolean;
  shortCode: boolean;
  distances: boolean;
}

// Decides, from a before/after pair, what the client must compute after a
// write: coordinates when the address changed, the short code when any of
// its inputs changed, distances whenever coordinates will change.
export function planEnrichment(
  previous: Apartment | null,
  next: Apartment
): EnrichmentPlan {
  const hasAddress = next.address !== null && next.address.trim() !== "";
  if (previous === null) {
    return { geocode: hasAddress, shortCode: true, distances: hasAddress };
  }
  const addressChanged = previous.address !== next.address;
  const codeInputsChanged =
    addressChanged ||
    previous.numRooms !== next.numRooms ||
    previous.numBathrooms !== next.numBathrooms ||
    previous.hasWashingMachine !== next.hasWashingMachine;
  return {
    geocode: addressChanged && hasAddress,
    shortCode: codeInputsChanged,
    distances: addressChanged && hasAddress,
  };
}

function located(loc: LocationView): boolean {
  return loc.latitude !== null && loc.longitude !== null;
}

export function missingDistances(
  apartment: Apartment,
  locations: LocationView[]
): LocationView[] {
  return locations.filter((l) => located(l) && !(l.id in apartment.distances));
}

export function pruneDistances(
  apartment: Apartment,
  locations: LocationView[]
): Apartment {
  const keep = new Set(locations.map((l) => l.id));
  const distances = Object.fromEntries(
    Object.entries(apartment.distances).filter(([id]) => keep.has(id))
  );
  return { ...apartment, distances };
}
```

`src/lib/household-data/maintenance.ts`:

```ts
import { missingDistances } from "./enrich";
import type { ApartmentView, LocationView } from "./types";

export type MaintenanceKind = "geocode" | "distances" | "listings";

export interface MaintenanceReport {
  updated: number;
  skipped: number;
  failed: { id: string; reason: string }[];
}

// Pure planners: which rows a maintenance pass should touch. The provider
// runs the network calls and writes.
export function planGeocodeMaintenance(apartments: ApartmentView[]): ApartmentView[] {
  return apartments.filter(
    (a) =>
      !a.corrupt &&
      a.address !== null &&
      a.address.trim() !== "" &&
      (a.latitude === null || a.longitude === null)
  );
}

// "missing" fills gaps (post-create enrichment, a new location); "all"
// recomputes every located pair (the settings page's Recompute button, a
// location whose address moved).
export function planDistanceMaintenance(
  apartments: ApartmentView[],
  locations: LocationView[],
  mode: "missing" | "all" = "missing"
): { apartment: ApartmentView; locations: LocationView[] }[] {
  const located = locations.filter((l) => l.latitude !== null && l.longitude !== null);
  return apartments
    .filter((a) => !a.corrupt && a.latitude !== null && a.longitude !== null)
    .map((apartment) => ({
      apartment,
      locations: mode === "all" ? located : missingDistances(apartment, located),
    }))
    .filter((entry) => entry.locations.length > 0);
}

export function planListingMaintenance(apartments: ApartmentView[]): ApartmentView[] {
  return apartments.filter((a) => !a.corrupt && a.listingUrl !== null && a.listingUrl !== "");
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/household-data`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/household-data
git commit -m "feat(household-data): derive views, short codes, enrichment and maintenance planners

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 6: Apartment routes — `GET/POST /api/apartments`, `PUT/DELETE /api/apartments/[id]`

**Files:**
- Create: `src/lib/data-rows.ts`, `src/app/api/apartments/route.ts`, `src/app/api/apartments/[id]/route.ts`
- Modify: `src/lib/storage.ts` (add `deleteStoredFile`)
- Test: `src/app/api/apartments/__tests__/apartments-routes.test.ts`, `src/lib/__tests__/storage.test.ts` (append)

**Interfaces:**
- Consumes: `requireMember`, `requireEnvelopeMode`, `parseBody`, `apiErrorResponse`, `isUniqueConstraintError` from `@/lib/api-route`; `envelopeSchema` from `@/lib/crypto-schemas`; `storedPathHousehold` from `@/lib/storage`; `apartments`/`ratings`/`locations` tables and `ApartmentRecord`/`RatingRecord`/`LocationRecord` from `@/lib/db/schema`; `ApartmentRow`/`RatingRow`/`LocationRow` from `@/lib/household-data/wire`.
- Produces:
  - `src/lib/data-rows.ts`: `isoOf(date: Date | null): string`, `apartmentRow(r: ApartmentRecord): ApartmentRow`, `ratingRow(r: RatingRecord & { userName: string | null }): RatingRow`, `locationRow(r: LocationRecord): LocationRow`, `parseStoredEnvelope(text: string): Envelope`.
  - `deleteStoredFile(storedUrl: string, expectedHouseholdId: number): Promise<void>` in `src/lib/storage.ts` — no-op on a foreign or malformed path, best effort otherwise.
  - Wire contract (client, Task 11): `GET /api/apartments → ApartmentRow[]` ordered by `createdAt, id`; `POST { id: uuid, envelope } → 201 ApartmentRow` / 409 `{ error: "Duplicate id" }`; `PUT /api/apartments/:id { version, envelope } → 200 ApartmentRow` / 409 `{ error: "Stale version", version }` / 404; `DELETE /api/apartments/:id` with optional JSON `{ pdfPath }` → 204 / 400 foreign pdfPath / 404.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/storage.test.ts` (dynamic imports inside each test, as the file already does; add `import fs from "node:fs"; import path from "node:path";` to the top of the file if they are not there). Make sure `BLOB_READ_WRITE_TOKEN` is unset in these tests (`delete process.env.BLOB_READ_WRITE_TOKEN;`) so the local branch runs:

```ts
describe("deleteStoredFile", () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("unlinks a local upload that belongs to the household", async () => {
    const { deleteStoredFile, UPLOADS_DIR } = await import("../storage");
    const dir = path.join(UPLOADS_DIR, "households", "7");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "x.pdf.enc");
    fs.writeFileSync(file, "x");
    await deleteStoredFile("/api/uploads/households/7/x.pdf.enc", 7);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("leaves a file of another household alone", async () => {
    const { deleteStoredFile, UPLOADS_DIR } = await import("../storage");
    const dir = path.join(UPLOADS_DIR, "households", "8");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "y.pdf.enc");
    fs.writeFileSync(file, "y");
    await deleteStoredFile("/api/uploads/households/8/y.pdf.enc", 7);
    expect(fs.existsSync(file)).toBe(true);
    fs.unlinkSync(file);
  });

  it("calls del() for a cloud path", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const mockDel = vi.fn(async () => {});
    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: mockDel }));
    const { deleteStoredFile } = await import("../storage");
    await deleteStoredFile("/api/pdf/households/7/x.pdf.enc", 7);
    expect(mockDel).toHaveBeenCalledWith("households/7/x.pdf.enc");
  });

  it("resolves for a missing file and for garbage", async () => {
    const { deleteStoredFile } = await import("../storage");
    await expect(deleteStoredFile("/api/uploads/households/7/nope.pdf.enc", 7)).resolves.toBeUndefined();
    await expect(deleteStoredFile("https://evil/x", 7)).resolves.toBeUndefined();
  });
});
```

`src/app/api/apartments/__tests__/apartments-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

const deleteStoredFile = vi.fn(async () => {});
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, deleteStoredFile: (...args: unknown[]) => deleteStoredFile(...(args as [])) };
});

import { GET as listGET, POST as createPOST } from "../route";
import { PUT as updatePUT, DELETE as removeDELETE } from "../[id]/route";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const v1 = (tag: string) => ({ v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ct: Buffer.from(tag).toString("base64") });
const v0 = { v: 0 as const, data: { name: "plain" } };

function json(method: string, body?: unknown) {
  return new Request("http://localhost/api/apartments", {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let hid: number;
let otherHid: number;

beforeEach(async () => {
  vi.stubEnv("FLATPARE_ENCRYPTION", "on");
  signedIn = true;
  deleteStoredFile.mockClear();
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m", "x"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  const [h2] = await db.insert(households).values({ name: "X", ownerId: "x" }).returning();
  otherHid = h2.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
  await db.insert(householdMembers).values({ householdId: otherHid, userId: "x", role: "owner" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

afterEach(() => vi.unstubAllEnvs());

async function seed(id: string, householdId: number, tag = id) {
  await db.insert(apartments).values({ id, householdId, envelope: JSON.stringify(v1(tag)) });
}

describe("GET /api/apartments", () => {
  it("401s without a session", async () => {
    signedIn = false;
    expect((await listGET()).status).toBe(401);
  });

  it("returns only the household's rows as wire rows", async () => {
    await seed(ID_A, hid);
    await seed(ID_B, otherHid);
    const res = await listGET();
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: ID_A, version: 1, envelope: v1(ID_A) });
    expect(typeof rows[0].createdAt).toBe("string");
  });

  it("404s a removed member whose token still names the household", async () => {
    currentSession.userId = "x"; // x is not a member of hid
    expect((await listGET()).status).toBe(404);
  });
});

describe("POST /api/apartments", () => {
  it("creates a row with the client-minted id", async () => {
    const res = await createPOST(json("POST", { id: ID_A, envelope: v1("a") }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: ID_A, version: 1, envelope: v1("a") });
    const [row] = await db.select().from(apartments).where(eq(apartments.id, ID_A));
    expect(row.householdId).toBe(hid);
  });

  it("409s a duplicate id, even from another household", async () => {
    await seed(ID_A, otherHid);
    const res = await createPOST(json("POST", { id: ID_A, envelope: v1("a") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Duplicate id");
  });

  it("400s a plaintext envelope under encryption on, writing nothing", async () => {
    const res = await createPOST(json("POST", { id: ID_A, envelope: v0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Plaintext envelope in an encrypted deployment");
    expect(await db.select().from(apartments)).toHaveLength(0);
  });

  it("400s an encrypted envelope under encryption off", async () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    const res = await createPOST(json("POST", { id: ID_A, envelope: v1("a") }));
    expect(res.status).toBe(400);
  });

  it("400s a non-uuid id", async () => {
    const res = await createPOST(json("POST", { id: "1", envelope: v1("a") }));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/apartments/[id]", () => {
  it("replaces the envelope and bumps the version", async () => {
    await seed(ID_A, hid);
    const res = await updatePUT(json("PUT", { version: 1, envelope: v1("new") }), params(ID_A));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: ID_A, version: 2, envelope: v1("new") });
  });

  it("409s a stale version with the current one and leaves the row unchanged", async () => {
    await seed(ID_A, hid);
    await updatePUT(json("PUT", { version: 1, envelope: v1("second") }), params(ID_A));
    const res = await updatePUT(json("PUT", { version: 1, envelope: v1("third") }), params(ID_A));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Stale version", version: 2 });
    const [row] = await db.select().from(apartments).where(eq(apartments.id, ID_A));
    expect(JSON.parse(row.envelope)).toEqual(v1("second"));
  });

  it("404s another household's row without touching it", async () => {
    await seed(ID_A, otherHid);
    const res = await updatePUT(json("PUT", { version: 1, envelope: v1("evil") }), params(ID_A));
    expect(res.status).toBe(404);
    const [row] = await db.select().from(apartments).where(eq(apartments.id, ID_A));
    expect(JSON.parse(row.envelope)).toEqual(v1(ID_A));
  });

  it("404s an unknown id and a malformed id", async () => {
    expect((await updatePUT(json("PUT", { version: 1, envelope: v1("a") }), params(ID_B))).status).toBe(404);
    expect((await updatePUT(json("PUT", { version: 1, envelope: v1("a") }), params("nope"))).status).toBe(404);
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await updatePUT(json("PUT", { version: 1, envelope: v1("a") }), params(ID_A))).status).toBe(401);
  });
});

describe("DELETE /api/apartments/[id]", () => {
  it("deletes the row and the household's file", async () => {
    await seed(ID_A, hid);
    const res = await removeDELETE(
      json("DELETE", { pdfPath: `/api/uploads/households/${hid}/${ID_A}.pdf.enc` }),
      params(ID_A)
    );
    expect(res.status).toBe(204);
    expect(await db.select().from(apartments)).toHaveLength(0);
    expect(deleteStoredFile).toHaveBeenCalledWith(`/api/uploads/households/${hid}/${ID_A}.pdf.enc`, hid);
  });

  it("deletes without a body", async () => {
    await seed(ID_A, hid);
    expect((await removeDELETE(json("DELETE"), params(ID_A))).status).toBe(204);
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it("400s a foreign pdfPath and keeps the row", async () => {
    await seed(ID_A, hid);
    const res = await removeDELETE(
      json("DELETE", { pdfPath: `/api/uploads/households/${otherHid}/${ID_A}.pdf.enc` }),
      params(ID_A)
    );
    expect(res.status).toBe(400);
    expect(await db.select().from(apartments)).toHaveLength(1);
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it("404s another household's row", async () => {
    await seed(ID_A, otherHid);
    expect((await removeDELETE(json("DELETE"), params(ID_A))).status).toBe(404);
    expect(await db.select().from(apartments)).toHaveLength(1);
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await removeDELETE(json("DELETE"), params(ID_A))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/api/apartments src/lib/__tests__/storage.test.ts`
Expected: FAIL — route modules and `deleteStoredFile` missing.

- [ ] **Step 3: Implement `data-rows.ts` and `deleteStoredFile`**

`src/lib/data-rows.ts`:

```ts
import type { Envelope } from "@/lib/crypto";
import type { ApartmentRecord, LocationRecord, RatingRecord } from "@/lib/db/schema";
import type { ApartmentRow, LocationRow, RatingRow } from "@/lib/household-data/wire";

// Drizzle gives timestamps back as Date (or null before the default fires
// on an in-memory insert); the wire always carries ISO strings.
export function isoOf(date: Date | null): string {
  return (date ?? new Date()).toISOString();
}

// The envelope column is opaque text. It was validated by envelopeSchema
// on the way in, so parsing it back is safe; the server never looks inside.
export function parseStoredEnvelope(text: string): Envelope {
  return JSON.parse(text) as Envelope;
}

export function apartmentRow(r: ApartmentRecord): ApartmentRow {
  return {
    id: r.id,
    version: r.version,
    envelope: parseStoredEnvelope(r.envelope),
    createdAt: isoOf(r.createdAt),
    updatedAt: isoOf(r.updatedAt),
  };
}

export function ratingRow(r: RatingRecord & { userName: string | null }): RatingRow {
  return {
    apartmentId: r.apartmentId,
    userId: r.userId,
    userName: r.userName ?? "Member",
    envelope: parseStoredEnvelope(r.envelope),
    updatedAt: isoOf(r.updatedAt),
  };
}

export function locationRow(r: LocationRecord): LocationRow {
  return {
    id: r.id,
    sortOrder: r.sortOrder,
    envelope: parseStoredEnvelope(r.envelope),
    createdAt: isoOf(r.createdAt),
    updatedAt: isoOf(r.updatedAt),
  };
}
```

In `src/lib/storage.ts`, change the `@vercel/blob` import to `import { put, get, del } from "@vercel/blob";` and append:

```ts
// Best-effort removal of an apartment's stored file when the row is
// deleted. A path that does not resolve to `expectedHouseholdId` is ignored
// (the route already answered 400 for it); a missing file is not an error.
export async function deleteStoredFile(
  storedUrl: string,
  expectedHouseholdId: number
): Promise<void> {
  const resolved = storedPathHousehold(storedUrl);
  if (!resolved || resolved.householdId !== expectedHouseholdId) return;
  try {
    if (resolved.canonicalUrl.startsWith("/api/pdf/")) {
      await del(resolved.canonicalUrl.slice("/api/pdf/".length));
      return;
    }
    const key = resolved.canonicalUrl.slice("/api/uploads/".length);
    const filePath = path.resolve(UPLOADS_DIR, key);
    if (!filePath.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) return;
    await fs.promises.unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    console.warn("[storage] deleteStoredFile failed", storedUrl, err);
  }
}
```

(`fs` and `path` are already imported at the top of `storage.ts`; keep the existing import names.)

- [ ] **Step 4: Implement the routes**

`src/app/api/apartments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  isUniqueConstraintError,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { apartmentRow } from "@/lib/data-rows";

const createSchema = z.object({ id: z.uuid(), envelope: envelopeSchema });

export async function GET() {
  try {
    const { householdId } = await requireMember();
    const rows = await db
      .select()
      .from(apartments)
      .where(eq(apartments.householdId, householdId))
      .orderBy(asc(apartments.createdAt), asc(apartments.id));
    return NextResponse.json(rows.map(apartmentRow));
  } catch (e) {
    return apiErrorResponse(e, "apartments:list");
  }
}

export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    const body = await parseBody(req, createSchema);
    requireEnvelopeMode(body.envelope);
    let created;
    try {
      [created] = await db
        .insert(apartments)
        .values({ id: body.id, householdId, envelope: JSON.stringify(body.envelope) })
        .returning();
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new ApiError("Duplicate id", 409);
      throw err;
    }
    return NextResponse.json(apartmentRow(created), { status: 201 });
  } catch (e) {
    return apiErrorResponse(e, "apartments:create");
  }
}
```

`src/app/api/apartments/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { apartmentRow } from "@/lib/data-rows";
import { deleteStoredFile, storedPathHousehold } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  version: z.number().int().min(1),
  envelope: envelopeSchema,
});
const deleteSchema = z.object({ pdfPath: z.string().min(1).optional() });

// A malformed id is a 404 like an unknown one: the id space is opaque and
// there is nothing to validate against.
async function rowId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
  return id;
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const id = await rowId(ctx);
    const body = await parseBody(req, updateSchema);
    requireEnvelopeMode(body.envelope);

    // Optimistic concurrency: the UPDATE only lands when the version the
    // client read is still current. Zero rows means stale or not ours.
    const updated = await db
      .update(apartments)
      .set({
        envelope: JSON.stringify(body.envelope),
        version: sql`${apartments.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(apartments.id, id),
          eq(apartments.householdId, householdId),
          eq(apartments.version, body.version)
        )
      )
      .returning();
    if (updated.length === 1) return NextResponse.json(apartmentRow(updated[0]));

    const [current] = await db
      .select({ version: apartments.version })
      .from(apartments)
      .where(and(eq(apartments.id, id), eq(apartments.householdId, householdId)));
    if (!current) throw new ApiError("Not found", 404);
    return NextResponse.json(
      { error: "Stale version", version: current.version },
      { status: 409 }
    );
  } catch (e) {
    return apiErrorResponse(e, "apartments:update");
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const id = await rowId(ctx);
    // The body is optional: a plain DELETE has no pdf to remove.
    const text = await req.text();
    const body = text ? deleteSchema.parse(JSON.parse(text)) : {};
    let pdfPath: string | null = null;
    if (body.pdfPath) {
      const resolved = storedPathHousehold(body.pdfPath);
      if (!resolved || resolved.householdId !== householdId) {
        throw new ApiError("pdfPath does not belong to this household", 400);
      }
      pdfPath = resolved.canonicalUrl;
    }

    const deleted = await db
      .delete(apartments)
      .where(and(eq(apartments.id, id), eq(apartments.householdId, householdId)))
      .returning({ id: apartments.id });
    if (deleted.length === 0) throw new ApiError("Not found", 404);

    if (pdfPath) await deleteStoredFile(pdfPath, householdId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
    }
    return apiErrorResponse(e, "apartments:delete");
  }
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/app/api/apartments src/lib/__tests__/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data-rows.ts src/lib/storage.ts src/lib/__tests__/storage.test.ts src/app/api/apartments
git commit -m "feat(api): envelope-only apartment routes with versioned writes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 7: Rating routes — `GET /api/ratings`, `PUT/DELETE /api/apartments/[id]/ratings/me`

**Files:**
- Create: `src/app/api/ratings/route.ts`, `src/app/api/apartments/[id]/ratings/me/route.ts`
- Test: `src/app/api/ratings/__tests__/ratings-routes.test.ts`

**Interfaces:**
- Consumes: Task 3 helpers, `ratingRow` from `@/lib/data-rows`, `ratings`/`apartments` tables, `users` from `@/lib/db/schema-auth`.
- Produces (client, Task 11): `GET /api/ratings → RatingRow[]` (every rating in the household, joined to the rater's name); `PUT /api/apartments/:id/ratings/me { envelope } → 200 RatingRow` (upsert on `(apartmentId, userId)`, 404 when the apartment is not in the household); `DELETE /api/apartments/:id/ratings/me → 204` (204 also when there was nothing to delete; 404 when the apartment is not in the household).

- [ ] **Step 1: Write the failing tests**

`src/app/api/ratings/__tests__/ratings-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { apartments, households, householdMembers, ratings } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

import { GET as listGET } from "../route";
import { PUT as ratePUT, DELETE as unrateDELETE } from "../../apartments/[id]/ratings/me/route";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_X = "33333333-3333-4333-8333-333333333333";
const v1 = (tag: string) => ({ v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ct: Buffer.from(tag).toString("base64") });

function json(method: string, body?: unknown) {
  return new Request("http://localhost/api/ratings", {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let hid: number;
let otherHid: number;

beforeEach(async () => {
  vi.stubEnv("FLATPARE_ENCRYPTION", "on");
  signedIn = true;
  await db.delete(ratings);
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m", "x"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id.toUpperCase() });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  const [h2] = await db.insert(households).values({ name: "X", ownerId: "x" }).returning();
  otherHid = h2.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
  await db.insert(householdMembers).values({ householdId: otherHid, userId: "x", role: "owner" });
  await db.insert(apartments).values({ id: ID_A, householdId: hid, envelope: JSON.stringify(v1("a")) });
  await db.insert(apartments).values({ id: ID_X, householdId: otherHid, envelope: JSON.stringify(v1("x")) });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

afterEach(() => vi.unstubAllEnvs());

describe("PUT /api/apartments/[id]/ratings/me", () => {
  it("creates then replaces only the caller's rating", async () => {
    const first = await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_A));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ apartmentId: ID_A, userId: "o", userName: "O", envelope: v1("o1") });

    currentSession.userId = "m";
    await ratePUT(json("PUT", { envelope: v1("m1") }), params(ID_A));

    currentSession.userId = "o";
    const second = await ratePUT(json("PUT", { envelope: v1("o2") }), params(ID_A));
    expect(second.status).toBe(200);

    const rows = await db.select().from(ratings);
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows.find((r) => r.userId === "o")!.envelope)).toEqual(v1("o2"));
    expect(JSON.parse(rows.find((r) => r.userId === "m")!.envelope)).toEqual(v1("m1"));
  });

  it("404s an apartment of another household", async () => {
    const res = await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_X));
    expect(res.status).toBe(404);
    expect(await db.select().from(ratings)).toHaveLength(0);
  });

  it("400s a plaintext envelope under encryption on", async () => {
    const res = await ratePUT(json("PUT", { envelope: { v: 0, data: {} } }), params(ID_A));
    expect(res.status).toBe(400);
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_A))).status).toBe(401);
  });
});

describe("GET /api/ratings", () => {
  it("returns the household's ratings with rater names", async () => {
    await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_A));
    currentSession.userId = "m";
    await ratePUT(json("PUT", { envelope: v1("m1") }), params(ID_A));
    await db.insert(ratings).values({ householdId: otherHid, apartmentId: ID_X, userId: "x", envelope: JSON.stringify(v1("x1")) });

    const res = await listGET();
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { userId: string }) => r.userId).sort()).toEqual(["m", "o"]);
    expect(rows.find((r: { userId: string }) => r.userId === "m").userName).toBe("M");
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await listGET()).status).toBe(401);
  });
});

describe("DELETE /api/apartments/[id]/ratings/me", () => {
  it("removes only the caller's rating", async () => {
    await ratePUT(json("PUT", { envelope: v1("o1") }), params(ID_A));
    currentSession.userId = "m";
    await ratePUT(json("PUT", { envelope: v1("m1") }), params(ID_A));
    currentSession.userId = "o";

    expect((await unrateDELETE(json("DELETE"), params(ID_A))).status).toBe(204);
    const rows = await db.select().from(ratings);
    expect(rows.map((r) => r.userId)).toEqual(["m"]);
  });

  it("is 204 when nothing was there and 404 for a foreign apartment", async () => {
    expect((await unrateDELETE(json("DELETE"), params(ID_A))).status).toBe(204);
    expect((await unrateDELETE(json("DELETE"), params(ID_X))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/ratings`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/app/api/ratings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ratings } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { ratingRow } from "@/lib/data-rows";

// One fetch for the whole household: ratings are small and the client
// derives every average locally.
export async function GET() {
  try {
    const { householdId } = await requireMember();
    const rows = await db
      .select({
        householdId: ratings.householdId,
        apartmentId: ratings.apartmentId,
        userId: ratings.userId,
        envelope: ratings.envelope,
        createdAt: ratings.createdAt,
        updatedAt: ratings.updatedAt,
        userName: users.name,
      })
      .from(ratings)
      .innerJoin(users, eq(users.id, ratings.userId))
      .where(eq(ratings.householdId, householdId));
    return NextResponse.json(rows.map(ratingRow));
  } catch (e) {
    return apiErrorResponse(e, "ratings:list");
  }
}
```

`src/app/api/apartments/[id]/ratings/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, ratings } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { ratingRow } from "@/lib/data-rows";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ envelope: envelopeSchema });

// Ratings hang off an apartment the caller's household owns; anything else
// is 404 so the id space stays opaque across households.
async function ownedApartmentId(ctx: Ctx, householdId: number): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
  const [row] = await db
    .select({ id: apartments.id })
    .from(apartments)
    .where(and(eq(apartments.id, id), eq(apartments.householdId, householdId)));
  if (!row) throw new ApiError("Not found", 404);
  return row.id;
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { householdId, userId } = await requireMember();
    const apartmentId = await ownedApartmentId(ctx, householdId);
    const body = await parseBody(req, bodySchema);
    requireEnvelopeMode(body.envelope);

    const envelope = JSON.stringify(body.envelope);
    const [saved] = await db
      .insert(ratings)
      .values({ householdId, apartmentId, userId, envelope })
      .onConflictDoUpdate({
        target: [ratings.apartmentId, ratings.userId],
        set: { envelope, updatedAt: new Date() },
      })
      .returning();
    const [user] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId));
    return NextResponse.json(ratingRow({ ...saved, userName: user?.name ?? null }));
  } catch (e) {
    return apiErrorResponse(e, "ratings:upsert");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { householdId, userId } = await requireMember();
    const apartmentId = await ownedApartmentId(ctx, householdId);
    await db
      .delete(ratings)
      .where(and(eq(ratings.apartmentId, apartmentId), eq(ratings.userId, userId)));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "ratings:delete");
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/app/api/ratings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ratings "src/app/api/apartments/[id]/ratings"
git commit -m "feat(api): envelope-only rating routes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 8: Locations — `src/lib/locations.ts` and `/api/locations` routes

**Files:**
- Create: `src/lib/locations.ts`, `src/app/api/locations/route.ts`, `src/app/api/locations/[id]/route.ts`, `src/app/api/locations/[id]/move/route.ts`
- Test: `src/lib/__tests__/locations.test.ts`, `src/app/api/locations/__tests__/locations-routes.test.ts`

**Interfaces:**
- Consumes: `MAX_LOCATIONS` from `@/lib/location-icons` (existing, value 5); `HouseholdError` from `@/lib/household`; `locations` table; `locationRow` from `@/lib/data-rows`; Task 3 helpers.
- Produces:
  - `src/lib/locations.ts`: `listLocations(householdId): Promise<LocationRecord[]>` (ordered by `sortOrder, id`); `createLocation(householdId, input: { id: string; envelope: string }): Promise<LocationRecord>` (throws `HouseholdError("Too many locations", 409)` at `MAX_LOCATIONS`); `updateLocation(householdId, id, envelope: string): Promise<LocationRecord | null>`; `deleteLocation(householdId, id): Promise<boolean>`; `moveLocation(householdId, id, direction: "up" | "down"): Promise<boolean>` (false when the row is missing or already at the edge).
  - Wire (client, Task 11): `GET /api/locations → LocationRow[]`; `POST { id: uuid, envelope } → 201 LocationRow` / 409 `Too many locations` / 409 `Duplicate id`; `PUT /api/locations/:id { envelope } → 200 LocationRow` / 404; `DELETE /api/locations/:id → 204` / 404; `POST /api/locations/:id/move { direction } → 200 LocationRow[]` (the new order) / 404.

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/locations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { households, locations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import {
  createLocation,
  deleteLocation,
  listLocations,
  moveLocation,
  updateLocation,
} from "@/lib/locations";
import { MAX_LOCATIONS } from "@/lib/location-icons";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const ENV = JSON.stringify({ v: 0, data: {} });

let hid: number;

beforeEach(async () => {
  await db.delete(locations);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com", name: "o" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
});

describe("locations", () => {
  it("creates with increasing sortOrder and lists in order", async () => {
    await createLocation(hid, { id: uuid(1), envelope: ENV });
    await createLocation(hid, { id: uuid(2), envelope: ENV });
    const rows = await listLocations(hid);
    expect(rows.map((r) => [r.id, r.sortOrder])).toEqual([[uuid(1), 0], [uuid(2), 1]]);
  });

  it("refuses the sixth location", async () => {
    for (let i = 1; i <= MAX_LOCATIONS; i++) {
      await createLocation(hid, { id: uuid(i), envelope: ENV });
    }
    await expect(createLocation(hid, { id: uuid(99), envelope: ENV })).rejects.toMatchObject({
      message: "Too many locations",
      status: 409,
    });
  });

  it("updates and deletes only within the household", async () => {
    await createLocation(hid, { id: uuid(1), envelope: ENV });
    const other = JSON.stringify({ v: 0, data: { label: "x" } });
    expect((await updateLocation(hid, uuid(1), other))?.envelope).toBe(other);
    expect(await updateLocation(hid + 1, uuid(1), other)).toBeNull();
    expect(await deleteLocation(hid + 1, uuid(1))).toBe(false);
    expect(await deleteLocation(hid, uuid(1))).toBe(true);
    expect(await listLocations(hid)).toEqual([]);
  });

  it("moves up and down, and reports edges", async () => {
    for (let i = 1; i <= 3; i++) await createLocation(hid, { id: uuid(i), envelope: ENV });
    expect(await moveLocation(hid, uuid(1), "up")).toBe(false);
    expect(await moveLocation(hid, uuid(3), "up")).toBe(true);
    expect((await listLocations(hid)).map((r) => r.id)).toEqual([uuid(1), uuid(3), uuid(2)]);
    expect(await moveLocation(hid, uuid(1), "down")).toBe(true);
    expect((await listLocations(hid)).map((r) => r.id)).toEqual([uuid(3), uuid(1), uuid(2)]);
    expect(await moveLocation(hid, uuid(2), "down")).toBe(false);
    expect(await moveLocation(hid, uuid(42), "down")).toBe(false);
  });
});
```

`src/app/api/locations/__tests__/locations-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, locations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

import { GET as listGET, POST as createPOST } from "../route";
import { PUT as updatePUT, DELETE as removeDELETE } from "../[id]/route";
import { POST as movePOST } from "../[id]/move/route";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const v1 = (tag: string) => ({ v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ct: Buffer.from(tag).toString("base64") });

function json(method: string, body?: unknown) {
  return new Request("http://localhost/api/locations", {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let hid: number;
let otherHid: number;

beforeEach(async () => {
  vi.stubEnv("FLATPARE_ENCRYPTION", "on");
  signedIn = true;
  await db.delete(locations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "x"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  const [h2] = await db.insert(households).values({ name: "X", ownerId: "x" }).returning();
  otherHid = h2.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: otherHid, userId: "x", role: "owner" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

afterEach(() => vi.unstubAllEnvs());

describe("/api/locations", () => {
  it("401s every handler without a session", async () => {
    signedIn = false;
    expect((await listGET()).status).toBe(401);
    expect((await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }))).status).toBe(401);
    expect((await updatePUT(json("PUT", { envelope: v1("a") }), params(uuid(1)))).status).toBe(401);
    expect((await removeDELETE(json("DELETE"), params(uuid(1)))).status).toBe(401);
    expect((await movePOST(json("POST", { direction: "up" }), params(uuid(1)))).status).toBe(401);
  });

  it("creates, lists, updates, moves and deletes within the household", async () => {
    const created = await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: uuid(1), sortOrder: 0, envelope: v1("a") });
    await createPOST(json("POST", { id: uuid(2), envelope: v1("b") }));

    const updated = await updatePUT(json("PUT", { envelope: v1("a2") }), params(uuid(1)));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: uuid(1), envelope: v1("a2") });

    const moved = await movePOST(json("POST", { direction: "up" }), params(uuid(2)));
    expect(moved.status).toBe(200);
    expect((await moved.json()).map((r: { id: string }) => r.id)).toEqual([uuid(2), uuid(1)]);

    expect((await removeDELETE(json("DELETE"), params(uuid(2)))).status).toBe(204);
    const list = await listGET();
    expect((await list.json()).map((r: { id: string }) => r.id)).toEqual([uuid(1)]);
  });

  it("404s another household's location on update, delete and move", async () => {
    await db.insert(locations).values({ id: uuid(9), householdId: otherHid, sortOrder: 0, envelope: JSON.stringify(v1("x")) });
    expect((await updatePUT(json("PUT", { envelope: v1("evil") }), params(uuid(9)))).status).toBe(404);
    expect((await removeDELETE(json("DELETE"), params(uuid(9)))).status).toBe(404);
    expect((await movePOST(json("POST", { direction: "down" }), params(uuid(9)))).status).toBe(404);
    expect(await db.select().from(locations)).toHaveLength(1);
  });

  it("400s a plaintext envelope under encryption on and 409s the sixth location", async () => {
    expect((await createPOST(json("POST", { id: uuid(1), envelope: { v: 0, data: {} } }))).status).toBe(400);
    for (let i = 1; i <= 5; i++) {
      expect((await createPOST(json("POST", { id: uuid(i), envelope: v1("a") }))).status).toBe(201);
    }
    const res = await createPOST(json("POST", { id: uuid(6), envelope: v1("a") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Too many locations");
  });

  it("409s a duplicate id", async () => {
    await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    const res = await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Duplicate id");
  });

  it("returns 200 with the unchanged order when moving past an edge", async () => {
    await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    const res = await movePOST(json("POST", { direction: "up" }), params(uuid(1)));
    expect(res.status).toBe(200);
    expect((await res.json()).map((r: { id: string }) => r.id)).toEqual([uuid(1)]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/__tests__/locations.test.ts src/app/api/locations`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/locations.ts`**

```ts
import { and, asc, eq, gt, lt, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { locations, type LocationRecord } from "@/lib/db/schema";
import { HouseholdError } from "@/lib/household";
import { MAX_LOCATIONS } from "@/lib/location-icons";

export async function listLocations(householdId: number): Promise<LocationRecord[]> {
  return db
    .select()
    .from(locations)
    .where(eq(locations.householdId, householdId))
    .orderBy(asc(locations.sortOrder), asc(locations.id));
}

export async function createLocation(
  householdId: number,
  input: { id: string; envelope: string }
): Promise<LocationRecord> {
  return db.transaction(async (tx) => {
    const [{ count, maxOrder }] = await tx
      .select({
        count: sql<number>`count(*)`,
        maxOrder: sql<number | null>`max(${locations.sortOrder})`,
      })
      .from(locations)
      .where(eq(locations.householdId, householdId));
    if (count >= MAX_LOCATIONS) {
      throw new HouseholdError("Too many locations", 409);
    }
    const [created] = await tx
      .insert(locations)
      .values({
        id: input.id,
        householdId,
        sortOrder: maxOrder === null ? 0 : maxOrder + 1,
        envelope: input.envelope,
      })
      .returning();
    return created;
  });
}

export async function updateLocation(
  householdId: number,
  id: string,
  envelope: string
): Promise<LocationRecord | null> {
  const [updated] = await db
    .update(locations)
    .set({ envelope, updatedAt: new Date() })
    .where(and(eq(locations.id, id), eq(locations.householdId, householdId)))
    .returning();
  return updated ?? null;
}

export async function deleteLocation(householdId: number, id: string): Promise<boolean> {
  const deleted = await db
    .delete(locations)
    .where(and(eq(locations.id, id), eq(locations.householdId, householdId)))
    .returning({ id: locations.id });
  return deleted.length > 0;
}

// Swaps sortOrder with the nearest neighbour in `direction`. Returns false
// when the row is missing or already first/last. Locations carry no
// version column: the last write wins, and the client reloads the order
// the server returns.
export async function moveLocation(
  householdId: number,
  id: string,
  direction: "up" | "down"
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ sortOrder: locations.sortOrder })
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.householdId, householdId)));
    if (!row) return false;

    const [neighbour] = await tx
      .select({ id: locations.id, sortOrder: locations.sortOrder })
      .from(locations)
      .where(
        and(
          eq(locations.householdId, householdId),
          direction === "up"
            ? lt(locations.sortOrder, row.sortOrder)
            : gt(locations.sortOrder, row.sortOrder)
        )
      )
      .orderBy(direction === "up" ? desc(locations.sortOrder) : asc(locations.sortOrder))
      .limit(1);
    if (!neighbour) return false;

    await tx.update(locations).set({ sortOrder: neighbour.sortOrder }).where(eq(locations.id, id));
    await tx.update(locations).set({ sortOrder: row.sortOrder }).where(eq(locations.id, neighbour.id));
    return true;
  });
}
```

- [ ] **Step 4: Implement the routes**

`src/app/api/locations/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  isUniqueConstraintError,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { locationRow } from "@/lib/data-rows";
import { createLocation, listLocations } from "@/lib/locations";

const createSchema = z.object({ id: z.uuid(), envelope: envelopeSchema });

export async function GET() {
  try {
    const { householdId } = await requireMember();
    return NextResponse.json((await listLocations(householdId)).map(locationRow));
  } catch (e) {
    return apiErrorResponse(e, "locations:list");
  }
}

export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    const body = await parseBody(req, createSchema);
    requireEnvelopeMode(body.envelope);
    try {
      const created = await createLocation(householdId, {
        id: body.id,
        envelope: JSON.stringify(body.envelope),
      });
      return NextResponse.json(locationRow(created), { status: 201 });
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new ApiError("Duplicate id", 409);
      throw err;
    }
  } catch (e) {
    return apiErrorResponse(e, "locations:create");
  }
}
```

`src/app/api/locations/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { locationRow } from "@/lib/data-rows";
import { deleteLocation, updateLocation } from "@/lib/locations";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({ envelope: envelopeSchema });

async function rowId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
  return id;
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const id = await rowId(ctx);
    const body = await parseBody(req, updateSchema);
    requireEnvelopeMode(body.envelope);
    const updated = await updateLocation(householdId, id, JSON.stringify(body.envelope));
    if (!updated) throw new ApiError("Not found", 404);
    return NextResponse.json(locationRow(updated));
  } catch (e) {
    return apiErrorResponse(e, "locations:update");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const id = await rowId(ctx);
    if (!(await deleteLocation(householdId, id))) throw new ApiError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "locations:delete");
  }
}
```

`src/app/api/locations/[id]/move/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { locations } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { locationRow } from "@/lib/data-rows";
import { listLocations, moveLocation } from "@/lib/locations";

type Ctx = { params: Promise<{ id: string }> };

const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
    const body = await parseBody(req, moveSchema);

    const moved = await moveLocation(householdId, id, body.direction);
    if (!moved) {
      // Distinguish "at the edge" (fine, return the order) from "not ours".
      const [row] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, id), eq(locations.householdId, householdId)));
      if (!row) throw new ApiError("Not found", 404);
    }
    return NextResponse.json((await listLocations(householdId)).map(locationRow));
  } catch (e) {
    return apiErrorResponse(e, "locations:move");
  }
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/lib/__tests__/locations.test.ts src/app/api/locations`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/locations.ts src/lib/__tests__/locations.test.ts src/app/api/locations
git commit -m "feat(api): envelope-only location routes with server-side ordering

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 9: Blind process endpoints — `/api/process/{geocode,distance,check-listing,parse-pdf}`

**Files:**
- Create: `src/app/api/process/geocode/route.ts`, `src/app/api/process/distance/route.ts`, `src/app/api/process/check-listing/route.ts`, `src/app/api/process/parse-pdf/route.ts`, `src/lib/process-schemas.ts`
- Modify: `src/lib/listing-status.ts` (drop `checkListings`), `src/lib/__tests__/listing-status.test.ts` (drop its `describe("checkListings")` block and the import)
- Test: `src/app/api/process/__tests__/process-routes.test.ts`

**Interfaces:**
- Consumes: `geocodeLatLngWithReason`, `extractPostcode` from `@/lib/geocode`; `calculateDistance` from `@/lib/distance`; `checkListingUrl` from `@/lib/listing-status`; `extractApartmentData` from `@/lib/parse-pdf`; `classifyParsePdfError` from `@/lib/parse-pdf-error`; `requireMember`, `parseBody`, `apiErrorResponse` from `@/lib/api-route`.
- Produces (client, Task 11 `process-client.ts`):
  - `POST /api/process/geocode { address: string } → { lat: number | null; lng: number | null; postcode: string | null; reason?: string }`
  - `POST /api/process/distance { from: string; to: string } → { bikeMin: number | null; transitMin: number | null }`
  - `POST /api/process/check-listing { url: string } → { gone: boolean | null }` (only `http:`/`https:` URLs; anything else 400)
  - `POST /api/process/parse-pdf` multipart `file` → `{ extracted: ApartmentExtraction; aiAvailable: boolean }`; 400 when not a PDF; 413 `PDF too large to extract` above `PARSE_PDF_MAX_BYTES` (env, default `20 * 1024 * 1024`); AI failures keep the old `{ error, reason, retryAfterSeconds }` shape and status from `classifyParsePdfError`.
  - `src/lib/process-schemas.ts`: `geocodeRequestSchema`, `distanceRequestSchema`, `checkListingRequestSchema`, `parsePdfMaxBytes(): number` (env `PARSE_PDF_MAX_BYTES`, default `20 * 1024 * 1024`), `emptyExtraction(filename: string)`.

These routes are the one place plaintext crosses the server on purpose — a **privacy exception**: the server sees one address, one URL or one PDF per call, does not log the body, and writes nothing to the database. Each file carries that comment.

- [ ] **Step 1: Write the failing tests**

`src/app/api/process/__tests__/process-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { apartments, households, householdMembers } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

const geocodeLatLngWithReason = vi.fn();
const extractPostcode = vi.fn();
vi.mock("@/lib/geocode", () => ({
  geocodeLatLngWithReason: (...a: unknown[]) => geocodeLatLngWithReason(...a),
  extractPostcode: (...a: unknown[]) => extractPostcode(...a),
}));
const calculateDistance = vi.fn();
vi.mock("@/lib/distance", () => ({ calculateDistance: (...a: unknown[]) => calculateDistance(...a) }));
const checkListingUrl = vi.fn();
vi.mock("@/lib/listing-status", () => ({ checkListingUrl: (...a: unknown[]) => checkListingUrl(...a) }));
const extractApartmentData = vi.fn();
vi.mock("@/lib/parse-pdf", () => ({ extractApartmentData: (...a: unknown[]) => extractApartmentData(...a) }));

import { POST as geocodePOST } from "../geocode/route";
import { POST as distancePOST } from "../distance/route";
import { POST as checkListingPOST } from "../check-listing/route";
import { POST as parsePdfPOST } from "../parse-pdf/route";

function json(body: unknown) {
  return new Request("http://localhost/api/process/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function multipart(file: File | null) {
  const fd = new FormData();
  if (file) fd.set("file", file);
  return new Request("http://localhost/api/process/parse-pdf", { method: "POST", body: fd });
}
const pdf = (bytes = 16, name = "listing.pdf", type = "application/pdf") =>
  new File([new Uint8Array(bytes)], name, { type });

let hid: number;

beforeEach(async () => {
  signedIn = true;
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com", name: "o" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(apartments).values({
    id: "11111111-1111-4111-8111-111111111111",
    householdId: hid,
    envelope: JSON.stringify({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct: "QUJD" }),
  });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

afterEach(() => vi.unstubAllEnvs());

async function rowsUnchanged() {
  const rows = await db.select().from(apartments);
  expect(rows).toHaveLength(1);
  expect(rows[0].version).toBe(1);
}

describe("POST /api/process/geocode", () => {
  it("401s without a session", async () => {
    signedIn = false;
    expect((await geocodePOST(json({ address: "A" }))).status).toBe(401);
  });

  it("returns coordinates and postcode, writing nothing", async () => {
    geocodeLatLngWithReason.mockResolvedValue({ result: { lat: 47.3, lng: 8.5 } });
    extractPostcode.mockResolvedValue("8001");
    const res = await geocodePOST(json({ address: "Bahnhofstrasse 1, 8001 Zürich" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lat: 47.3, lng: 8.5, postcode: "8001" });
    expect(geocodeLatLngWithReason).toHaveBeenCalledWith("Bahnhofstrasse 1, 8001 Zürich");
    await rowsUnchanged();
  });

  it("returns nulls with a reason when nothing resolves", async () => {
    geocodeLatLngWithReason.mockResolvedValue({ result: null, googleReason: "no_key", orsReason: "no_key" });
    extractPostcode.mockResolvedValue(null);
    const res = await geocodePOST(json({ address: "nowhere" }));
    expect(await res.json()).toEqual({ lat: null, lng: null, postcode: null, reason: "google: no_key; ors: no_key" });
  });

  it("400s an empty address", async () => {
    expect((await geocodePOST(json({ address: "  " }))).status).toBe(400);
  });
});

describe("POST /api/process/distance", () => {
  it("maps the library result to the wire names", async () => {
    calculateDistance.mockResolvedValue({ bikeMinutes: 12, transitMinutes: null });
    const res = await distancePOST(json({ from: "A", to: "B" }));
    expect(await res.json()).toEqual({ bikeMin: 12, transitMin: null });
    expect(calculateDistance).toHaveBeenCalledWith("A", "B");
    await rowsUnchanged();
  });

  it("401s without a session and 400s a missing field", async () => {
    signedIn = false;
    expect((await distancePOST(json({ from: "A", to: "B" }))).status).toBe(401);
    signedIn = true;
    expect((await distancePOST(json({ from: "A" }))).status).toBe(400);
  });
});

describe("POST /api/process/check-listing", () => {
  it("returns the gone flag for an http(s) url", async () => {
    checkListingUrl.mockResolvedValue(true);
    const res = await checkListingPOST(json({ url: "https://example.com/x" }));
    expect(await res.json()).toEqual({ gone: true });
    checkListingUrl.mockResolvedValue(null);
    expect(await (await checkListingPOST(json({ url: "http://example.com/x" }))).json()).toEqual({ gone: null });
    await rowsUnchanged();
  });

  it("400s non-http schemes and garbage", async () => {
    expect((await checkListingPOST(json({ url: "file:///etc/passwd" }))).status).toBe(400);
    expect((await checkListingPOST(json({ url: "ftp://example.com/x" }))).status).toBe(400);
    expect((await checkListingPOST(json({ url: "not a url" }))).status).toBe(400);
    expect(checkListingUrl).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await checkListingPOST(json({ url: "https://example.com" }))).status).toBe(401);
  });
});

describe("POST /api/process/parse-pdf", () => {
  it("401s without a session", async () => {
    signedIn = false;
    expect((await parsePdfPOST(multipart(pdf()))).status).toBe(401);
  });

  it("returns the empty extraction when no AI key is set", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    const res = await parsePdfPOST(multipart(pdf(16, "Nice Flat.pdf")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiAvailable).toBe(false);
    expect(body.extracted).toMatchObject({ name: "Nice Flat", address: null, rentChf: null });
    expect(extractApartmentData).not.toHaveBeenCalled();
    await rowsUnchanged();
  });

  it("runs extraction on the bytes when AI is configured", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "k");
    extractApartmentData.mockResolvedValue({ name: "X", address: "A 1", sizeM2: 80, numRooms: 3.5, numBathrooms: 1, numBalconies: 1, hasWashingMachine: true, rentChf: 2000, listingUrl: null, summary: null, availableFrom: null });
    const res = await parsePdfPOST(multipart(pdf(16)));
    expect(res.status).toBe(200);
    expect((await res.json()).extracted.name).toBe("X");
    expect(extractApartmentData).toHaveBeenCalledWith(Buffer.alloc(16).toString("base64"));
    await rowsUnchanged();
  });

  it("400s a non-PDF and 413s an oversized file", async () => {
    expect((await parsePdfPOST(multipart(null))).status).toBe(400);
    expect((await parsePdfPOST(multipart(pdf(16, "x.txt", "text/plain")))).status).toBe(400);
    vi.stubEnv("PARSE_PDF_MAX_BYTES", "8");
    const res = await parsePdfPOST(multipart(pdf(16)));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("PDF too large to extract");
  });

  it("classifies AI failures like the old route did", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "k");
    extractApartmentData.mockRejectedValue(Object.assign(new Error("quota exceeded, retry after 30s"), { status: 429 }));
    const res = await parsePdfPOST(multipart(pdf(16)));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ reason: "quota", retryAfterSeconds: 30 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/process`
Expected: FAIL — modules not found.

- [ ] **Step 3: Drop `checkListings`**

In `src/lib/listing-status.ts` delete the `ListingCheckResult` interface, the `CONCURRENCY` constant and the whole `checkListings` function. In `src/lib/__tests__/listing-status.test.ts` remove `checkListings` from the import and delete the `describe("checkListings", …)` block. Run `npx vitest run src/lib/__tests__/listing-status.test.ts` — PASS.

- [ ] **Step 4: Implement**

`src/lib/process-schemas.ts`:

```ts
import { z } from "zod";

export const geocodeRequestSchema = z.object({
  address: z.string().trim().min(1).max(500),
});

export const distanceRequestSchema = z.object({
  from: z.string().trim().min(1).max(500),
  to: z.string().trim().min(1).max(500),
});

// Only web URLs are probed: a listing link is always http(s), and the
// server must never be talked into fetching file:, ftp: or anything local.
export const checkListingRequestSchema = z.object({
  url: z
    .string()
    .max(2000)
    .refine((value) => {
      try {
        const u = new URL(value);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "must be an http(s) URL"),
});

// Gemini's inline-file limit is 20 MB; the env override exists for
// self-hosters pointing at another provider. Read per call, not at module
// load, so tests can stub it.
export function parsePdfMaxBytes(): number {
  const raw = Number(process.env.PARSE_PDF_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 20 * 1024 * 1024;
}

export function emptyExtraction(filename: string) {
  return {
    name: filename.replace(/\.pdf$/i, ""),
    address: null,
    sizeM2: null,
    numRooms: null,
    numBathrooms: null,
    numBalconies: null,
    hasWashingMachine: null,
    rentChf: null,
    listingUrl: null,
    summary: null,
    availableFrom: null,
  };
}
```

`src/app/api/process/geocode/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { extractPostcode, geocodeLatLngWithReason } from "@/lib/geocode";
import { geocodeRequestSchema } from "@/lib/process-schemas";

// Privacy exception (docs/security-notes.md, "Encrypted data"): the address
// is plaintext here so the server can call the geocoder on the client's
// behalf. It is not logged and nothing is written; the client stores the
// result inside its envelope.
export async function POST(req: Request) {
  try {
    await requireMember();
    const { address } = await parseBody(req, geocodeRequestSchema);
    const [attempt, postcode] = await Promise.all([
      geocodeLatLngWithReason(address),
      extractPostcode(address),
    ]);
    if (!attempt.result) {
      const reasons = [
        attempt.googleReason && `google: ${attempt.googleReason}`,
        attempt.orsReason && `ors: ${attempt.orsReason}`,
      ].filter(Boolean);
      return NextResponse.json({
        lat: null,
        lng: null,
        postcode,
        reason: reasons.length ? reasons.join("; ") : "unresolved",
      });
    }
    return NextResponse.json({ lat: attempt.result.lat, lng: attempt.result.lng, postcode });
  } catch (e) {
    return apiErrorResponse(e, "process:geocode");
  }
}
```

`src/app/api/process/distance/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { calculateDistance } from "@/lib/distance";
import { distanceRequestSchema } from "@/lib/process-schemas";

// Privacy exception: two plaintext addresses in, two durations out. Not
// logged, nothing written.
export async function POST(req: Request) {
  try {
    await requireMember();
    const { from, to } = await parseBody(req, distanceRequestSchema);
    const result = await calculateDistance(from, to);
    return NextResponse.json({
      bikeMin: result.bikeMinutes,
      transitMin: result.transitMinutes,
    });
  } catch (e) {
    return apiErrorResponse(e, "process:distance");
  }
}
```

`src/app/api/process/check-listing/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { checkListingUrl } from "@/lib/listing-status";
import { checkListingRequestSchema } from "@/lib/process-schemas";

// Privacy exception: the listing URL is plaintext so the server can probe
// it (browsers cannot, cross-origin). Not logged, nothing written.
export async function POST(req: Request) {
  try {
    await requireMember();
    const { url } = await parseBody(req, checkListingRequestSchema);
    return NextResponse.json({ gone: await checkListingUrl(url) });
  } catch (e) {
    return apiErrorResponse(e, "process:check-listing");
  }
}
```

`src/app/api/process/parse-pdf/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { extractApartmentData } from "@/lib/parse-pdf";
import { classifyParsePdfError } from "@/lib/parse-pdf-error";
import { emptyExtraction, parsePdfMaxBytes } from "@/lib/process-schemas";

// Privacy exception: the client decrypts the PDF and posts the plaintext
// bytes here for one extraction call. The bytes are held in memory for the
// request only — never stored, never logged. The encrypted copy the client
// keeps is the only one on disk.
export async function POST(req: Request) {
  let phase: "input" | "extract" = "input";
  try {
    await requireMember();
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf") {
      throw new ApiError("Please upload a PDF file", 400);
    }
    if (file.size > parsePdfMaxBytes()) {
      throw new ApiError("PDF too large to extract", 413);
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json({ extracted: emptyExtraction(file.name), aiAvailable: false });
    }

    phase = "extract";
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const extracted = await extractApartmentData(base64);
    return NextResponse.json({ extracted, aiAvailable: true });
  } catch (error) {
    if (phase === "input") return apiErrorResponse(error, "process:parse-pdf");
    console.error("[process:parse-pdf] extraction failed:", error instanceof Error ? error.message : error);
    const classified = classifyParsePdfError(error);
    return NextResponse.json(
      { error: classified.message, reason: classified.reason, retryAfterSeconds: classified.retryAfterSeconds },
      { status: classified.status }
    );
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/app/api/process src/lib/__tests__/listing-status.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/process src/lib/process-schemas.ts src/lib/listing-status.ts src/lib/__tests__/listing-status.test.ts
git commit -m "feat(api): blind /api/process endpoints for geocode, distance, listing check and PDF extraction

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---
### Task 10: Encrypted file path — `/api/files`, upload-token move, client upload/download

**Files:**
- Create: `src/app/api/files/route.ts`, `src/app/api/files/__tests__/files-route.test.ts`
- Move: `src/app/api/parse-pdf/upload-token/route.ts` → `src/app/api/files/upload-token/route.ts`; `src/app/api/parse-pdf/upload-token/__tests__/upload-token.test.ts` → `src/app/api/files/upload-token/__tests__/upload-token.test.ts`; then delete the now-empty `src/app/api/parse-pdf/`
- Modify: `src/app/api/uploads/[...path]/route.ts` (Content-Type for `.enc`), `src/app/api/uploads/__tests__/uploads.test.ts`
- Rewrite: `src/lib/upload-pdf.ts`; Create: `src/lib/__tests__/upload-pdf.test.ts`
- Create: `src/components/household-data/pdf-files.ts`, `src/components/household-data/__tests__/pdf-files.test.ts`

**Interfaces:**
- Consumes: `sealBytes`, `openBytes`, `envelopeAad`, `toBase64`, `fromBase64` from `@/lib/crypto` (Task 2 / E2); `requireMember` from `@/lib/api-route` (Task 3); `uploadFile(householdId, filename, file)` from `@/lib/storage`; `ApartmentPdf { path: string; iv: string | null }` from `@/lib/household-data/types` (Task 4).
- Produces: `POST /api/files` (multipart `file` + `apartmentId`) → `201 { path: string }`; `GET/POST /api/files/upload-token` (same behaviour as before, new URL, `allowedContentTypes: ["application/octet-stream", "application/pdf"]`); `uploadEncryptedFile(bytes: Uint8Array<ArrayBuffer>, apartmentId: string): Promise<string>` and `_resetBlobModeProbeForTests()` from `@/lib/upload-pdf`; `encryptAndUploadPdf(dataKey: CryptoKey | null, householdId: number, apartmentId: string, bytes: Uint8Array<ArrayBuffer>): Promise<ApartmentPdf>` and `downloadPdf(dataKey: CryptoKey | null, householdId: number, apartmentId: string, pdf: ApartmentPdf): Promise<Uint8Array<ArrayBuffer>>` from `@/components/household-data/pdf-files`.

The file on disk / in Blob is `households/<householdId>/<apartmentId>.pdf.enc`: AES-GCM ciphertext when encryption is on, the raw PDF bytes when it is off (`iv: null`). The server never learns which; it stores and serves `application/octet-stream`.

- [ ] **Step 1: Move the upload-token route and its test**

```bash
mkdir -p src/app/api/files
git mv src/app/api/parse-pdf/upload-token src/app/api/files/upload-token
rmdir src/app/api/parse-pdf 2>/dev/null || true
git status --short src/app/api/parse-pdf src/app/api/files
```

`src/app/api/parse-pdf/route.ts` was deleted in Task 1; after this move the `parse-pdf` directory must be gone. Then, in the moved test file, replace every `/api/parse-pdf/upload-token` with `/api/files/upload-token` and update the content-type assertion:

```bash
sed -i 's#/api/parse-pdf/upload-token#/api/files/upload-token#g' src/app/api/files/upload-token/__tests__/upload-token.test.ts
sed -i 's#expect(tokenOpts.allowedContentTypes).toEqual(\["application/pdf"\]);#expect(tokenOpts.allowedContentTypes).toEqual(["application/octet-stream", "application/pdf"]);#' src/app/api/files/upload-token/__tests__/upload-token.test.ts
grep -n "allowedContentTypes\|/api/files/upload-token" src/app/api/files/upload-token/__tests__/upload-token.test.ts
```

- [ ] **Step 2: Run the moved test to see the content-type assertion fail**

Run: `npx vitest run src/app/api/files/upload-token`
Expected: one FAIL — `allowedContentTypes` still equals `["application/pdf"]`.

- [ ] **Step 3: Update the moved route**

In `src/app/api/files/upload-token/route.ts`:

- Replace the header comment starting `// Server route that mints short-lived client tokens` with:

```ts
// Server route that mints short-lived client tokens so the browser can upload
// encrypted PDFs directly to Vercel Blob — bypassing the serverless body
// limit. The bytes are opaque to the server (E3): AES-GCM ciphertext when
// encryption is on, the raw PDF when it is off, stored either way as
// application/octet-stream under households/<id>/<apartmentId>.pdf.enc.
```

- Replace `allowedContentTypes: ["application/pdf"],` with `allowedContentTypes: ["application/octet-stream", "application/pdf"],`.
- Replace the `onUploadCompleted` comment body with `// No-op: the client records the returned pathname inside the apartment's envelope.`

Run: `npx vitest run src/app/api/files/upload-token`
Expected: PASS.

- [ ] **Step 4: Write the failing `/api/files` route test**

Create `src/app/api/files/__tests__/files-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { UnauthorizedError } from "@/lib/household";

const { mockRequireMember } = vi.hoisted(() => ({ mockRequireMember: vi.fn() }));

vi.mock("@/lib/api-route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-route")>();
  return { ...actual, requireMember: mockRequireMember };
});

import { POST } from "../route";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const APT = "11111111-1111-4111-8111-111111111111";

function request(fields: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost/api/files", { method: "POST", body: form });
}

beforeEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  mockRequireMember.mockResolvedValue({ householdId: 7, userId: "u1", role: "owner" });
});

afterEach(() => {
  fs.rmSync(path.join(UPLOADS_DIR, "households", "7"), { recursive: true, force: true });
});

describe("POST /api/files", () => {
  it("stores the bytes under households/<id>/<apartmentId>.pdf.enc and returns the path", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const res = await POST(
      request({ file: new Blob([bytes], { type: "application/octet-stream" }), apartmentId: APT })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.path).toBe(`/api/uploads/households/7/${APT}.pdf.enc`);
    const stored = fs.readFileSync(path.join(UPLOADS_DIR, "households", "7", `${APT}.pdf.enc`));
    expect([...stored]).toEqual([1, 2, 3, 4]);
  });

  it("rejects a missing file", async () => {
    const res = await POST(request({ apartmentId: APT }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-uuid apartment id", async () => {
    const res = await POST(request({ file: new Blob([new Uint8Array(2)]), apartmentId: "../x" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireMember.mockRejectedValueOnce(new UnauthorizedError());
    const res = await POST(request({ file: new Blob([new Uint8Array(2)]), apartmentId: APT }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the caller is no longer a member", async () => {
    mockRequireMember.mockRejectedValueOnce(new (await import("@/lib/api-error")).ApiError("Not found", 404));
    const res = await POST(request({ file: new Blob([new Uint8Array(2)]), apartmentId: APT }));
    expect(res.status).toBe(404);
  });
});
```

Run: `npx vitest run src/app/api/files/__tests__/files-route.test.ts`
Expected: FAIL — cannot resolve `../route`.

- [ ] **Step 5: Implement `src/app/api/files/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { uploadFile } from "@/lib/storage";

// Multipart upload of one already-encrypted PDF. Used when Blob is not
// configured (local mode); in cloud mode the client uploads directly with a
// token from ./upload-token. The server treats the bytes as opaque.
const fieldsSchema = z.object({ apartmentId: z.uuid() });

export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new ApiError("Missing file", 400);
    const { apartmentId } = fieldsSchema.parse({ apartmentId: form.get("apartmentId") });

    const path = await uploadFile(
      householdId,
      `${apartmentId}.pdf.enc`,
      new File([file], `${apartmentId}.pdf.enc`, { type: "application/octet-stream" })
    );
    return NextResponse.json({ path }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "files:POST");
  }
}
```

Run: `npx vitest run src/app/api/files/__tests__/files-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Serve `.enc` files as octet-stream from `/api/uploads`**

Add to `src/app/api/uploads/__tests__/uploads.test.ts`, inside the `describe("GET /api/uploads/[...path]")` block (the file already imports `fs`? — if not, add `import fs from "node:fs"; import path from "node:path";` at the top):

```ts
  it("serves a .pdf.enc file as application/octet-stream", async () => {
    mockRequireHousehold.mockResolvedValue({ householdId: 1, userId: "u1", role: "owner" });
    const dir = path.join(process.cwd(), "uploads", "households", "1");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "enc-test.pdf.enc"), Buffer.from([9, 9]));
    try {
      const { request, ctx } = makeRequest(["households", "1", "enc-test.pdf.enc"]);
      const res = await GET(request, ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    } finally {
      fs.rmSync(path.join(dir, "enc-test.pdf.enc"), { force: true });
    }
  });
```

Run: `npx vitest run src/app/api/uploads` — Expected: the new test FAILS (`application/pdf`).

In `src/app/api/uploads/[...path]/route.ts` replace `"Content-Type": "application/pdf",` with:

```ts
        "Content-Type": filePath.endsWith(".enc")
          ? "application/octet-stream"
          : "application/pdf",
```

Run: `npx vitest run src/app/api/uploads src/lib/__tests__/storage-scoping.test.ts` — Expected: PASS. (`/api/pdf/[...path]` needs no change: it already passes through the content type Blob recorded at upload.)

- [ ] **Step 7: Write the failing client upload test**

Create `src/lib/__tests__/upload-pdf.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockUpload } = vi.hoisted(() => ({ mockUpload: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ upload: mockUpload }));

import { uploadEncryptedFile, _resetBlobModeProbeForTests } from "@/lib/upload-pdf";

const APT = "22222222-2222-4222-8222-222222222222";
const bytes = new Uint8Array([7, 8, 9]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  _resetBlobModeProbeForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadEncryptedFile", () => {
  it("uploads straight to Blob when the token probe is enabled", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/files/upload-token") return jsonResponse({ enabled: true, householdId: 7 });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    mockUpload.mockResolvedValue({ pathname: `households/7/${APT}.pdf.enc` });

    const path = await uploadEncryptedFile(bytes, APT);

    expect(path).toBe(`/api/pdf/households/7/${APT}.pdf.enc`);
    const [pathname, body, opts] = mockUpload.mock.calls[0];
    expect(pathname).toBe(`households/7/${APT}.pdf.enc`);
    expect(body).toBeInstanceOf(Blob);
    expect(opts).toMatchObject({
      access: "private",
      handleUploadUrl: "/api/files/upload-token",
      contentType: "application/octet-stream",
    });
  });

  it("falls back to multipart POST /api/files when the probe is disabled", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/files/upload-token") return jsonResponse({ enabled: false }, 404);
      if (url === "/api/files") {
        const form = init?.body as FormData;
        expect(form.get("apartmentId")).toBe(APT);
        expect(form.get("file")).toBeInstanceOf(Blob);
        return jsonResponse({ path: `/api/uploads/households/7/${APT}.pdf.enc` }, 201);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const path = await uploadEncryptedFile(bytes, APT);
    expect(path).toBe(`/api/uploads/households/7/${APT}.pdf.enc`);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("throws with the server's message when the multipart upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/files/upload-token"
          ? jsonResponse({ enabled: false }, 404)
          : jsonResponse({ error: "Missing file" }, 400)
      )
    );
    await expect(uploadEncryptedFile(bytes, APT)).rejects.toThrow("Missing file");
  });

  it("caches the probe across calls", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/files/upload-token"
        ? jsonResponse({ enabled: true, householdId: 7 })
        : jsonResponse({}, 500)
    );
    vi.stubGlobal("fetch", fetchMock);
    mockUpload.mockResolvedValue({ pathname: `households/7/${APT}.pdf.enc` });
    await uploadEncryptedFile(bytes, APT);
    await uploadEncryptedFile(bytes, APT);
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/files/upload-token")).toHaveLength(1);
  });
});
```

Run: `npx vitest run src/lib/__tests__/upload-pdf.test.ts`
Expected: FAIL — `uploadEncryptedFile` is not exported.

- [ ] **Step 8: Rewrite `src/lib/upload-pdf.ts`**

Replace the whole file with:

```ts
import { upload } from "@vercel/blob/client";
import { canonicalizePathname } from "@/lib/pathname";

// Picks between client-direct Blob upload (cloud, no serverless body limit)
// and multipart-to-server (local dev, no Blob token). Probes the upload-token
// route once per page load and caches the result. The bytes handed in are
// already sealed by src/components/household-data/pdf-files.ts — this module
// never sees a plaintext PDF and never names the content as one.

const UPLOAD_TOKEN_URL = "/api/files/upload-token";
const FILES_URL = "/api/files";

interface BlobModeProbe {
  enabled: boolean;
  // The caller's own household id, needed to mint blob keys under the
  // `households/<id>/` prefix that the upload-token route (and every
  // file-serving route) requires. Present whenever `enabled` is true.
  householdId?: number;
}

let blobModeProbe: Promise<BlobModeProbe> | null = null;

function probeBlobMode(): Promise<BlobModeProbe> {
  if (!blobModeProbe) {
    blobModeProbe = fetch(UPLOAD_TOKEN_URL, { method: "GET" })
      .then(async (r) => {
        if (!r.ok) return { enabled: false };
        const data = (await r.json()) as { householdId?: number };
        return { enabled: true, householdId: data.householdId };
      })
      .catch(() => ({ enabled: false }));
  }
  return blobModeProbe;
}

export function _resetBlobModeProbeForTests() {
  blobModeProbe = null;
}

// Stores sealed bytes as households/<hid>/<apartmentId>.pdf.enc and returns
// the app-relative URL that serves them back (/api/pdf/... or /api/uploads/...).
export async function uploadEncryptedFile(
  bytes: Uint8Array<ArrayBuffer>,
  apartmentId: string
): Promise<string> {
  const body = new Blob([bytes], { type: "application/octet-stream" });
  const probe = await probeBlobMode();

  if (probe.enabled && probe.householdId !== undefined) {
    // Canonicalize BEFORE requesting a token: the upload-token route
    // requires the pathname it receives to already be its own canonical
    // form (handleUpload signs whatever raw pathname the client sends).
    // A UUID-based name never changes under canonicalization, but the
    // invariant is cheap to keep and the server checks it anyway.
    const pathname = canonicalizePathname(
      `households/${probe.householdId}/${apartmentId}.pdf.enc`
    );
    const blob = await upload(pathname, body, {
      access: "private",
      handleUploadUrl: UPLOAD_TOKEN_URL,
      contentType: "application/octet-stream",
    });
    return `/api/pdf/${blob.pathname}`;
  }

  const formData = new FormData();
  formData.append("file", body, `${apartmentId}.pdf.enc`);
  formData.append("apartmentId", apartmentId);
  const res = await fetch(FILES_URL, { method: "POST", body: formData });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  const { path } = (await res.json()) as { path: string };
  return path;
}
```

Run: `npx vitest run src/lib/__tests__/upload-pdf.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing `pdf-files` test**

Create `src/components/household-data/__tests__/pdf-files.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateDataKey, openBytes, envelopeAad, fromBase64 } from "@/lib/crypto";

const { mockUploadEncryptedFile } = vi.hoisted(() => ({ mockUploadEncryptedFile: vi.fn() }));
vi.mock("@/lib/upload-pdf", () => ({ uploadEncryptedFile: mockUploadEncryptedFile }));

import { encryptAndUploadPdf, downloadPdf } from "../pdf-files";

const APT = "33333333-3333-4333-8333-333333333333";
const plain = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]); // "%PDF" + bytes

beforeEach(() => {
  mockUploadEncryptedFile.mockResolvedValue(`/api/uploads/households/7/${APT}.pdf.enc`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("encryptAndUploadPdf", () => {
  it("seals with the pdf AAD and returns path + iv", async () => {
    const key = await generateDataKey();
    const pdf = await encryptAndUploadPdf(key, 7, APT, plain);

    expect(pdf.path).toBe(`/api/uploads/households/7/${APT}.pdf.enc`);
    expect(pdf.iv).toEqual(expect.any(String));

    const [uploaded, apartmentId] = mockUploadEncryptedFile.mock.calls[0] as [Uint8Array<ArrayBuffer>, string];
    expect(apartmentId).toBe(APT);
    expect(uploaded).not.toEqual(plain);
    const opened = await openBytes(key, { iv: pdf.iv, ct: uploaded }, envelopeAad(7, "pdf", APT));
    expect([...opened]).toEqual([...plain]);
  });

  it("uploads the raw bytes with iv null when encryption is off", async () => {
    const pdf = await encryptAndUploadPdf(null, 7, APT, plain);
    expect(pdf.iv).toBeNull();
    const [uploaded] = mockUploadEncryptedFile.mock.calls[0] as [Uint8Array<ArrayBuffer>];
    expect([...uploaded]).toEqual([...plain]);
  });
});

describe("downloadPdf", () => {
  it("fetches the stored path and opens it", async () => {
    const key = await generateDataKey();
    const pdf = await encryptAndUploadPdf(key, 7, APT, plain);
    const [uploaded] = mockUploadEncryptedFile.mock.calls[0] as [Uint8Array<ArrayBuffer>];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe(pdf.path);
        return new Response(uploaded, { status: 200 });
      })
    );
    const out = await downloadPdf(key, 7, APT, pdf);
    expect([...out]).toEqual([...plain]);
  });

  it("throws when the file is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(downloadPdf(null, 7, APT, { path: "/api/uploads/households/7/x.pdf.enc", iv: null })).rejects.toThrow(
      "PDF not found"
    );
  });

  it("rejects a tampered download", async () => {
    const key = await generateDataKey();
    const pdf = await encryptAndUploadPdf(key, 7, APT, plain);
    const [uploaded] = mockUploadEncryptedFile.mock.calls[0] as [Uint8Array<ArrayBuffer>];
    const tampered = new Uint8Array(uploaded);
    tampered[tampered.length - 1] ^= 0xff;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(tampered, { status: 200 })));
    await expect(downloadPdf(key, 7, APT, pdf)).rejects.toThrow();
  });
});

// Sanity: fromBase64 is the decoder the module uses for the stored iv.
it("stores the iv as base64", async () => {
  const key = await generateDataKey();
  const pdf = await encryptAndUploadPdf(key, 7, APT, plain);
  expect(fromBase64(pdf.iv as string)).toHaveLength(12);
});
```

Run: `npx vitest run src/components/household-data/__tests__/pdf-files.test.ts`
Expected: FAIL — cannot resolve `../pdf-files`.

- [ ] **Step 10: Implement `src/components/household-data/pdf-files.ts`**

```ts
import { envelopeAad, openBytes, sealBytes } from "@/lib/crypto";
import type { ApartmentPdf } from "@/lib/household-data/types";
import { uploadEncryptedFile } from "@/lib/upload-pdf";

// The PDF's AAD binds the ciphertext to its apartment row, exactly as the
// envelope AAD binds a row's JSON. A file swapped between apartments (or
// households) fails to open.
function pdfAad(householdId: number, apartmentId: string): string {
  return envelopeAad(householdId, "pdf", apartmentId);
}

export async function encryptAndUploadPdf(
  dataKey: CryptoKey | null,
  householdId: number,
  apartmentId: string,
  bytes: Uint8Array<ArrayBuffer>
): Promise<ApartmentPdf> {
  const sealed = await sealBytes(dataKey, bytes, pdfAad(householdId, apartmentId));
  const path = await uploadEncryptedFile(sealed.ct, apartmentId);
  return { path, iv: sealed.iv };
}

export async function downloadPdf(
  dataKey: CryptoKey | null,
  householdId: number,
  apartmentId: string,
  pdf: ApartmentPdf
): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(pdf.path);
  if (!res.ok) throw new Error("PDF not found");
  const ct = new Uint8Array(await res.arrayBuffer());
  return openBytes(dataKey, { iv: pdf.iv, ct }, pdfAad(householdId, apartmentId));
}
```

Run: `npx vitest run src/components/household-data/__tests__/pdf-files.test.ts src/lib/__tests__/upload-pdf.test.ts src/app/api/files src/app/api/uploads`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/app/api/files src/app/api/uploads src/lib/upload-pdf.ts src/lib/__tests__/upload-pdf.test.ts src/components/household-data/pdf-files.ts src/components/household-data/__tests__/pdf-files.test.ts
git status --short src/app/api/parse-pdf   # must print nothing
git commit -m "feat(files): encrypted PDF upload and download path

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---
### Task 11: Client store — API/process clients, enrichment, `HouseholdDataProvider`, `useHouseholdData`, `CryptoGate`

**Files:**
- Create: `src/lib/household-data/concurrency.ts`, `src/lib/household-data/__tests__/concurrency.test.ts`
- Create: `src/components/household-data/api-client.ts`, `src/components/household-data/process-client.ts`, `src/components/household-data/enrichment.ts`, `src/components/household-data/household-data-provider.tsx`, `src/components/household-data/use-household-data.ts`
- Create tests: `src/components/household-data/__tests__/api-client.test.ts`, `__tests__/process-client.test.ts`, `__tests__/enrichment.test.ts`, `__tests__/household-data-provider.test.tsx`, and the shared helper `__tests__/fake-household-data.tsx`
- Modify: `src/components/crypto/crypto-gate.tsx`

**Interfaces:**
- Consumes: everything from `@/lib/household-data/*` (Tasks 4–5): `Apartment`, `Rating`, `Location`, `ApartmentView`, `LocationView`, `DecodedApartment`, `DecodedRating`, `DecodedLocation`, `emptyApartment`, `ApartmentRow`, `RatingRow`, `LocationRow`, `sealApartment/openApartment/sealRating/openRating/sealLocation/openLocation`, `deriveApartments`, `deriveLocations`, `planEnrichment`, `missingDistances`, `pruneDistances`, `uniqueShortCode`, `postcodeFromShortCode`, `planGeocodeMaintenance`, `planDistanceMaintenance`, `planListingMaintenance`, `MaintenanceKind`, `MaintenanceReport`; `CryptoContext` from `@/components/crypto/crypto-provider`; route contracts from Tasks 6–10.
- Produces:
  - `mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>` (`@/lib/household-data/concurrency`).
  - `class ApiClientError extends Error { status: number; body: Record<string, unknown> }`, `getJson<T>(url): Promise<T>`, `sendJson<T>(method, url, body?): Promise<T>` (204 → `undefined as T`) from `api-client.ts`.
  - `geocodeAddress(address): Promise<{ lat: number | null; lng: number | null; postcode: string | null; reason?: string }>`, `distanceBetween(from, to): Promise<ApartmentDistance>`, `checkListing(url): Promise<boolean | null>`, `parsePdf(bytes: Uint8Array<ArrayBuffer>, filename: string): Promise<{ extracted: Record<string, unknown>; aiAvailable: boolean }>`, `class ParsePdfError extends Error { reason: "quota" | "invalid_pdf" | "unknown"; retryAfterSeconds?: number; status: number }` from `process-client.ts`.
  - `enrichApartment(data: Apartment, locations: LocationView[], takenCodes: Set<string>, plan: EnrichmentPlan): Promise<Apartment>` from `enrichment.ts`.
  - `HouseholdIdentity { userId: string; householdId: number; userName: string }`, `HouseholdDataContextValue` (below; carries `identity` and `dataKey` so pages never read `CryptoContext` themselves), `HouseholdDataContext`, `HouseholdDataProvider({ identity, children })` from `household-data-provider.tsx`; `useHouseholdData(): HouseholdDataContextValue` from `use-household-data.ts` (throws outside the provider).
  - Test helper: `makeApartmentView(over: Partial<ApartmentView> & { id: string }): ApartmentView`, `makeLocationView(over: Partial<LocationView> & { id: string }): LocationView`, `makeHouseholdData(over?: Partial<HouseholdDataContextValue>): HouseholdDataContextValue` (every function a `vi.fn()`), `renderWithHouseholdData(ui: React.ReactElement, value?: Partial<HouseholdDataContextValue>)` returning `{ value, ...renderResult }`.

```ts
export interface HouseholdDataContextValue {
  // Who is signed in and which household this store belongs to.
  identity: HouseholdIdentity;
  // The unlocked household data key (null in off mode). Pages that seal or
  // open PDFs themselves (upload, View PDF, reprocess) read it from here so
  // they never touch CryptoContext directly.
  dataKey: CryptoKey | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  apartments: ApartmentView[];
  locations: LocationView[];
  // Per-apartment message from the last failed enrichment; cleared on success.
  enrichmentError: Record<string, string>;
  reload(): Promise<void>;
  createApartment(id: string, data: Apartment): Promise<ApartmentView>;
  updateApartment(id: string, mutate: (a: Apartment) => Apartment): Promise<ApartmentView>;
  deleteApartment(id: string): Promise<void>;
  rateApartment(id: string, rating: Rating | null): Promise<void>;
  retryEnrichment(id: string): Promise<void>;
  createLocation(id: string, data: Location): Promise<LocationView>;
  updateLocation(id: string, mutate: (l: Location) => Location): Promise<LocationView>;
  deleteLocation(id: string): Promise<void>;
  moveLocation(id: string, direction: "up" | "down"): Promise<void>;
  runMaintenance(kind: MaintenanceKind, onProgress?: (done: number, total: number) => void): Promise<MaintenanceReport>;
}
```

`retryEnrichment` is the spec's "retry action" for a failed enrichment; it is on the context so the list page can offer it.

- [ ] **Step 1: Write the failing tests for the small modules**

`src/lib/household-data/__tests__/concurrency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapConcurrent } from "../concurrency";

describe("mapConcurrent", () => {
  it("preserves order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapConcurrent([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapConcurrent([], 3, async () => 1)).toEqual([]);
  });

  it("rejects when any item rejects", async () => {
    await expect(
      mapConcurrent([1, 2], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
  });
});
```

`src/components/household-data/__tests__/api-client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClientError, getJson, sendJson } from "../api-client";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("api-client", () => {
  it("getJson returns the parsed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([{ id: "a" }])));
    expect(await getJson<{ id: string }[]>("/api/apartments")).toEqual([{ id: "a" }]);
  });

  it("sendJson posts JSON and returns the body", async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }, 201));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendJson<{ ok: boolean }>("POST", "/api/x", { a: 1 })).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("sendJson returns undefined for 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    expect(await sendJson("DELETE", "/api/x")).toBeUndefined();
  });

  it("throws ApiClientError with status, message and body on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Stale version", version: 4 }, 409)));
    const err = await sendJson("PUT", "/api/x", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(409);
    expect(err.message).toBe("Stale version");
    expect(err.body).toEqual({ error: "Stale version", version: 4 });
  });

  it("falls back to a status message when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    const err = await getJson("/api/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.message).toBe("Request failed (502)");
  });
});
```

`src/components/household-data/__tests__/process-client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkListing, distanceBetween, geocodeAddress, ParsePdfError, parsePdf } from "../process-client";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("process-client", () => {
  it("geocodeAddress posts the address", async () => {
    const fetchMock = vi.fn(async () => json({ lat: 1, lng: 2, postcode: "8000" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await geocodeAddress("X 1, Zürich")).toEqual({ lat: 1, lng: 2, postcode: "8000" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/process/geocode");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ address: "X 1, Zürich" });
  });

  it("distanceBetween posts from/to", async () => {
    const fetchMock = vi.fn(async () => json({ bikeMin: 10, transitMin: null }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await distanceBetween("A", "B")).toEqual({ bikeMin: 10, transitMin: null });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/process/distance");
  });

  it("checkListing returns gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ gone: true })));
    expect(await checkListing("https://x")).toBe(true);
  });

  it("parsePdf posts multipart and returns the extraction", async () => {
    const fetchMock = vi.fn(async () => json({ extracted: { name: "Flat" }, aiAvailable: true }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await parsePdf(new Uint8Array([1, 2]), "flat.pdf");
    expect(out).toEqual({ extracted: { name: "Flat" }, aiAvailable: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/process/parse-pdf");
    const form = init.body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe("flat.pdf");
    expect(file.type).toBe("application/pdf");
  });

  it("parsePdf throws ParsePdfError carrying reason and retryAfterSeconds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "AI quota exceeded — try again in 30s.", reason: "quota", retryAfterSeconds: 30 }, 429))
    );
    const err = await parsePdf(new Uint8Array([1]), "x.pdf").catch((e) => e);
    expect(err).toBeInstanceOf(ParsePdfError);
    expect(err.reason).toBe("quota");
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.status).toBe(429);
    expect(err.message).toBe("AI quota exceeded — try again in 30s.");
  });

  it("parsePdf maps a 413 to reason invalid_pdf", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "PDF too large to extract" }, 413)));
    const err = await parsePdf(new Uint8Array([1]), "x.pdf").catch((e) => e);
    expect(err.reason).toBe("invalid_pdf");
  });
});
```

`src/components/household-data/__tests__/enrichment.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyApartment, type LocationView } from "@/lib/household-data/types";

const { mockGeocode, mockDistance } = vi.hoisted(() => ({ mockGeocode: vi.fn(), mockDistance: vi.fn() }));
vi.mock("../process-client", () => ({ geocodeAddress: mockGeocode, distanceBetween: mockDistance }));

import { enrichApartment } from "../enrichment";

const loc = (id: string, latitude: number | null = 1): LocationView => ({
  id, sortOrder: 0, label: id, icon: "Briefcase", address: `${id} street`, latitude, longitude: latitude,
});

beforeEach(() => {
  mockGeocode.mockResolvedValue({ lat: 47.1, lng: 8.5, postcode: "8000" });
  mockDistance.mockImplementation(async (_from: string, to: string) => ({ bikeMin: to.length, transitMin: null }));
});

describe("enrichApartment", () => {
  it("geocodes, builds a unique short code and computes distances to located locations", async () => {
    const data = { ...emptyApartment("A"), address: "Somewhere 1", numRooms: 3.5, numBathrooms: 1, hasWashingMachine: true };
    const out = await enrichApartment(data, [loc("l1"), loc("l2", null)], new Set(), {
      geocode: true, shortCode: true, distances: true,
    });
    expect(out.latitude).toBe(47.1);
    expect(out.longitude).toBe(8.5);
    expect(out.shortCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{3}-3\.5B-1b-WY-8000$/);
    expect(out.distances).toEqual({ l1: { bikeMin: "l1 street".length, transitMin: null } });
    expect(mockDistance).toHaveBeenCalledWith("Somewhere 1", "l1 street");
  });

  it("re-rolls the short code letters until unique", async () => {
    const data = { ...emptyApartment("A"), address: "Somewhere 1", numRooms: 2, numBathrooms: 1, hasWashingMachine: false };
    const random = vi.fn().mockReturnValue(0);
    const first = await enrichApartment(data, [], new Set(), { geocode: true, shortCode: true, distances: false }, random);
    const second = await enrichApartment(data, [], new Set([first.shortCode as string]), { geocode: true, shortCode: true, distances: false }, random);
    // With a constant random source every re-roll produces the same letters,
    // so the collision persists and the last candidate is returned unchanged.
    expect(second.shortCode).toBe(first.shortCode);
  });

  it("keeps the old postcode when only the short-code inputs changed", async () => {
    const data = { ...emptyApartment("A"), address: "Somewhere 1", numRooms: 4, numBathrooms: 2, hasWashingMachine: null, shortCode: "ABC-3B-1b-WY-8001", latitude: 1, longitude: 1 };
    const out = await enrichApartment(data, [], new Set(), { geocode: false, shortCode: true, distances: false });
    expect(mockGeocode).not.toHaveBeenCalled();
    expect(out.shortCode).toMatch(/-4B-2b-W\?-8001$/);
  });

  it("leaves coordinates null when geocoding is unresolved and skips distances", async () => {
    mockGeocode.mockResolvedValue({ lat: null, lng: null, postcode: null, reason: "unresolved" });
    const data = { ...emptyApartment("A"), address: "Nowhere" };
    const out = await enrichApartment(data, [loc("l1")], new Set(), { geocode: true, shortCode: true, distances: true });
    expect(out.latitude).toBeNull();
    expect(out.distances).toEqual({});
    expect(out.shortCode).toMatch(/-\?B-\?b-W\?-\?$/);
    expect(mockDistance).not.toHaveBeenCalled();
  });

  it("fills only missing distances when the plan does not ask for all", async () => {
    const data = { ...emptyApartment("A"), address: "X", latitude: 1, longitude: 1, distances: { l1: { bikeMin: 99, transitMin: 99 } } };
    const out = await enrichApartment(data, [loc("l1"), loc("l2")], new Set(), { geocode: false, shortCode: false, distances: false });
    expect(out.distances.l1).toEqual({ bikeMin: 99, transitMin: 99 });
    expect(out.distances.l2).toEqual({ bikeMin: "l2 street".length, transitMin: null });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/household-data/__tests__/concurrency.test.ts src/components/household-data/__tests__/api-client.test.ts src/components/household-data/__tests__/process-client.test.ts src/components/household-data/__tests__/enrichment.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the small modules**

`src/lib/household-data/concurrency.ts`:

```ts
// Runs fn over items with at most `limit` in flight; results keep input order.
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
```

`src/components/household-data/api-client.ts`:

```ts
// Thin fetch wrappers for the envelope routes. Every non-2xx becomes an
// ApiClientError carrying the status and the parsed JSON body, so callers
// can branch on `status === 409 && message === "Stale version"`.
export class ApiClientError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const message =
      typeof record.error === "string" ? record.error : `Request failed (${res.status})`;
    throw new ApiClientError(res.status, message, record);
  }
  return body as T;
}

export async function getJson<T>(url: string): Promise<T> {
  return handle<T>(await fetch(url));
}

export async function sendJson<T>(
  method: "POST" | "PUT" | "DELETE",
  url: string,
  body?: unknown
): Promise<T> {
  return handle<T>(
    await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}
```

`src/components/household-data/process-client.ts`:

```ts
import type { ApartmentDistance } from "@/lib/household-data/types";
import { ApiClientError, sendJson } from "./api-client";

// Client side of the blind /api/process proxies. These are the only
// requests that carry household plaintext (an address, a listing URL, PDF
// bytes) — see the privacy exception in each route.

export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  postcode: string | null;
  reason?: string;
}

export function geocodeAddress(address: string): Promise<GeocodeResult> {
  return sendJson<GeocodeResult>("POST", "/api/process/geocode", { address });
}

export function distanceBetween(from: string, to: string): Promise<ApartmentDistance> {
  return sendJson<ApartmentDistance>("POST", "/api/process/distance", { from, to });
}

export async function checkListing(url: string): Promise<boolean | null> {
  const { gone } = await sendJson<{ gone: boolean | null }>("POST", "/api/process/check-listing", { url });
  return gone;
}

export type ParsePdfReason = "quota" | "invalid_pdf" | "unknown";

export class ParsePdfError extends Error {
  reason: ParsePdfReason;
  retryAfterSeconds?: number;
  status: number;
  constructor(message: string, reason: ParsePdfReason, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "ParsePdfError";
    this.reason = reason;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ParsePdfResult {
  extracted: Record<string, unknown>;
  aiAvailable: boolean;
}

export async function parsePdf(
  bytes: Uint8Array<ArrayBuffer>,
  filename: string
): Promise<ParsePdfResult> {
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type: "application/pdf" }));
  const res = await fetch("/api/process/parse-pdf", { method: "POST", body: form });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok) {
    const message = typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    const reason: ParsePdfReason =
      body.reason === "quota" || body.reason === "invalid_pdf"
        ? body.reason
        : res.status === 413 || res.status === 400
          ? "invalid_pdf"
          : "unknown";
    throw new ParsePdfError(
      message,
      reason,
      res.status,
      typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined
    );
  }
  return body as unknown as ParsePdfResult;
}

// Re-exported so the provider can type-narrow without importing api-client.
export { ApiClientError };
```

`src/components/household-data/enrichment.ts`:

```ts
import type { EnrichmentPlan } from "@/lib/household-data/enrich";
import { missingDistances } from "@/lib/household-data/enrich";
import { postcodeFromShortCode, uniqueShortCode } from "@/lib/household-data/short-code";
import type { Apartment, ApartmentDistance, LocationView } from "@/lib/household-data/types";
import { mapConcurrent } from "@/lib/household-data/concurrency";
import { distanceBetween, geocodeAddress } from "./process-client";

const DISTANCE_CONCURRENCY = 3;

function located(loc: LocationView): boolean {
  return loc.latitude !== null && loc.longitude !== null;
}

// Runs one enrichment plan over a plaintext apartment and returns the
// enriched copy. Pure apart from the two process calls; the caller writes
// the result. Throws on a network/server failure so the caller can flag the
// row; an *unresolved* geocode is not a failure (coordinates stay null).
export async function enrichApartment(
  data: Apartment,
  locations: LocationView[],
  takenCodes: Set<string>,
  plan: EnrichmentPlan,
  random: () => number = Math.random
): Promise<Apartment> {
  let next: Apartment = { ...data, distances: { ...data.distances } };
  let postcode: string | null = data.shortCode ? postcodeFromShortCode(data.shortCode) : null;

  const address = next.address?.trim() ?? "";
  if (plan.geocode && address !== "") {
    const geo = await geocodeAddress(address);
    next = { ...next, latitude: geo.lat, longitude: geo.lng };
    postcode = geo.postcode;
    if (geo.lat === null) next = { ...next, distances: {} };
  }

  if (plan.shortCode) {
    next = {
      ...next,
      shortCode: uniqueShortCode(
        {
          numRooms: next.numRooms,
          numBathrooms: next.numBathrooms,
          hasWashingMachine: next.hasWashingMachine,
          postcode,
        },
        takenCodes,
        random
      ),
    };
  }

  if (next.latitude !== null && next.longitude !== null && address !== "") {
    const targets = plan.distances ? locations.filter(located) : missingDistances(next, locations);
    const computed = await mapConcurrent(targets, DISTANCE_CONCURRENCY, (loc) =>
      distanceBetween(address, loc.address)
    );
    const distances: Record<string, ApartmentDistance> = { ...next.distances };
    targets.forEach((loc, i) => {
      distances[loc.id] = computed[i];
    });
    next = { ...next, distances };
  }

  return next;
}
```

Run: `npx vitest run src/lib/household-data/__tests__/concurrency.test.ts src/components/household-data/__tests__/api-client.test.ts src/components/household-data/__tests__/process-client.test.ts src/components/household-data/__tests__/enrichment.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing provider test**

Create `src/components/household-data/__tests__/household-data-provider.test.tsx`. It runs the real provider against an in-memory fake of the routes (envelopes pass through untouched, versions and stale checks are real) so the seal/open round trip, the 409 retry and the enrichment sequencing are exercised end to end:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useContext, useEffect } from "react";
import { CryptoContext, type CryptoContextValue } from "@/components/crypto/crypto-provider";
import { generateDataKey, seal, type Envelope } from "@/lib/crypto";
import { envelopeAad } from "@/lib/crypto";
import { emptyApartment, EMPTY_RATING, type Apartment, type Location } from "@/lib/household-data/types";
import type { ApartmentRow, LocationRow, RatingRow } from "@/lib/household-data/wire";
import {
  HouseholdDataContext,
  HouseholdDataProvider,
  type HouseholdDataContextValue,
} from "../household-data-provider";

const HID = 7;
const ME = { userId: "u-me", householdId: HID, userName: "Me" };
const A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const L1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// ---- fake server -----------------------------------------------------------

interface FakeServer {
  apartments: Map<string, ApartmentRow>;
  ratings: Map<string, RatingRow>; // key `${apartmentId}:${userId}`
  locations: Map<string, LocationRow>;
  process: {
    geocode: (address: string) => unknown;
    distance: (from: string, to: string) => unknown;
    checkListing: (url: string) => unknown;
  };
  calls: { method: string; url: string }[];
}

function makeServer(): FakeServer {
  return {
    apartments: new Map(),
    ratings: new Map(),
    locations: new Map(),
    process: {
      geocode: () => ({ lat: 47, lng: 8, postcode: "8000" }),
      distance: () => ({ bikeMin: 12, transitMin: 20 }),
      checkListing: () => ({ gone: false }),
    },
    calls: [],
  };
}

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function installFetch(server: FakeServer) {
  const now = () => new Date().toISOString();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = input;
      server.calls.push({ method, url });
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;

      if (url === "/api/apartments" && method === "GET") return json([...server.apartments.values()]);
      if (url === "/api/apartments" && method === "POST") {
        if (server.apartments.has(body.id)) return json({ error: "Duplicate id" }, 409);
        const row: ApartmentRow = { id: body.id, version: 1, envelope: body.envelope, createdAt: now(), updatedAt: now() };
        server.apartments.set(row.id, row);
        return json(row, 201);
      }
      const apt = url.match(/^\/api\/apartments\/([^/]+)$/);
      if (apt && method === "PUT") {
        const row = server.apartments.get(apt[1]);
        if (!row) return json({ error: "Not found" }, 404);
        if (row.version !== body.version) return json({ error: "Stale version", version: row.version }, 409);
        const updated = { ...row, version: row.version + 1, envelope: body.envelope, updatedAt: now() };
        server.apartments.set(row.id, updated);
        return json(updated);
      }
      if (apt && method === "DELETE") {
        if (!server.apartments.delete(apt[1])) return json({ error: "Not found" }, 404);
        for (const key of [...server.ratings.keys()]) if (key.startsWith(apt[1] + ":")) server.ratings.delete(key);
        return json(undefined, 204);
      }
      if (url === "/api/ratings" && method === "GET") return json([...server.ratings.values()]);
      const mine = url.match(/^\/api\/apartments\/([^/]+)\/ratings\/me$/);
      if (mine && method === "PUT") {
        const row: RatingRow = { apartmentId: mine[1], userId: ME.userId, userName: ME.userName, envelope: body.envelope, updatedAt: now() };
        server.ratings.set(`${mine[1]}:${ME.userId}`, row);
        return json(row);
      }
      if (mine && method === "DELETE") {
        server.ratings.delete(`${mine[1]}:${ME.userId}`);
        return json(undefined, 204);
      }
      if (url === "/api/locations" && method === "GET") return json([...server.locations.values()]);
      if (url === "/api/locations" && method === "POST") {
        const sortOrder = server.locations.size;
        const row: LocationRow = { id: body.id, sortOrder, envelope: body.envelope, createdAt: now(), updatedAt: now() };
        server.locations.set(row.id, row);
        return json(row, 201);
      }
      const loc = url.match(/^\/api\/locations\/([^/]+)$/);
      if (loc && method === "PUT") {
        const row = server.locations.get(loc[1]);
        if (!row) return json({ error: "Not found" }, 404);
        const updated = { ...row, envelope: body.envelope, updatedAt: now() };
        server.locations.set(row.id, updated);
        return json(updated);
      }
      if (loc && method === "DELETE") {
        server.locations.delete(loc[1]);
        return json(undefined, 204);
      }
      const move = url.match(/^\/api\/locations\/([^/]+)\/move$/);
      if (move && method === "POST") {
        const rows = [...server.locations.values()].sort((a, b) => a.sortOrder - b.sortOrder);
        const i = rows.findIndex((r) => r.id === move[1]);
        const j = body.direction === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= rows.length) return json({ error: "Not found" }, 404);
        [rows[i].sortOrder, rows[j].sortOrder] = [rows[j].sortOrder, rows[i].sortOrder];
        for (const r of rows) server.locations.set(r.id, r);
        return json(rows.sort((a, b) => a.sortOrder - b.sortOrder));
      }
      if (url === "/api/process/geocode") return json(server.process.geocode(body.address));
      if (url === "/api/process/distance") return json(server.process.distance(body.from, body.to));
      if (url === "/api/process/check-listing") return json(server.process.checkListing(body.url));
      throw new Error(`unhandled ${method} ${url}`);
    })
  );
}

// ---- harness ---------------------------------------------------------------

let dataKey: CryptoKey;
let server: FakeServer;
let captured: HouseholdDataContextValue | null = null;

function Capture() {
  const value = useContext(HouseholdDataContext);
  useEffect(() => {
    captured = value;
  });
  return (
    <div>
      <span data-testid="status">{value?.status}</span>
      <span data-testid="count">{value?.apartments.length ?? 0}</span>
      <ul>
        {value?.apartments.map((a) => (
          <li key={a.id} data-testid={`apt-${a.id}`}>
            {a.name}|{a.shortCode ?? "-"}|{a.avgOverall ?? "-"}|{a.corrupt ? "corrupt" : "ok"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderProvider() {
  const crypto = { keys: { userId: ME.userId, householdId: HID, privateKey: {} as CryptoKey, dataKey } } as unknown as CryptoContextValue;
  return render(
    <CryptoContext.Provider value={crypto}>
      <HouseholdDataProvider identity={ME}>
        <Capture />
      </HouseholdDataProvider>
    </CryptoContext.Provider>
  );
}

async function seed(id: string, data: Apartment, version = 1) {
  const envelope = await seal(dataKey, data, envelopeAad(HID, "apartments", id));
  server.apartments.set(id, { id, version, envelope, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
}

async function seedLocation(id: string, data: Location, sortOrder = 0) {
  const envelope = await seal(dataKey, data, envelopeAad(HID, "locations", id));
  server.locations.set(id, { id, sortOrder, envelope, createdAt: "", updatedAt: "" });
}

async function ready() {
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  return captured as HouseholdDataContextValue;
}

beforeEach(async () => {
  dataKey = await generateDataKey();
  server = makeServer();
  captured = null;
  installFetch(server);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- tests -----------------------------------------------------------------

describe("HouseholdDataProvider", () => {
  it("loads and decodes the three tables, deriving averages", async () => {
    await seed(A1, { ...emptyApartment("Flat A"), shortCode: "ABC-3B-1b-WY-8000" });
    const rating = await seal(dataKey, { ...EMPTY_RATING, overallFeeling: 4 }, envelopeAad(HID, "ratings", `${A1}:u-other`));
    server.ratings.set(`${A1}:u-other`, { apartmentId: A1, userId: "u-other", userName: "Other", envelope: rating, updatedAt: "" });
    renderProvider();
    const ctx = await ready();
    expect(screen.getByTestId(`apt-${A1}`).textContent).toBe("Flat A|ABC-3B-1b-WY-8000|4|ok");
    expect(ctx.apartments[0].ratings).toHaveLength(1);
    expect(ctx.apartments[0].myRating).toBeNull();
  });

  it("renders a corrupt placeholder for a row that fails to open", async () => {
    await seed(A1, emptyApartment("Good"));
    const foreign = await seal(dataKey, emptyApartment("Bad"), envelopeAad(HID, "apartments", A2));
    server.apartments.set(A1 + "-x", { id: A1 + "-x", version: 1, envelope: foreign, createdAt: "", updatedAt: "" });
    renderProvider();
    await ready();
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId(`apt-${A1}-x`).textContent).toBe("Unreadable apartment|-|-|corrupt");
  });

  it("createApartment seals, posts, shows the row and enriches it", async () => {
    await seedLocation(L1, { label: "Work", icon: "Briefcase", address: "Office 1", latitude: 47, longitude: 8 });
    renderProvider();
    const ctx = await ready();

    let view: Awaited<ReturnType<typeof ctx.createApartment>> | undefined;
    await act(async () => {
      view = await ctx.createApartment(A1, { ...emptyApartment("New"), address: "Street 5", numRooms: 2, numBathrooms: 1, hasWashingMachine: false });
    });
    expect(view?.id).toBe(A1);
    expect(server.apartments.get(A1)?.envelope).toMatchObject({ v: 1 });

    await waitFor(() => expect(screen.getByTestId(`apt-${A1}`).textContent).toMatch(/\|[A-Z]{3}-2B-1b-WN-8000\|/));
    const enriched = (captured as HouseholdDataContextValue).apartments.find((a) => a.id === A1)!;
    expect(enriched.latitude).toBe(47);
    expect(enriched.distances[L1]).toEqual({ bikeMin: 12, transitMin: 20 });
    expect(server.apartments.get(A1)?.version).toBe(2);
  });

  it("records an enrichment error and retryEnrichment clears it", async () => {
    server.process.geocode = () => {
      throw new Error("geocoder down");
    };
    renderProvider();
    const ctx = await ready();
    await act(async () => {
      await ctx.createApartment(A1, { ...emptyApartment("New"), address: "Street 5" });
    });
    await waitFor(() => expect((captured as HouseholdDataContextValue).enrichmentError[A1]).toBeTruthy());

    server.process.geocode = () => ({ lat: 1, lng: 2, postcode: "9000" });
    await act(async () => {
      await (captured as HouseholdDataContextValue).retryEnrichment(A1);
    });
    expect((captured as HouseholdDataContextValue).enrichmentError[A1]).toBeUndefined();
    expect((captured as HouseholdDataContextValue).apartments[0].latitude).toBe(1);
  });

  it("updateApartment retries once on a stale version", async () => {
    await seed(A1, { ...emptyApartment("Flat"), shortCode: "ABC-1B-1b-WN-8000" }, 1);
    renderProvider();
    const ctx = await ready();
    // Another device wrote in between: bump the server's version behind our back.
    const row = server.apartments.get(A1)!;
    server.apartments.set(A1, { ...row, version: 3, envelope: await seal(dataKey, { ...emptyApartment("Flat (renamed elsewhere)"), shortCode: "ABC-1B-1b-WN-8000" }, envelopeAad(HID, "apartments", A1)) });

    await act(async () => {
      await ctx.updateApartment(A1, (a) => ({ ...a, rentChf: 2000 }));
    });
    const after = (captured as HouseholdDataContextValue).apartments[0];
    expect(after.name).toBe("Flat (renamed elsewhere)");
    expect(after.rentChf).toBe(2000);
    expect(after.version).toBe(4);
    expect(server.calls.filter((c) => c.method === "PUT")).toHaveLength(2);
  });

  it("updateApartment throws on a second stale conflict", async () => {
    await seed(A1, emptyApartment("Flat"), 1);
    renderProvider();
    const ctx = await ready();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (init?.method === "PUT") return json({ error: "Stale version", version: 9 }, 409);
      return original(input, init);
    });
    await expect(ctx.updateApartment(A1, (a) => a)).rejects.toThrow("Stale version");
  });

  it("rateApartment upserts and removes my rating", async () => {
    await seed(A1, emptyApartment("Flat"));
    renderProvider();
    const ctx = await ready();
    await act(async () => {
      await ctx.rateApartment(A1, { ...EMPTY_RATING, overallFeeling: 5, comment: "nice" });
    });
    expect((captured as HouseholdDataContextValue).apartments[0].myRating).toBe(5);
    expect(server.ratings.get(`${A1}:u-me`)?.envelope).toMatchObject({ v: 1 });
    await act(async () => {
      await (captured as HouseholdDataContextValue).rateApartment(A1, null);
    });
    expect((captured as HouseholdDataContextValue).apartments[0].myRating).toBeNull();
    expect(server.ratings.size).toBe(0);
  });

  it("deleteApartment sends the pdf path and drops the row", async () => {
    await seed(A1, { ...emptyApartment("Flat"), pdf: { path: `/api/uploads/households/7/${A1}.pdf.enc`, iv: "aa" } });
    renderProvider();
    const ctx = await ready();
    await act(async () => {
      await ctx.deleteApartment(A1);
    });
    expect(screen.getByTestId("count").textContent).toBe("0");
    const del = server.calls.find((c) => c.method === "DELETE");
    expect(del?.url).toBe(`/api/apartments/${A1}`);
  });

  it("createLocation geocodes first, then fills that location's distances", async () => {
    await seed(A1, { ...emptyApartment("Flat"), address: "Street 5", latitude: 47, longitude: 8 });
    renderProvider();
    const ctx = await ready();
    let view: Awaited<ReturnType<typeof ctx.createLocation>> | undefined;
    await act(async () => {
      view = await ctx.createLocation(L1, { label: "Work", icon: "Briefcase", address: "Office 1", latitude: null, longitude: null });
    });
    expect(view).toMatchObject({ id: L1, latitude: 47, longitude: 8, sortOrder: 0 });
    await waitFor(() =>
      expect((captured as HouseholdDataContextValue).apartments[0].distances[L1]).toEqual({ bikeMin: 12, transitMin: 20 })
    );
  });

  it("updateLocation re-geocodes only when the address changed", async () => {
    await seedLocation(L1, { label: "Work", icon: "Briefcase", address: "Office 1", latitude: 47, longitude: 8 });
    renderProvider();
    const ctx = await ready();
    await act(async () => {
      await ctx.updateLocation(L1, (l) => ({ ...l, label: "Job" }));
    });
    expect(server.calls.filter((c) => c.url === "/api/process/geocode")).toHaveLength(0);
    server.process.geocode = () => ({ lat: 1, lng: 1, postcode: null });
    await act(async () => {
      await (captured as HouseholdDataContextValue).updateLocation(L1, (l) => ({ ...l, address: "Office 2" }));
    });
    expect(server.calls.filter((c) => c.url === "/api/process/geocode")).toHaveLength(1);
    expect((captured as HouseholdDataContextValue).locations[0]).toMatchObject({ label: "Job", address: "Office 2", latitude: 1 });
  });

  it("moveLocation reorders from the server's response", async () => {
    await seedLocation(L1, { label: "A", icon: "Briefcase", address: "x", latitude: null, longitude: null }, 0);
    const L2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await seedLocation(L2, { label: "B", icon: "Briefcase", address: "y", latitude: null, longitude: null }, 1);
    renderProvider();
    const ctx = await ready();
    expect(ctx.locations.map((l) => l.label)).toEqual(["A", "B"]);
    await act(async () => {
      await ctx.moveLocation(L2, "up");
    });
    expect((captured as HouseholdDataContextValue).locations.map((l) => l.label)).toEqual(["B", "A"]);
  });

  it("runMaintenance('listings') writes only rows whose listingGone changed", async () => {
    await seed(A1, { ...emptyApartment("Gone"), listingUrl: "https://a", listingGone: false });
    await seed(A2, { ...emptyApartment("Still up"), listingUrl: "https://b", listingGone: false });
    server.process.checkListing = (url: string) => ({ gone: url === "https://a" });
    renderProvider();
    const ctx = await ready();
    const progress = vi.fn();
    let report: Awaited<ReturnType<typeof ctx.runMaintenance>> | undefined;
    await act(async () => {
      report = await ctx.runMaintenance("listings", progress);
    });
    expect(report).toEqual({ updated: 1, skipped: 1, failed: [] });
    expect(progress).toHaveBeenLastCalledWith(2, 2);
    expect(server.apartments.get(A1)?.version).toBe(2);
    expect(server.apartments.get(A2)?.version).toBe(1);
    expect((captured as HouseholdDataContextValue).apartments.find((a) => a.id === A1)?.listingGone).toBe(true);
  });

  it("runMaintenance('geocode') fills coordinates and reports failures per row", async () => {
    await seed(A1, { ...emptyApartment("No coords"), address: "Street 1" });
    await seed(A2, { ...emptyApartment("Bad"), address: "Street 2" });
    server.process.geocode = (address: string) => {
      if (address === "Street 2") throw new Error("boom");
      return { lat: 5, lng: 6, postcode: "8000" };
    };
    renderProvider();
    const ctx = await ready();
    let report: Awaited<ReturnType<typeof ctx.runMaintenance>> | undefined;
    await act(async () => {
      report = await ctx.runMaintenance("geocode");
    });
    expect(report?.updated).toBe(1);
    expect(report?.failed).toEqual([{ id: A2, reason: expect.stringContaining("Request failed") }]);
    expect((captured as HouseholdDataContextValue).apartments.find((a) => a.id === A1)?.latitude).toBe(5);
  });

  it("runMaintenance('distances') recomputes every located pair", async () => {
    await seed(A1, { ...emptyApartment("Flat"), address: "Street 1", latitude: 1, longitude: 1, distances: { [L1]: { bikeMin: 99, transitMin: 99 } } });
    await seedLocation(L1, { label: "Work", icon: "Briefcase", address: "Office", latitude: 2, longitude: 2 });
    renderProvider();
    const ctx = await ready();
    let report: Awaited<ReturnType<typeof ctx.runMaintenance>> | undefined;
    await act(async () => {
      report = await ctx.runMaintenance("distances");
    });
    expect(report).toEqual({ updated: 1, skipped: 0, failed: [] });
    expect((captured as HouseholdDataContextValue).apartments[0].distances[L1]).toEqual({ bikeMin: 12, transitMin: 20 });
  });

  it("reports a load failure as status error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Not authenticated" }, 401)));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect((captured as HouseholdDataContextValue).error).toBe("Not authenticated");
  });

  it("unmount drops state: a remount reloads from the server, not from memory", async () => {
    await seed(A1, emptyApartment("Flat A"));
    const view = renderProvider();
    await ready();
    expect(screen.getByTestId("count").textContent).toBe("1");

    view.unmount();
    captured = null;
    server.apartments.clear();

    renderProvider();
    await ready();
    expect(screen.getByTestId("count").textContent).toBe("0");
    // Two GET /api/apartments in total — one per mount; nothing was cached
    // across the unmount.
    expect(server.calls.filter((c) => c.method === "GET" && c.url === "/api/apartments")).toHaveLength(2);
  });
});
```

Run: `npx vitest run src/components/household-data/__tests__/household-data-provider.test.tsx`
Expected: FAIL — cannot resolve `../household-data-provider`.

- [ ] **Step 5: Implement the provider and hook**

`src/components/household-data/household-data-provider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CryptoContext } from "@/components/crypto/crypto-provider";
import {
  openApartment,
  openLocation,
  openRating,
  sealApartment,
  sealLocation,
  sealRating,
} from "@/lib/household-data/codec";
import { mapConcurrent } from "@/lib/household-data/concurrency";
import { deriveApartments, deriveLocations } from "@/lib/household-data/derive";
import { planEnrichment, pruneDistances, type EnrichmentPlan } from "@/lib/household-data/enrich";
import {
  planDistanceMaintenance,
  planGeocodeMaintenance,
  planListingMaintenance,
  type MaintenanceKind,
  type MaintenanceReport,
} from "@/lib/household-data/maintenance";
import type {
  Apartment,
  ApartmentView,
  DecodedApartment,
  DecodedLocation,
  DecodedRating,
  Location,
  LocationView,
  Rating,
} from "@/lib/household-data/types";
import type { ApartmentRow, LocationRow, RatingRow } from "@/lib/household-data/wire";
import { ApiClientError, getJson, sendJson } from "./api-client";
import { enrichApartment } from "./enrichment";
import { checkListing, distanceBetween, geocodeAddress } from "./process-client";

export interface HouseholdIdentity {
  userId: string;
  householdId: number;
  userName: string;
}

export interface HouseholdDataContextValue {
  // Who is signed in and which household this store belongs to.
  identity: HouseholdIdentity;
  // The unlocked household data key (null in off mode). Pages that seal or
  // open PDFs themselves (upload, View PDF, reprocess) read it from here so
  // they never touch CryptoContext directly.
  dataKey: CryptoKey | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  apartments: ApartmentView[];
  locations: LocationView[];
  // Per-apartment message from the last failed enrichment; cleared on success.
  enrichmentError: Record<string, string>;
  reload(): Promise<void>;
  createApartment(id: string, data: Apartment): Promise<ApartmentView>;
  updateApartment(id: string, mutate: (a: Apartment) => Apartment): Promise<ApartmentView>;
  deleteApartment(id: string): Promise<void>;
  rateApartment(id: string, rating: Rating | null): Promise<void>;
  retryEnrichment(id: string): Promise<void>;
  createLocation(id: string, data: Location): Promise<LocationView>;
  updateLocation(id: string, mutate: (l: Location) => Location): Promise<LocationView>;
  deleteLocation(id: string): Promise<void>;
  moveLocation(id: string, direction: "up" | "down"): Promise<void>;
  runMaintenance(
    kind: MaintenanceKind,
    onProgress?: (done: number, total: number) => void
  ): Promise<MaintenanceReport>;
}

// Exported so component tests can render consumers under a hand-built value
// (see __tests__/fake-household-data.tsx).
export const HouseholdDataContext = createContext<HouseholdDataContextValue | null>(null);

interface Store {
  apartments: DecodedApartment[];
  ratings: DecodedRating[];
  locations: DecodedLocation[];
}

const EMPTY_STORE: Store = { apartments: [], ratings: [], locations: [] };
const LISTING_CONCURRENCY = 4;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isStale(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError && err.status === 409 && err.message === "Stale version";
}

// The one in-memory copy of the household's plaintext. Mounted by CryptoGate
// inside CryptoProvider, so it only exists while a usable data key does
// (or encryption is off); locking unmounts it.
export function HouseholdDataProvider({
  identity,
  children,
}: {
  identity: HouseholdIdentity;
  children: React.ReactNode;
}) {
  const { userId, householdId } = identity;
  const dataKey = useContext(CryptoContext)?.keys?.dataKey ?? null;

  const [status, setStatus] = useState<HouseholdDataContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [enrichmentError, setEnrichmentError] = useState<Record<string, string>>({});

  // Async writers read the latest store through this ref rather than a
  // closure, so two awaited writes in a row see each other's result.
  const storeRef = useRef<Store>(EMPTY_STORE);
  const commit = useCallback((update: (prev: Store) => Store) => {
    storeRef.current = update(storeRef.current);
    setStore(storeRef.current);
  }, []);

  // ---- decode helpers ------------------------------------------------------

  const decodeApartment = useCallback(
    async (row: ApartmentRow): Promise<DecodedApartment> => {
      const data = await openApartment(dataKey, householdId, row.id, row.envelope);
      if (data === null) console.error(`[household-data] apartment ${row.id} could not be opened`);
      return { id: row.id, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt, data };
    },
    [dataKey, householdId]
  );

  const decodeRating = useCallback(
    async (row: RatingRow): Promise<DecodedRating> => {
      const data = await openRating(dataKey, householdId, row.apartmentId, row.userId, row.envelope);
      if (data === null) console.error(`[household-data] rating ${row.apartmentId}:${row.userId} could not be opened`);
      return { apartmentId: row.apartmentId, userId: row.userId, userName: row.userName, updatedAt: row.updatedAt, data };
    },
    [dataKey, householdId]
  );

  const decodeLocation = useCallback(
    async (row: LocationRow): Promise<DecodedLocation> => {
      const data = await openLocation(dataKey, householdId, row.id, row.envelope);
      if (data === null) console.error(`[household-data] location ${row.id} could not be opened`);
      return { id: row.id, sortOrder: row.sortOrder, data };
    },
    [dataKey, householdId]
  );

  // ---- load ----------------------------------------------------------------

  const reload = useCallback(async () => {
    try {
      const [aRows, rRows, lRows] = await Promise.all([
        getJson<ApartmentRow[]>("/api/apartments"),
        getJson<RatingRow[]>("/api/ratings"),
        getJson<LocationRow[]>("/api/locations"),
      ]);
      const [apartments, ratings, locations] = await Promise.all([
        Promise.all(aRows.map(decodeApartment)),
        Promise.all(rRows.map(decodeRating)),
        Promise.all(lRows.map(decodeLocation)),
      ]);
      commit(() => ({ apartments, ratings, locations }));
      setError(null);
      setStatus("ready");
    } catch (err) {
      setError(messageOf(err));
      setStatus("error");
    }
  }, [commit, decodeApartment, decodeLocation, decodeRating]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ---- views ---------------------------------------------------------------

  const apartments = useMemo(
    () => deriveApartments(store.apartments, store.ratings, userId),
    [store.apartments, store.ratings, userId]
  );
  const locations = useMemo(() => deriveLocations(store.locations), [store.locations]);

  const viewOf = useCallback(
    (id: string): ApartmentView => {
      const s = storeRef.current;
      const row = s.apartments.find((a) => a.id === id);
      if (!row) throw new Error("Apartment not found");
      return deriveApartments([row], s.ratings, userId)[0];
    },
    [userId]
  );
  const locationViewOf = useCallback((id: string): LocationView => {
    const view = deriveLocations(storeRef.current.locations).find((l) => l.id === id);
    if (!view) throw new Error("Location not found");
    return view;
  }, []);
  const currentLocations = useCallback(() => deriveLocations(storeRef.current.locations), []);

  // ---- apartments ----------------------------------------------------------

  const putApartment = useCallback(
    async (row: DecodedApartment, next: Apartment): Promise<void> => {
      const envelope = await sealApartment(dataKey, householdId, row.id, next);
      const saved = await sendJson<ApartmentRow>("PUT", `/api/apartments/${row.id}`, {
        version: row.version,
        envelope,
      });
      commit((s) => ({
        ...s,
        apartments: s.apartments.map((a) =>
          a.id === row.id
            ? { id: saved.id, version: saved.version, createdAt: saved.createdAt, updatedAt: saved.updatedAt, data: next }
            : a
        ),
      }));
    },
    [commit, dataKey, householdId]
  );

  const refetchApartment = useCallback(
    async (id: string): Promise<DecodedApartment> => {
      const rows = await getJson<ApartmentRow[]>("/api/apartments");
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("Apartment not found");
      const decoded = await decodeApartment(row);
      commit((s) => ({ ...s, apartments: s.apartments.map((a) => (a.id === id ? decoded : a)) }));
      return decoded;
    },
    [commit, decodeApartment]
  );

  // Seals the mutated cached plaintext with the cached version; on a stale
  // conflict refetches the row, re-applies the mutator and retries once.
  const writeApartment = useCallback(
    async (id: string, mutate: (a: Apartment) => Apartment): Promise<{ previous: Apartment; next: Apartment }> => {
      const attempt = async (row: DecodedApartment) => {
        if (row.data === null) throw new Error("This apartment could not be decrypted and cannot be edited");
        const next = pruneDistances(mutate(row.data), currentLocations());
        await putApartment(row, next);
        return { previous: row.data, next };
      };
      const row = storeRef.current.apartments.find((a) => a.id === id);
      if (!row) throw new Error("Apartment not found");
      try {
        return await attempt(row);
      } catch (err) {
        if (!isStale(err)) throw err;
        return attempt(await refetchApartment(id));
      }
    },
    [currentLocations, putApartment, refetchApartment]
  );

  const takenCodes = useCallback((except: string) => {
    const taken = new Set<string>();
    for (const a of storeRef.current.apartments) {
      if (a.id !== except && a.data?.shortCode) taken.add(a.data.shortCode);
    }
    return taken;
  }, []);

  // Runs a plan for one row and writes the result. Failures are recorded
  // per row in enrichmentError; the row itself is already saved.
  const runEnrichment = useCallback(
    async (id: string, plan: EnrichmentPlan): Promise<void> => {
      try {
        const row = storeRef.current.apartments.find((a) => a.id === id);
        if (!row || row.data === null) return;
        const enriched = await enrichApartment(row.data, currentLocations(), takenCodes(id), plan);
        await writeApartment(id, (a) => ({
          ...a,
          latitude: enriched.latitude,
          longitude: enriched.longitude,
          shortCode: enriched.shortCode,
          distances: enriched.distances,
        }));
        setEnrichmentError((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _dropped, ...rest } = prev;
          return rest;
        });
      } catch (err) {
        setEnrichmentError((prev) => ({ ...prev, [id]: messageOf(err) }));
      }
    },
    [currentLocations, takenCodes, writeApartment]
  );

  const createApartment = useCallback(
    async (id: string, data: Apartment): Promise<ApartmentView> => {
      const envelope = await sealApartment(dataKey, householdId, id, data);
      const saved = await sendJson<ApartmentRow>("POST", "/api/apartments", { id, envelope });
      commit((s) => ({
        ...s,
        apartments: [
          ...s.apartments,
          { id: saved.id, version: saved.version, createdAt: saved.createdAt, updatedAt: saved.updatedAt, data },
        ],
      }));
      void runEnrichment(id, planEnrichment(null, data));
      return viewOf(id);
    },
    [commit, dataKey, householdId, runEnrichment, viewOf]
  );

  const updateApartment = useCallback(
    async (id: string, mutate: (a: Apartment) => Apartment): Promise<ApartmentView> => {
      const { previous, next } = await writeApartment(id, mutate);
      const plan = planEnrichment(previous, next);
      if (plan.geocode || plan.shortCode || plan.distances) void runEnrichment(id, plan);
      return viewOf(id);
    },
    [runEnrichment, viewOf, writeApartment]
  );

  const retryEnrichment = useCallback(
    async (id: string): Promise<void> => {
      const row = storeRef.current.apartments.find((a) => a.id === id);
      if (!row || row.data === null) return;
      await runEnrichment(id, planEnrichment(null, row.data));
    },
    [runEnrichment]
  );

  const deleteApartment = useCallback(
    async (id: string): Promise<void> => {
      const row = storeRef.current.apartments.find((a) => a.id === id);
      const pdfPath = row?.data?.pdf?.path;
      await sendJson<void>("DELETE", `/api/apartments/${id}`, pdfPath ? { pdfPath } : undefined);
      commit((s) => ({
        ...s,
        apartments: s.apartments.filter((a) => a.id !== id),
        ratings: s.ratings.filter((r) => r.apartmentId !== id),
      }));
    },
    [commit]
  );

  const rateApartment = useCallback(
    async (id: string, rating: Rating | null): Promise<void> => {
      if (rating === null) {
        await sendJson<void>("DELETE", `/api/apartments/${id}/ratings/me`);
        commit((s) => ({
          ...s,
          ratings: s.ratings.filter((r) => !(r.apartmentId === id && r.userId === userId)),
        }));
        return;
      }
      const envelope = await sealRating(dataKey, householdId, id, userId, rating);
      const saved = await sendJson<RatingRow>("PUT", `/api/apartments/${id}/ratings/me`, { envelope });
      const decoded: DecodedRating = {
        apartmentId: saved.apartmentId,
        userId: saved.userId,
        userName: saved.userName,
        updatedAt: saved.updatedAt,
        data: rating,
      };
      commit((s) => ({
        ...s,
        ratings: [...s.ratings.filter((r) => !(r.apartmentId === id && r.userId === userId)), decoded],
      }));
    },
    [commit, dataKey, householdId, userId]
  );

  // ---- locations -----------------------------------------------------------

  // Recomputes distances from every located apartment to the given
  // locations and writes each touched row. Shared by the location writes
  // and runMaintenance("distances").
  const fillDistances = useCallback(
    async (
      targets: LocationView[],
      mode: "missing" | "all",
      onProgress?: (done: number, total: number) => void
    ): Promise<MaintenanceReport> => {
      const plan = planDistanceMaintenance(
        deriveApartments(storeRef.current.apartments, [], userId),
        targets,
        mode
      );
      const report: MaintenanceReport = { updated: 0, skipped: 0, failed: [] };
      let done = 0;
      for (const entry of plan) {
        try {
          const address = entry.apartment.address as string;
          const computed = await mapConcurrent(entry.locations, 3, (loc) =>
            distanceBetween(address, loc.address)
          );
          await writeApartment(entry.apartment.id, (a) => {
            const distances = { ...a.distances };
            entry.locations.forEach((loc, i) => {
              distances[loc.id] = computed[i];
            });
            return { ...a, distances };
          });
          report.updated++;
        } catch (err) {
          report.failed.push({ id: entry.apartment.id, reason: messageOf(err) });
        }
        onProgress?.(++done, plan.length);
      }
      return report;
    },
    [userId, writeApartment]
  );

  const geocodeLocation = useCallback(async (data: Location): Promise<Location> => {
    const geo = await geocodeAddress(data.address);
    return { ...data, latitude: geo.lat, longitude: geo.lng };
  }, []);

  const createLocation = useCallback(
    async (id: string, data: Location): Promise<LocationView> => {
      const located = await geocodeLocation(data);
      const envelope = await sealLocation(dataKey, householdId, id, located);
      const saved = await sendJson<LocationRow>("POST", "/api/locations", { id, envelope });
      commit((s) => ({
        ...s,
        locations: [...s.locations, { id: saved.id, sortOrder: saved.sortOrder, data: located }],
      }));
      const view = locationViewOf(id);
      void fillDistances([view], "all");
      return view;
    },
    [commit, dataKey, fillDistances, geocodeLocation, householdId, locationViewOf]
  );

  const updateLocation = useCallback(
    async (id: string, mutate: (l: Location) => Location): Promise<LocationView> => {
      const row = storeRef.current.locations.find((l) => l.id === id);
      if (!row || row.data === null) throw new Error("Location not found");
      let next = mutate(row.data);
      const addressChanged = next.address !== row.data.address;
      if (addressChanged) next = await geocodeLocation(next);
      const envelope = await sealLocation(dataKey, householdId, id, next);
      const saved = await sendJson<LocationRow>("PUT", `/api/locations/${id}`, { envelope });
      commit((s) => ({
        ...s,
        locations: s.locations.map((l) =>
          l.id === id ? { id: saved.id, sortOrder: saved.sortOrder, data: next } : l
        ),
      }));
      const view = locationViewOf(id);
      if (addressChanged) void fillDistances([view], "all");
      return view;
    },
    [commit, dataKey, fillDistances, geocodeLocation, householdId, locationViewOf]
  );

  // Apartments keep a stale `distances[id]` entry until their next write,
  // where pruneDistances drops it — cheaper than re-sealing every row now.
  const deleteLocation = useCallback(
    async (id: string): Promise<void> => {
      await sendJson<void>("DELETE", `/api/locations/${id}`);
      commit((s) => ({ ...s, locations: s.locations.filter((l) => l.id !== id) }));
    },
    [commit]
  );

  const moveLocation = useCallback(
    async (id: string, direction: "up" | "down"): Promise<void> => {
      const rows = await sendJson<LocationRow[]>("POST", `/api/locations/${id}/move`, { direction });
      const order = new Map(rows.map((r) => [r.id, r.sortOrder]));
      commit((s) => ({
        ...s,
        locations: s.locations.map((l) => ({ ...l, sortOrder: order.get(l.id) ?? l.sortOrder })),
      }));
    },
    [commit]
  );

  // ---- maintenance ---------------------------------------------------------

  const runMaintenance = useCallback(
    async (
      kind: MaintenanceKind,
      onProgress?: (done: number, total: number) => void
    ): Promise<MaintenanceReport> => {
      const views = deriveApartments(storeRef.current.apartments, storeRef.current.ratings, userId);
      const report: MaintenanceReport = { updated: 0, skipped: 0, failed: [] };

      if (kind === "geocode") {
        const targets = planGeocodeMaintenance(views);
        let done = 0;
        for (const apt of targets) {
          try {
            const row = storeRef.current.apartments.find((a) => a.id === apt.id);
            if (!row || row.data === null) {
              report.skipped++;
            } else {
              const enriched = await enrichApartment(row.data, currentLocations(), takenCodes(apt.id), {
                geocode: true,
                shortCode: row.data.shortCode === null,
                distances: true,
              });
              if (enriched.latitude === null) {
                report.skipped++;
              } else {
                await writeApartment(apt.id, (a) => ({
                  ...a,
                  latitude: enriched.latitude,
                  longitude: enriched.longitude,
                  shortCode: enriched.shortCode,
                  distances: enriched.distances,
                }));
                report.updated++;
              }
            }
          } catch (err) {
            report.failed.push({ id: apt.id, reason: messageOf(err) });
          }
          onProgress?.(++done, targets.length);
        }
        return report;
      }

      if (kind === "distances") {
        return fillDistances(currentLocations(), "all", onProgress);
      }

      // listings
      const targets = planListingMaintenance(views);
      let done = 0;
      await mapConcurrent(targets, LISTING_CONCURRENCY, async (apt) => {
        try {
          const gone = await checkListing(apt.listingUrl as string);
          if (gone === null || gone === apt.listingGone) {
            report.skipped++;
          } else {
            await writeApartment(apt.id, (a) => ({
              ...a,
              listingGone: gone,
              listingCheckedAt: new Date().toISOString(),
            }));
            report.updated++;
          }
        } catch (err) {
          report.failed.push({ id: apt.id, reason: messageOf(err) });
        }
        onProgress?.(++done, targets.length);
      });
      return report;
    },
    [currentLocations, fillDistances, takenCodes, userId, writeApartment]
  );

  // ---- context -------------------------------------------------------------

  const value = useMemo<HouseholdDataContextValue>(
    () => ({
      identity,
      dataKey,
      status,
      error,
      apartments,
      locations,
      enrichmentError,
      reload,
      createApartment,
      updateApartment,
      deleteApartment,
      rateApartment,
      retryEnrichment,
      createLocation,
      updateLocation,
      deleteLocation,
      moveLocation,
      runMaintenance,
    }),
    [
      identity, dataKey, status, error, apartments, locations, enrichmentError, reload,
      createApartment, updateApartment, deleteApartment, rateApartment, retryEnrichment,
      createLocation, updateLocation, deleteLocation, moveLocation, runMaintenance,
    ]
  );

  return <HouseholdDataContext.Provider value={value}>{children}</HouseholdDataContext.Provider>;
}
```

`src/components/household-data/use-household-data.ts`:

```ts
"use client";

import { useContext } from "react";
import { HouseholdDataContext, type HouseholdDataContextValue } from "./household-data-provider";

export function useHouseholdData(): HouseholdDataContextValue {
  const ctx = useContext(HouseholdDataContext);
  if (!ctx) throw new Error("useHouseholdData must be used inside HouseholdDataProvider");
  return ctx;
}
```

Run: `npx vitest run src/components/household-data`
Expected: PASS. If the "records an enrichment error" test is flaky because the enrichment promise has not settled before `waitFor` times out, raise the `waitFor` timeout to `{ timeout: 3000 }` — do not change the provider.

- [ ] **Step 6: Mount the provider from `CryptoGate`**

Replace `src/components/crypto/crypto-gate.tsx` with:

```tsx
import { auth } from "@/auth";
import { HouseholdDataProvider } from "@/components/household-data/household-data-provider";
import { readEncryptionMode } from "@/lib/encryption-mode";
import { CryptoProvider } from "./crypto-provider";

// Server component: reads the env var once per request so no env access
// ships to the client, and hands the session identity to the data store.
// CryptoProvider renders its own screens instead of children until the key
// is usable, so HouseholdDataProvider only ever mounts with a key (or with
// encryption off). The proxy guarantees a session with a household here.
export async function CryptoGate({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;
  const householdId = session?.householdId;
  if (!userId || !householdId) return null;
  const identity = {
    userId,
    householdId,
    userName: session?.user?.name ?? "Member",
  };
  return (
    <CryptoProvider mode={readEncryptionMode()}>
      <HouseholdDataProvider identity={identity}>{children}</HouseholdDataProvider>
    </CryptoProvider>
  );
}
```

The four layouts (`src/app/{apartments,compare,guide,settings}/layout.tsx`) already render `<CryptoGate>` inside an async server component; an async child component needs no change at the call sites.

- [ ] **Step 7: Write the shared test helper**

Create `src/components/household-data/__tests__/fake-household-data.tsx`:

```tsx
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { emptyApartment, type ApartmentView, type LocationView } from "@/lib/household-data/types";
import { HouseholdDataContext, type HouseholdDataContextValue } from "../household-data-provider";

// Builders and a renderer for page/component tests: render under a
// hand-built context value instead of the real provider + fetch.

export function makeApartmentView(over: Partial<ApartmentView> & { id: string }): ApartmentView {
  return {
    ...emptyApartment(over.name ?? `Apartment ${over.id}`),
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ratings: [],
    avgKitchen: null,
    avgBalconies: null,
    avgLocation: null,
    avgFloorplan: null,
    avgOverall: null,
    myRating: null,
    ...over,
  };
}

export function makeLocationView(over: Partial<LocationView> & { id: string }): LocationView {
  return {
    label: `Location ${over.id}`,
    icon: "Briefcase",
    address: "Somewhere 1",
    latitude: null,
    longitude: null,
    sortOrder: 0,
    ...over,
  };
}

export function makeHouseholdData(over: Partial<HouseholdDataContextValue> = {}): HouseholdDataContextValue {
  return {
    identity: { userId: "u-me", householdId: 7, userName: "Me" },
    dataKey: null,
    status: "ready",
    error: null,
    apartments: [],
    locations: [],
    enrichmentError: {},
    reload: vi.fn(async () => {}),
    createApartment: vi.fn(async (id: string) => makeApartmentView({ id })),
    updateApartment: vi.fn(async (id: string) => makeApartmentView({ id })),
    deleteApartment: vi.fn(async () => {}),
    rateApartment: vi.fn(async () => {}),
    retryEnrichment: vi.fn(async () => {}),
    createLocation: vi.fn(async (id: string) => makeLocationView({ id })),
    updateLocation: vi.fn(async (id: string) => makeLocationView({ id })),
    deleteLocation: vi.fn(async () => {}),
    moveLocation: vi.fn(async () => {}),
    runMaintenance: vi.fn(async () => ({ updated: 0, skipped: 0, failed: [] })),
    ...over,
  };
}

export function renderWithHouseholdData(
  ui: React.ReactElement,
  over: Partial<HouseholdDataContextValue> = {}
) {
  const value = makeHouseholdData(over);
  const result = render(<HouseholdDataContext.Provider value={value}>{ui}</HouseholdDataContext.Provider>);
  return { value, ...result };
}
```

(`vitest.config.ts` sets `mockReset: true`, which resets implementations between tests — `makeHouseholdData` is called inside each test, after the reset, so its implementations survive. A helper called once at module scope would not.)

- [ ] **Step 8: Run everything this task touched**

Run: `npx vitest run src/components/household-data src/lib/household-data src/components/crypto`
Expected: PASS. (`crypto-provider.test.tsx` still passes: it renders `CryptoProvider` directly, not `CryptoGate`.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/household-data/concurrency.ts src/lib/household-data/__tests__/concurrency.test.ts src/components/household-data src/components/crypto/crypto-gate.tsx
git commit -m "feat(household-data): client store with envelope codec, enrichment and maintenance

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

---

### Task 12: List page — sort/pager on the store, card/row on `ApartmentView`, overview map without backfill

**Files:**
- Modify: `src/lib/apartment-sort.ts` (string ids, `distances` record, numeric `avgOverall`)
- Rewrite test: `src/lib/__tests__/apartment-sort.test.ts`
- Modify: `src/lib/use-apartment-pager.ts` (reads `useHouseholdData()`, no fetch)
- Rewrite test: `src/lib/__tests__/use-apartment-pager.test.tsx`
- Delete: `src/app/apartments/_components/apartment-summary.ts`
- Modify: `src/app/apartments/_components/apartment-card.tsx`, `src/app/apartments/_components/apartment-row.tsx`
- Modify: `src/components/apartments-overview-map.tsx`, `src/components/apartments-overview-map-inner.tsx`
- Rewrite test: `src/components/__tests__/apartments-overview-map.test.tsx`
- Modify: `src/app/apartments/page.tsx`
- Rewrite test: `src/app/apartments/__tests__/apartments-page.test.tsx`

**Interfaces:**
- Consumes: `useHouseholdData()` and `HouseholdDataContext` (Task 11), `ApartmentView`, `LocationView`, `ApartmentDistance` (Task 4), test helpers `makeApartmentView`, `makeLocationView`, `makeHouseholdData`, `renderWithHouseholdData` from `src/components/household-data/__tests__/fake-household-data.tsx` (Task 11).
- Produces (used by Tasks 14–15):
  - `SortableApartment { id: string; rentChf: number | null; sizeM2: number | null; numRooms: number | null; numBathrooms: number | null; numBalconies: number | null; distances: Record<string, ApartmentDistance>; avgOverall: number | null; shortCode: string | null; createdAt: string | null }` — `ApartmentView` satisfies it structurally.
  - `LocationSortField = \`bikeTo:${string}\` | \`transitTo:${string}\``; `LocationLite { id: string; label: string }` (`LocationView` satisfies it); `listSortOptions(locations: LocationLite[])`, `compareSortOptions(locations: LocationLite[])`, `compareApartments(a, b, field, direction)` unchanged in name.
  - `useApartmentPager(currentId: string): { loading: boolean; error: string | null; total: number; position: number | null; prevId: string | null; nextId: string | null }`.
  - `ApartmentsOverviewMap({ apartments: OverviewApartment[]; locations: OverviewLocation[]; onOpen?: () => void })` with `OverviewApartment { id: string; shortCode: string | null; name: string; latitude: number | null; longitude: number | null }`, `OverviewLocation { id: string; label: string; latitude: number | null; longitude: number | null }`. `onOpen` fires once, the first time the panel is opened in this mount.
  - `ApartmentCard({ apt: ApartmentView })`, `ApartmentRow({ apt: ApartmentView })`.

The list page's old server calls — `GET /api/apartments`, `GET /api/locations`, `POST /api/apartments/check-listings`, `POST /api/geocode/backfill` — all disappear. The page reads the store; `runMaintenance("listings")` runs once on mount, `runMaintenance("geocode")` runs the first time the overview map is opened (spec §"Maintenance").

- [ ] **Step 1: Rewrite the sort test for string ids and the distances record**

Replace `src/lib/__tests__/apartment-sort.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  compareApartments,
  listSortOptions,
  compareSortOptions,
  parseLocationSortField,
  type SortableApartment,
} from "@/lib/apartment-sort";

function apt(overrides: Partial<SortableApartment> = {}): SortableApartment {
  return {
    id: "a",
    rentChf: null,
    sizeM2: null,
    numRooms: null,
    numBathrooms: null,
    numBalconies: null,
    distances: {},
    avgOverall: null,
    shortCode: null,
    createdAt: null,
    ...overrides,
  };
}

const withBike = (min: number | null) => ({
  "loc-1": { bikeMin: min, transitMin: null },
});
const withTransit = (min: number | null) => ({
  "loc-1": { bikeMin: null, transitMin: min },
});

describe("compareApartments", () => {
  it("sorts numeric fields ascending and descending", () => {
    const a = apt({ id: "a", rentChf: 1000 });
    const b = apt({ id: "b", rentChf: 2000 });
    expect(compareApartments(a, b, "rentChf", "asc")).toBeLessThan(0);
    expect(compareApartments(a, b, "rentChf", "desc")).toBeGreaterThan(0);
  });

  it("compares avgOverall numerically", () => {
    const a = apt({ id: "a", avgOverall: 4.5 });
    const b = apt({ id: "b", avgOverall: 3.2 });
    expect(compareApartments(a, b, "avgOverall", "desc")).toBeLessThan(0);
  });

  it("sorts createdAt chronologically", () => {
    const older = apt({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const newer = apt({ id: "b", createdAt: "2026-02-01T00:00:00Z" });
    expect(compareApartments(older, newer, "createdAt", "asc")).toBeLessThan(0);
    expect(compareApartments(older, newer, "createdAt", "desc")).toBeGreaterThan(0);
  });

  it("sorts shortCode in natural order", () => {
    const a = apt({ id: "a", shortCode: "F-10" });
    const b = apt({ id: "b", shortCode: "F-2" });
    expect(compareApartments(a, b, "shortCode", "asc")).toBeGreaterThan(0);
  });

  it("puts nulls last regardless of direction", () => {
    const has = apt({ id: "a", rentChf: 1000 });
    const none = apt({ id: "b", rentChf: null });
    expect(compareApartments(has, none, "rentChf", "asc")).toBeLessThan(0);
    expect(compareApartments(has, none, "rentChf", "desc")).toBeLessThan(0);
    expect(compareApartments(none, has, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("breaks ties by createdAt desc, then id asc", () => {
    const older = apt({ id: "a", rentChf: 1000, createdAt: "2026-01-01T00:00:00Z" });
    const newer = apt({ id: "b", rentChf: 1000, createdAt: "2026-02-01T00:00:00Z" });
    expect(compareApartments(older, newer, "rentChf", "asc")).toBeGreaterThan(0);

    const x = apt({ id: "x", rentChf: 1000 });
    const y = apt({ id: "y", rentChf: 1000 });
    expect(compareApartments(x, y, "rentChf", "asc")).toBeLessThan(0);
    expect(compareApartments(y, x, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("falls through to tie-breakers when both primaries are null", () => {
    const a = apt({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const b = apt({ id: "b", createdAt: "2026-02-01T00:00:00Z" });
    expect(compareApartments(a, b, "rentChf", "asc")).toBeGreaterThan(0);
  });

  it("puts a null createdAt last in both directions", () => {
    const dated = apt({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const undated = apt({ id: "b", createdAt: null });
    expect(compareApartments(dated, undated, "createdAt", "asc")).toBeLessThan(0);
    expect(compareApartments(dated, undated, "createdAt", "desc")).toBeLessThan(0);
  });

  it("sorts numBathrooms and numBalconies", () => {
    const a = apt({ id: "a", numBathrooms: 1, numBalconies: 2 });
    const b = apt({ id: "b", numBathrooms: 2, numBalconies: 1 });
    expect(compareApartments(a, b, "numBathrooms", "asc")).toBeLessThan(0);
    expect(compareApartments(a, b, "numBalconies", "desc")).toBeLessThan(0);
  });

  it("sorts by bike distance to a location, nulls last", () => {
    const near = apt({ id: "a", distances: withBike(5) });
    const far = apt({ id: "b", distances: withBike(20) });
    const unknown = apt({ id: "c", distances: withBike(null) });
    expect(compareApartments(near, far, "bikeTo:loc-1", "asc")).toBeLessThan(0);
    expect(compareApartments(far, unknown, "bikeTo:loc-1", "asc")).toBeLessThan(0);
    expect(compareApartments(far, unknown, "bikeTo:loc-1", "desc")).toBeLessThan(0);
  });

  it("sorts by transit distance and tie-breaks on createdAt", () => {
    const a = apt({ id: "a", distances: withTransit(10), createdAt: "2026-01-01T00:00:00Z" });
    const b = apt({ id: "b", distances: withTransit(10), createdAt: "2026-02-01T00:00:00Z" });
    expect(compareApartments(a, b, "transitTo:loc-1", "asc")).toBeGreaterThan(0);
  });

  it("treats a missing location entry as null", () => {
    const has = apt({ id: "a", distances: withBike(5) });
    const missing = apt({ id: "b", distances: {} });
    expect(compareApartments(has, missing, "bikeTo:loc-1", "asc")).toBeLessThan(0);
  });
});

describe("parseLocationSortField", () => {
  it("parses uuid-style location ids", () => {
    expect(parseLocationSortField("bikeTo:3f2a-11")).toEqual({ mode: "bike", locationId: "3f2a-11" });
    expect(parseLocationSortField("transitTo:x")).toEqual({ mode: "transit", locationId: "x" });
    expect(parseLocationSortField("rentChf")).toBeNull();
    expect(parseLocationSortField("bikeTo:")).toBeNull();
  });
});

describe("sort options", () => {
  const locations = [
    { id: "loc-1", label: "Work" },
    { id: "loc-2", label: "Gym" },
  ];

  it("lists the six static fields then bike/transit per location", () => {
    const ids = listSortOptions(locations).map((o) => o.id);
    expect(ids).toEqual([
      "createdAt", "rentChf", "sizeM2", "numRooms", "avgOverall", "shortCode",
      "bikeTo:loc-1", "transitTo:loc-1", "bikeTo:loc-2", "transitTo:loc-2",
    ]);
    expect(listSortOptions(locations).find((o) => o.id === "bikeTo:loc-1")?.label).toBe("Bike to Work");
  });

  it("compare options include all eight static fields", () => {
    const ids = compareSortOptions(locations).map((o) => o.id);
    expect(ids.slice(0, 8)).toEqual([
      "createdAt", "rentChf", "sizeM2", "numRooms", "numBathrooms", "numBalconies", "avgOverall", "shortCode",
    ]);
    expect(ids).toContain("transitTo:loc-2");
  });
});
```

(Check the existing `listSortOptions` / `compareSortOptions` label format before running: `src/lib/apartment-sort.ts` today builds `Bike to ${label}` / `Transit to ${label}`. Keep those strings; only the id type changes.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/__tests__/apartment-sort.test.ts`
Expected: FAIL — type errors on `id: "a"` / `distances: {}` (vitest transpiles without type-checking, so the observable failures are the distance and tie-break assertions: `distances.find` is not a function, and `a.id - b.id` on strings yields `NaN`).

- [ ] **Step 3: Update `src/lib/apartment-sort.ts`**

Apply these edits (everything else in the file stays as it is):

```ts
// 1. The location-scoped sort field carries the location's string id.
export type LocationSortField = `bikeTo:${string}` | `transitTo:${string}`;

// 2. Sortable shape: string id, distances keyed by location id, numeric average.
import type { ApartmentDistance } from "@/lib/household-data/types";

export interface SortableApartment {
  id: string;
  rentChf: number | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  distances: Record<string, ApartmentDistance>;
  avgOverall: number | null;
  shortCode: string | null;
  createdAt: string | null;
}

// 3. Parsing: any non-empty id after the colon.
export function parseLocationSortField(
  field: string
): { mode: "bike" | "transit"; locationId: string } | null {
  const m = /^(bikeTo|transitTo):(.+)$/.exec(field);
  if (!m) return null;
  return { mode: m[1] === "bikeTo" ? "bike" : "transit", locationId: m[2] };
}

// 4. Extraction: avgOverall is already a number; distances is a record.
function extract(apt: SortableApartment, field: SortField): number | string | null {
  const loc = parseLocationSortField(field);
  if (loc) {
    const d = apt.distances[loc.locationId];
    if (!d) return null;
    return loc.mode === "bike" ? d.bikeMin : d.transitMin;
  }
  switch (field) {
    case "createdAt": {
      if (apt.createdAt === null) return null;
      const t = Date.parse(apt.createdAt);
      return Number.isNaN(t) ? null : t;
    }
    case "avgOverall":
      return apt.avgOverall;
    case "shortCode":
      return apt.shortCode;
    default:
      return apt[field];
  }
}

// 5. Location shape used to build options.
export interface LocationLite {
  id: string;
  label: string;
}

// 6. Final tie-break in compareApartments: string ids compare lexically.
//    Replace `return a.id - b.id;` with:
    return a.id.localeCompare(b.id);
```

`isSortField(v)` stays as it is (it accepts static fields plus anything `parseLocationSortField` parses) — verify it delegates to `parseLocationSortField` rather than its own regex; if it has its own, replace that regex with `/^(bikeTo|transitTo):(.+)$/` too.

- [ ] **Step 4: Run the sort test**

Run: `npx vitest run src/lib/__tests__/apartment-sort.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the pager test against the store**

Replace `src/lib/__tests__/use-apartment-pager.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { HouseholdDataContext } from "@/components/household-data/household-data-provider";
import {
  makeApartmentView,
  makeHouseholdData,
} from "@/components/household-data/__tests__/fake-household-data";
import { useApartmentPager } from "@/lib/use-apartment-pager";

// Default (createdAt desc) order: b (March), c (February), a (January).
const APARTMENTS = [
  makeApartmentView({ id: "a", name: "Sonnenweg 3", rentChf: 2200, createdAt: "2026-01-15T10:00:00Z" }),
  makeApartmentView({ id: "b", name: "Bergstrasse 12", rentChf: 1800, createdAt: "2026-03-20T10:00:00Z" }),
  makeApartmentView({ id: "c", name: "Seeblick 7", rentChf: null, createdAt: "2026-02-10T10:00:00Z" }),
];

function renderPager(
  currentId: string,
  over: Parameters<typeof makeHouseholdData>[0] = {}
) {
  const value = makeHouseholdData({ apartments: APARTMENTS, ...over });
  return renderHook(() => useApartmentPager(currentId), {
    wrapper: ({ children }) => (
      <HouseholdDataContext.Provider value={value}>{children}</HouseholdDataContext.Provider>
    ),
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("useApartmentPager", () => {
  it("reports loading while the store is loading", () => {
    const { result } = renderPager("b", { status: "loading", apartments: [] });
    expect(result.current.loading).toBe(true);
    expect(result.current.total).toBe(0);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("positions the middle apartment under the default sort (createdAt desc)", () => {
    const { result } = renderPager("c");
    expect(result.current.loading).toBe(false);
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe("b");
    expect(result.current.nextId).toBe("a");
  });

  it("honors the sort preference stored in localStorage", () => {
    // rentChf asc: b (1800), a (2200), c (null last).
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    const { result } = renderPager("a");
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe("b");
    expect(result.current.nextId).toBe("c");
  });

  it("returns prevId null on the first and nextId null on the last", () => {
    expect(renderPager("b").result.current.prevId).toBeNull();
    expect(renderPager("b").result.current.nextId).toBe("c");
    expect(renderPager("a").result.current.nextId).toBeNull();
    expect(renderPager("a").result.current.prevId).toBe("c");
  });

  it("returns null position and ids when the current id is not in the store", () => {
    const { result } = renderPager("nope");
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
  });

  it("falls back to defaults when localStorage holds invalid sort values", () => {
    localStorage.setItem("flatpare-apartments-sort-field", "bogus");
    localStorage.setItem("flatpare-apartments-sort-direction", "sideways");
    const { result } = renderPager("c");
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe("b");
  });

  it("surfaces the store's error", () => {
    const { result } = renderPager("b", { status: "error", error: "Couldn't load household data", apartments: [] });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("Couldn't load household data");
    expect(result.current.position).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx vitest run src/lib/__tests__/use-apartment-pager.test.tsx`
Expected: FAIL — the hook still calls `fetch` (undefined in this test → "fetch is not defined" / loading never resolves).

- [ ] **Step 7: Rewrite `src/lib/use-apartment-pager.ts`**

```ts
"use client";

import { useMemo, useState } from "react";
import {
  compareApartments,
  isSortDirection,
  isSortField,
  SORT_DIRECTION_STORAGE_KEY,
  SORT_FIELD_STORAGE_KEY,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import { useHouseholdData } from "@/components/household-data/use-household-data";

interface ApartmentPagerResult {
  loading: boolean;
  error: string | null;
  total: number;
  position: number | null;
  prevId: string | null;
  nextId: string | null;
}

function readSortField(): SortField {
  const raw = window.localStorage.getItem(SORT_FIELD_STORAGE_KEY);
  return raw !== null && isSortField(raw) ? raw : "createdAt";
}

function readSortDirection(): SortDirection {
  const raw = window.localStorage.getItem(SORT_DIRECTION_STORAGE_KEY);
  return raw !== null && isSortDirection(raw) ? raw : "desc";
}

// Prev/next neighbours of `currentId` under the list page's persisted sort.
// Reads the household store: no request, and the order matches what the user
// last saw on the list.
export function useApartmentPager(currentId: string): ApartmentPagerResult {
  const { status, error, apartments } = useHouseholdData();

  // Read sort preference once on mount — detail page does not need same-tab
  // sync because the user cannot change sort while on the detail page.
  const [sortField] = useState<SortField>(() => readSortField());
  const [sortDirection] = useState<SortDirection>(() => readSortDirection());

  return useMemo(() => {
    const loading = status === "loading";
    if (loading || status === "error") {
      return { loading, error, total: 0, position: null, prevId: null, nextId: null };
    }
    const sorted = [...apartments].sort((a, b) =>
      compareApartments(a, b, sortField, sortDirection)
    );
    const index = sorted.findIndex((a) => a.id === currentId);
    if (index === -1) {
      return { loading: false, error: null, total: sorted.length, position: null, prevId: null, nextId: null };
    }
    return {
      loading: false,
      error: null,
      total: sorted.length,
      position: index + 1,
      prevId: index > 0 ? sorted[index - 1].id : null,
      nextId: index < sorted.length - 1 ? sorted[index + 1].id : null,
    };
  }, [status, error, apartments, sortField, sortDirection, currentId]);
}
```

- [ ] **Step 8: Run the pager test**

Run: `npx vitest run src/lib/__tests__/use-apartment-pager.test.tsx`
Expected: PASS.

- [ ] **Step 9: Card and row on `ApartmentView`; delete `apartment-summary.ts`**

`git rm src/app/apartments/_components/apartment-summary.ts`.

In `src/app/apartments/_components/apartment-card.tsx` replace the import and the props type, and the star rating guard:

```tsx
import type { ApartmentView } from "@/lib/household-data/types";

export function ApartmentCard({ apt }: { apt: ApartmentView }) {
```

```tsx
            {apt.avgOverall !== null && (
              <StarRating value={Math.round(apt.avgOverall)} readonly size="sm" />
            )}
```

In `src/app/apartments/_components/apartment-row.tsx` make the same three edits (import `ApartmentView`, `{ apt: ApartmentView }`, and the `avgOverall !== null` / `Math.round(apt.avgOverall)` guard where it renders `StarRating`).

- [ ] **Step 10: Rewrite the overview map test — `onOpen` replaces the backfill fetch**

Replace `src/components/__tests__/apartments-overview-map.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the dynamic Leaflet import so jsdom doesn't instantiate a real map.
vi.mock("../apartments-overview-map-inner", () => ({
  default: ({ apartments, locations }: { apartments: { id: string }[]; locations: { id: string }[] }) => (
    <div data-testid="leaflet-map">
      pins:{apartments.length}+{locations.length}
    </div>
  ),
}));

import { ApartmentsOverviewMap } from "../apartments-overview-map";

const APT = { id: "a1", name: "x", shortCode: "X-1", latitude: 47, longitude: 8 };
const LOC = { id: "l1", label: "Work", latitude: 47.1, longitude: 8.1 };

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ApartmentsOverviewMap", () => {
  it("starts collapsed when localStorage has no flag", () => {
    render(<ApartmentsOverviewMap apartments={[]} locations={[]} />);
    expect(screen.getByRole("button", { name: /Map overview/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("leaflet-map")).toBeNull();
  });

  it("starts open when localStorage flag is '1' and calls onOpen once", async () => {
    localStorage.setItem("flatpare-overview-map-open", "1");
    const onOpen = vi.fn();
    render(<ApartmentsOverviewMap apartments={[APT]} locations={[LOC]} onOpen={onOpen} />);
    expect(screen.getByRole("button", { name: /Map overview/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("leaflet-map")).toHaveTextContent("pins:1+1");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("toggles open on click, persists the flag, and only counts geocoded pins", async () => {
    const user = userEvent.setup();
    render(
      <ApartmentsOverviewMap
        apartments={[APT, { id: "a2", name: "y", shortCode: null, latitude: null, longitude: null }]}
        locations={[]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(localStorage.getItem("flatpare-overview-map-open")).toBe("1");
    expect(screen.getByTestId("leaflet-map")).toHaveTextContent("pins:1+0");
    expect(screen.getByText(/1 apartments · 0 locations/)).toBeInTheDocument();
  });

  it("shows the empty state when nothing is geocoded", async () => {
    const user = userEvent.setup();
    render(<ApartmentsOverviewMap apartments={[]} locations={[]} />);
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(screen.getByText(/No geocoded apartments or locations yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("leaflet-map")).toBeNull();
  });

  it("calls onOpen on the first open only, not again after close/reopen", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ApartmentsOverviewMap apartments={[APT]} locations={[]} onOpen={onOpen} />);
    expect(onOpen).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: /Map overview/i });
    await user.click(toggle);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await user.click(toggle);
    await user.click(toggle);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not call fetch at all", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const user = userEvent.setup();
    render(<ApartmentsOverviewMap apartments={[APT]} locations={[]} onOpen={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 11: Run it to see it fail**

Run: `npx vitest run src/components/__tests__/apartments-overview-map.test.tsx`
Expected: FAIL — `onOpen` never called; `fetch` is called.

- [ ] **Step 12: Update the overview map and its inner component**

In `src/components/apartments-overview-map.tsx` replace the two pin interfaces, the props, and the effect block:

```tsx
export interface OverviewApartment {
  id: string;
  shortCode: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface OverviewLocation {
  id: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  apartments: OverviewApartment[];
  locations: OverviewLocation[];
  // Fired once, the first time the panel is open in this mount. The list
  // page uses it to kick off the geocode maintenance pass.
  onOpen?: () => void;
}

export function ApartmentsOverviewMap({ apartments, locations, onOpen }: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const openedRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    }
    if (!open || openedRef.current) return;
    openedRef.current = true;
    onOpenRef.current?.();
  }, [open]);
```

The `apartmentPins` / `locationPins` memos and the JSX stay as they are, except the empty-state copy loses its last sentence — it now reads:

```tsx
              No geocoded apartments or locations yet. Apartments and locations
              are geocoded when saved; anything still missing coordinates is
              filled in when this panel opens.
```

In `src/components/apartments-overview-map-inner.tsx` change `id: number` to `id: string` in both `ApartmentPin` and `LocationPin`. Nothing else there changes (the `key` strings already interpolate the id).

- [ ] **Step 13: Run the map test**

Run: `npx vitest run src/components/__tests__/apartments-overview-map.test.tsx`
Expected: PASS.

- [ ] **Step 14: Rewrite the list page test on the fake store**

Replace `src/app/apartments/__tests__/apartments-page.test.tsx`. Keep every existing assertion (view toggle, sort, search, gone badge) — only the setup changes: fixtures via `makeApartmentView`, rendering via `renderWithHouseholdData`, no `fetch`.

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  makeApartmentView,
  renderWithHouseholdData,
} from "@/components/household-data/__tests__/fake-household-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// The overview map pulls Leaflet through next/dynamic; stub the inner map.
vi.mock("@/components/apartments-overview-map-inner", () => ({
  default: () => <div data-testid="leaflet-map" />,
}));

import ApartmentsPage from "../page";

const APARTMENTS = [
  makeApartmentView({
    id: "a1",
    name: "Sonnenweg 3",
    address: "Sonnenweg 3, 8001 Zürich",
    sizeM2: 60,
    numRooms: 2.5,
    rentChf: 2200,
    shortCode: "ABC-2.5B-WY-4057",
    createdAt: "2026-01-15T10:00:00Z",
  }),
  makeApartmentView({
    id: "a2",
    name: "Bergstrasse 12",
    address: "Bergstrasse 12, 8032 Zürich",
    sizeM2: 45,
    numRooms: 2,
    rentChf: 1800,
    shortCode: "DEF-2B-W-4058",
    avgOverall: 3.5,
    myRating: 4,
    createdAt: "2026-03-20T10:00:00Z",
  }),
  makeApartmentView({
    id: "a3",
    name: "Seeblick 7",
    address: null,
    sizeM2: 80,
    numRooms: 3.5,
    rentChf: null,
    shortCode: "GHI-3.5B-WY-4059",
    avgOverall: 4.5,
    createdAt: "2026-02-10T10:00:00Z",
  }),
];

function renderPage(over: Parameters<typeof renderWithHouseholdData>[1] = {}) {
  return renderWithHouseholdData(<ApartmentsPage />, { apartments: APARTMENTS, ...over });
}

function headingOrder(): (string | null)[] {
  return Array.from(document.querySelectorAll("h3")).map((el) => el.textContent);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Apartments page — store states", () => {
  it("shows the loading state while the store loads", () => {
    renderPage({ status: "loading", apartments: [] });
    expect(screen.getByText("Loading apartments...")).toBeInTheDocument();
  });

  it("shows the store error", () => {
    renderPage({ status: "error", error: "Couldn't load household data", apartments: [] });
    expect(screen.getByText("Couldn't load household data")).toBeInTheDocument();
  });

  it("shows the empty state with an upload link", () => {
    renderPage({ apartments: [] });
    expect(screen.getByText("No apartments yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload your first listing/i })).toHaveAttribute("href", "/apartments/new");
  });

  it("runs the listing maintenance pass exactly once on mount", async () => {
    const { value, rerender } = renderPage();
    await waitFor(() => expect(value.runMaintenance).toHaveBeenCalledWith("listings"));
    rerender(<ApartmentsPage />);
    expect(value.runMaintenance).toHaveBeenCalledTimes(1);
  });

  it("runs the geocode pass the first time the map opens", async () => {
    const user = userEvent.setup();
    const { value } = renderPage();
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(value.runMaintenance).toHaveBeenCalledWith("geocode");
  });

  it("offers a retry for a failed enrichment", async () => {
    const user = userEvent.setup();
    const { value } = renderPage({ enrichmentError: { a1: "Geocoding failed" } });
    expect(screen.getByText(/Enrichment failed for Sonnenweg 3/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(value.retryEnrichment).toHaveBeenCalledWith("a1");
  });
});

describe("Apartments page — view toggle", () => {
  it("renders grid view by default", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("[data-view='grid']")).not.toBeNull();
  });

  it("switches to list view and persists it", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(document.querySelector("[data-view='list']")).not.toBeNull();
    expect(localStorage.getItem("flatpare-apartments-view")).toBe("list");
  });

  it("restores list view from localStorage", () => {
    localStorage.setItem("flatpare-apartments-view", "list");
    renderPage();
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Apartments page — sort", () => {
  it("defaults to newest first (createdAt desc) when no preference is stored", () => {
    renderPage();
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });

  it("applies a stored sort preference", () => {
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    renderPage();
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  it("falls back to defaults on invalid stored values", () => {
    localStorage.setItem("flatpare-apartments-sort-field", "bogus");
    localStorage.setItem("flatpare-apartments-sort-direction", "sideways");
    renderPage();
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });

  it("changes the sort field via the select and persists it", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("combobox", { name: "Sort by" }));
    await user.click(await screen.findByRole("option", { name: "Price" }));
    // rentChf desc: 2200, 1800, null last
    expect(headingOrder()).toEqual(["Sonnenweg 3", "Bergstrasse 12", "Seeblick 7"]);
    expect(localStorage.getItem("flatpare-apartments-sort-field")).toBe("rentChf");
  });

  it("toggles direction and persists it", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Descending/i }));
    expect(headingOrder()).toEqual(["Sonnenweg 3", "Seeblick 7", "Bergstrasse 12"]);
    expect(localStorage.getItem("flatpare-apartments-sort-direction")).toBe("asc");
  });

  it("renders exactly 6 sort field options with no locations", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("combobox", { name: "Sort by" }));
    expect(await screen.findAllByRole("option")).toHaveLength(6);
  });
});

describe("Apartments page — search", () => {
  it("renders an empty search input", () => {
    renderPage();
    expect(screen.getByRole("textbox", { name: "Search apartments" })).toHaveValue("");
  });

  it("filters by name", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "berg");
    expect(headingOrder()).toEqual(["Bergstrasse 12"]);
  });

  it("filters by short code", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "ghi-3.5");
    expect(headingOrder()).toEqual(["Seeblick 7"]);
  });

  it("filters by address", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "8001");
    expect(headingOrder()).toEqual(["Sonnenweg 3"]);
  });

  it("does not match a null address against the literal 'null'", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "null");
    expect(screen.getByText('No apartments match "null"')).toBeInTheDocument();
  });

  it("shows the empty-result state and clears it via 'Show all apartments'", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "zzz");
    expect(screen.getByText('No apartments match "zzz"')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all apartments" }));
    expect(headingOrder()).toHaveLength(3);
  });

  it("clears via the X button", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "berg");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("textbox", { name: "Search apartments" })).toHaveValue("");
    expect(headingOrder()).toHaveLength(3);
  });

  it("treats whitespace-only queries as empty", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "   ");
    expect(headingOrder()).toHaveLength(3);
  });

  it("composes with sort", async () => {
    const user = userEvent.setup();
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "zürich");
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3"]);
  });
});

describe("Apartments page — listing gone badge", () => {
  it("renders a Gone badge only for apartments with listingGone=true", () => {
    renderPage({
      apartments: [
        { ...APARTMENTS[0], listingGone: true },
        { ...APARTMENTS[1], listingGone: false },
        APARTMENTS[2],
      ],
    });
    expect(screen.getAllByText("Gone")).toHaveLength(1);
  });
});
```

If the existing test file asserts anything not listed here (open it before replacing), carry that assertion over with the same fixture ids — the intent is zero lost coverage.

- [ ] **Step 15: Run it to see it fail**

Run: `npx vitest run src/app/apartments/__tests__/apartments-page.test.tsx`
Expected: FAIL — the page still calls `fetch`.

- [ ] **Step 16: Rewrite `src/app/apartments/page.tsx` on the store**

Replace the imports, state and data-loading portion. The JSX for search, sort controls, view toggle and the two list renderings stays as it is; the changes are:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  LayoutGrid,
  List as ListIcon,
  Search,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorDisplay } from "@/components/error-display";
import { cn } from "@/lib/utils";
import { usePersistedEnum } from "@/lib/use-persisted-enum";
import {
  compareApartments,
  SORT_FIELD_STORAGE_KEY,
  SORT_DIRECTION_STORAGE_KEY,
  SORT_CHANGE_EVENT,
  isSortField,
  isSortDirection,
  listSortOptions,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { ApartmentsOverviewMap } from "@/components/apartments-overview-map";
import { ApartmentCard } from "./_components/apartment-card";
import { ApartmentRow } from "./_components/apartment-row";

type ViewMode = "grid" | "list";
const VIEW_STORAGE_KEY = "flatpare-apartments-view";
const VIEW_CHANGE_EVENT = "flatpare-apartments-view-change";

function isViewMode(v: string): v is ViewMode {
  return v === "grid" || v === "list";
}

export default function ApartmentsPage() {
  const {
    status,
    error,
    apartments,
    locations,
    enrichmentError,
    retryEnrichment,
    runMaintenance,
  } = useHouseholdData();
  const [view, setView] = usePersistedEnum<ViewMode>(
    VIEW_STORAGE_KEY,
    VIEW_CHANGE_EVENT,
    "grid",
    isViewMode
  );
  const [sortField, setSortField] = usePersistedEnum<SortField>(
    SORT_FIELD_STORAGE_KEY,
    SORT_CHANGE_EVENT,
    "createdAt",
    isSortField
  );
  const [sortDirection, setSortDirection] = usePersistedEnum<SortDirection>(
    SORT_DIRECTION_STORAGE_KEY,
    SORT_CHANGE_EVENT,
    "desc",
    isSortDirection
  );
  const [query, setQuery] = useState("");

  // Listing-status check runs once per mount (spec: "on list-page mount"),
  // not on every store refresh.
  const listingsCheckedRef = useRef(false);
  useEffect(() => {
    if (listingsCheckedRef.current) return;
    listingsCheckedRef.current = true;
    void runMaintenance("listings").catch(() => {
      // best-effort background pass; failures are per-row and already
      // surfaced through the store's enrichment errors
    });
  }, [runMaintenance]);

  const filteredApartments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return apartments;
    return apartments.filter((apt) => {
      const name = apt.name.toLowerCase();
      const code = apt.shortCode?.toLowerCase() ?? "";
      const addr = apt.address?.toLowerCase() ?? "";
      return name.includes(q) || code.includes(q) || addr.includes(q);
    });
  }, [apartments, query]);

  const sortedApartments = useMemo(
    () =>
      [...filteredApartments].sort((a, b) =>
        compareApartments(a, b, sortField, sortDirection)
      ),
    [filteredApartments, sortField, sortDirection]
  );

  const sortOptions = useMemo(() => listSortOptions(locations), [locations]);

  const failedEnrichments = useMemo(
    () => apartments.filter((apt) => enrichmentError[apt.id] !== undefined),
    [apartments, enrichmentError]
  );

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading apartments...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8">
        <ErrorDisplay headline={error ?? "Couldn't load apartments"} />
      </div>
    );
  }

  if (apartments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="rounded-full bg-muted p-4">
          <Building2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="font-medium">No apartments yet</p>
          <p className="text-sm text-muted-foreground">
            Upload a PDF listing to get started
          </p>
        </div>
        <Link href="/apartments/new" className={buttonVariants()}>
          Upload your first listing
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ApartmentsOverviewMap
        apartments={apartments}
        locations={locations}
        onOpen={() => {
          void runMaintenance("geocode").catch(() => {
            // best-effort
          });
        }}
      />
      {failedEnrichments.length > 0 && (
        <div
          role="status"
          className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          {failedEnrichments.map((apt) => (
            <div key={apt.id} className="flex items-center justify-between gap-2">
              <span>
                Enrichment failed for {apt.name}: {enrichmentError[apt.id]}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void retryEnrichment(apt.id)}
              >
                Retry
              </Button>
            </div>
          ))}
        </div>
      )}
      {/* …search input, heading + sort/view controls, and the grid/list
          rendering are unchanged from the current file… */}
```

Keep the rest of the current JSX verbatim (search box, `<h1>Apartments</h1>` with the sort `Select`, direction button, view group and "Upload New" link, then the `sortedApartments.length === 0 && query.trim() !== ""` empty-search branch, grid and list branches). Remove the now-unused imports (`fetchErrorFromResponse`, `fetchErrorFromException`, `ErrorDetails`, `LocationOfInterest`, `ApartmentSummary`) and the `ErrorState` interface, `reload` and `refreshAfterBackfill` functions.

`ErrorDisplay` accepts `headline` alone (its `details` prop is optional — check `src/components/error-display.tsx`; if it is required, pass `details={undefined}`).

- [ ] **Step 17: Run the page test and the rest of this task's tests**

Run: `npx vitest run src/app/apartments/__tests__/apartments-page.test.tsx src/lib/__tests__/apartment-sort.test.ts src/lib/__tests__/use-apartment-pager.test.tsx src/components/__tests__/apartments-overview-map.test.tsx`
Expected: PASS.

`npm run typecheck` will still fail in the compare page / detail page (they import the old shapes) until Tasks 14–15 — expected.

- [ ] **Step 18: Commit**

```bash
git add src/lib/apartment-sort.ts src/lib/__tests__/apartment-sort.test.ts src/lib/use-apartment-pager.ts src/lib/__tests__/use-apartment-pager.test.tsx src/app/apartments/_components src/components/apartments-overview-map.tsx src/components/apartments-overview-map-inner.tsx src/components/__tests__/apartments-overview-map.test.tsx src/app/apartments/page.tsx src/app/apartments/__tests__/apartments-page.test.tsx
git commit -m "feat(apartments): list page, sort and pager read the household store

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 13: Upload page — parse + encrypt-upload in the browser, save through the store

**Files:**
- Modify: `src/components/apartment-form-fields.tsx` (drop `pdfUrl`; `formFromExtracted(extracted)`; `formToFields` + `apartmentFromForm` replace `formToPayload`)
- Modify: `src/lib/fetch-error.ts` + `src/lib/__tests__/fetch-error.test.ts` (add `errorDetailsFromException`)
- Modify test: `src/components/__tests__/apartment-form-fields.test.tsx` (helpers block only)
- Modify: `src/app/apartments/new/_components/types.ts` (`pdf`, `pdfWarning` on `UploadItem`), `src/app/apartments/new/_components/review-step.tsx` (render `pdfWarning`)
- Rewrite: `src/app/apartments/new/page.tsx`
- Rewrite tests: `src/app/apartments/new/__tests__/full-flow.test.tsx`, `src/app/apartments/new/__tests__/retry.test.tsx`
- Delete: `src/app/apartments/new/__tests__/blob-upload.test.tsx` (the Blob client path is now exercised by `src/lib/__tests__/upload-pdf.test.ts` from Task 10; the page no longer knows which transport is used)

**Interfaces:**
- Consumes: `useHouseholdData()` → `createApartment`, `dataKey`, `identity` (Task 11); `parsePdf`, `ParsePdfError` from `@/components/household-data/process-client` (Task 11); `encryptAndUploadPdf` from `@/components/household-data/pdf-files` (Task 10); `newRowId` from `@/lib/household-data/ids` (Task 4); `Apartment`, `ApartmentPdf`, `emptyApartment` from `@/lib/household-data/types` (Task 4); test helpers from Task 11.
- Produces (used by Task 14):
  - `ApartmentForm` without `pdfUrl`; `ApartmentLike` without `pdfUrl`; `formFromExtracted(extracted: Record<string, unknown>): ApartmentForm`; `formFromApartment(apt: ApartmentLike): ApartmentForm` (unchanged apart from the dropped field).
  - `ApartmentFieldValues = Pick<Apartment, "name" | "address" | "sizeM2" | "numRooms" | "numBathrooms" | "numBalconies" | "hasWashingMachine" | "rentChf" | "listingUrl" | "summary" | "availableFrom">`; `formToFields(form: ApartmentForm): ApartmentFieldValues` (the parse/coerce step, without `rawExtractedData` or `pdf`); `apartmentFromForm(form: ApartmentForm, pdf: ApartmentPdf | null): Apartment` = `{ ...emptyApartment(form.name), ...formToFields(form), rawExtractedData: form.rawExtractedData, pdf }`.
  - `UploadItem` gains `pdf: ApartmentPdf | null` and `pdfWarning?: string`.
  - `errorDetailsFromException(err: unknown): ErrorDetails` from `@/lib/fetch-error` — `ErrorDetails` for an error thrown by the store or a process client (no URL; `status` copied when the error carries a numeric `status`, as `ApiClientError`/`ParsePdfError` do). Tasks 14–16 use it for every store failure.

Flow per dropped file (spec §"Upload and parse"): read the bytes once, then run `parsePdf(bytes, name)` (blind proxy to Gemini) and `encryptAndUploadPdf(dataKey, householdId, itemId, bytes)` concurrently. The upload item's id **is** the apartment id (`newRowId()`), so the encrypted file lands at its final path before the row exists; a discarded item leaves an orphan `.pdf.enc` behind, which is accepted (the file is ciphertext and the server holds no key). A failed parse is the item's error (with the Retry affordance as today); a failed upload is only a warning — the apartment saves with `pdf: null`.

- [ ] **Step 1: Update the form-helper tests**

In `src/components/__tests__/apartment-form-fields.test.tsx` replace the `describe("apartment-form-fields helpers", …)` block:

```tsx
describe("apartment-form-fields helpers", () => {
  it("formFromExtracted maps AI extraction to form-shape strings, defaulting null → ''", () => {
    const form = formFromExtracted({
      name: "Pretty Place",
      address: "Sonnenweg 3",
      sizeM2: 60,
      numRooms: 2.5,
      numBathrooms: 1,
      numBalconies: null,
      hasWashingMachine: true,
      rentChf: 2400,
      listingUrl: null,
    });
    expect(form.name).toBe("Pretty Place");
    expect(form.rentChf).toBe("2400");
    expect(form.sizeM2).toBe("60");
    expect(form.numBalconies).toBe("");
    expect(form.hasWashingMachine).toBe(true);
    expect(form.listingUrl).toBe("");
    expect(form.rawExtractedData).toEqual(expect.objectContaining({ name: "Pretty Place" }));
  });

  it("formFromApartment maps a stored apartment back into form fields", () => {
    const form = formFromApartment({
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: null,
      rentChf: null,
      listingUrl: null,
      summary: "Nice flat",
      availableFrom: "2026-05-01",
    });
    expect(form.summary).toBe("Nice flat");
    expect(form.availableFrom).toBe("2026-05-01");
    expect(form.rentChf).toBe("");
  });

  it("formToFields coerces strings back to numbers (or null) and preserves summary", () => {
    const fields = formToFields({
      ...emptyApartmentForm,
      name: "X",
      rentChf: "2400",
      sizeM2: "",
      numRooms: "2.5",
      numBathrooms: "1",
      summary: "keeps content",
    });
    expect(fields.rentChf).toBe(2400);
    expect(fields.sizeM2).toBeNull();
    expect(fields.numRooms).toBe(2.5);
    expect(fields.numBathrooms).toBe(1);
    expect(fields.summary).toBe("keeps content");
  });

  it("formToFields coerces empty optional strings to null", () => {
    const fields = formToFields(emptyApartmentForm);
    expect(fields.summary).toBeNull();
    expect(fields.address).toBeNull();
    expect(fields.listingUrl).toBeNull();
    expect(fields.availableFrom).toBeNull();
    expect("pdf" in fields).toBe(false);
    expect("rawExtractedData" in fields).toBe(false);
  });

  it("apartmentFromForm builds a full Apartment with defaults, raw data and the pdf", () => {
    const pdf = { path: "/api/uploads/households/7/x.pdf.enc", iv: "AAAA" };
    const apt = apartmentFromForm(
      { ...emptyApartmentForm, name: "X", rentChf: "1000", rawExtractedData: { name: "X" } },
      pdf
    );
    expect(apt.name).toBe("X");
    expect(apt.rentChf).toBe(1000);
    expect(apt.pdf).toEqual(pdf);
    expect(apt.rawExtractedData).toEqual({ name: "X" });
    expect(apt.userEditedFields).toEqual([]);
    expect(apt.distances).toEqual({});
    expect(apt.shortCode).toBeNull();
    expect(apt.listingGone).toBe(false);
  });
});
```

Update the import at the top of that file: replace `formToPayload` with `formToFields, apartmentFromForm`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/__tests__/apartment-form-fields.test.tsx`
Expected: FAIL — `formToFields` / `apartmentFromForm` are not exported; `formFromExtracted` still expects two arguments.

- [ ] **Step 3: Update `src/components/apartment-form-fields.tsx`**

Replace the type/helper section above `ApartmentFormFields` (the component itself is untouched, but remove any `pdfUrl` input if one is rendered — today there is none):

```tsx
import {
  emptyApartment,
  type Apartment,
  type ApartmentPdf,
} from "@/lib/household-data/types";

export type ApartmentForm = {
  name: string;
  address: string;
  sizeM2: string;
  numRooms: string;
  numBathrooms: string;
  numBalconies: string;
  hasWashingMachine: boolean | null;
  rentChf: string;
  listingUrl: string;
  summary: string;
  availableFrom: string;
  rawExtractedData: Record<string, unknown> | null;
};

export const emptyApartmentForm: ApartmentForm = {
  name: "",
  address: "",
  sizeM2: "",
  numRooms: "",
  numBathrooms: "",
  numBalconies: "",
  hasWashingMachine: null,
  rentChf: "",
  listingUrl: "",
  summary: "",
  availableFrom: "",
  rawExtractedData: null,
};

export function formFromExtracted(extracted: Record<string, unknown>): ApartmentForm {
  return {
    name: (extracted.name as string) || "",
    address: (extracted.address as string) || "",
    sizeM2: extracted.sizeM2 != null ? String(extracted.sizeM2) : "",
    numRooms: extracted.numRooms != null ? String(extracted.numRooms) : "",
    numBathrooms: extracted.numBathrooms != null ? String(extracted.numBathrooms) : "",
    numBalconies: extracted.numBalconies != null ? String(extracted.numBalconies) : "",
    hasWashingMachine:
      typeof extracted.hasWashingMachine === "boolean" ? extracted.hasWashingMachine : null,
    rentChf: extracted.rentChf != null ? String(extracted.rentChf) : "",
    listingUrl: (extracted.listingUrl as string) || "",
    summary: typeof extracted.summary === "string" ? extracted.summary : "",
    availableFrom: typeof extracted.availableFrom === "string" ? extracted.availableFrom : "",
    rawExtractedData: extracted,
  };
}

export type ApartmentLike = {
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  listingUrl: string | null;
  summary: string | null;
  availableFrom: string | null;
};

export function formFromApartment(apt: ApartmentLike): ApartmentForm {
  const numOrEmpty = (v: number | null | undefined) => (v != null ? String(v) : "");
  return {
    name: apt.name,
    address: apt.address ?? "",
    sizeM2: numOrEmpty(apt.sizeM2),
    numRooms: numOrEmpty(apt.numRooms),
    numBathrooms: numOrEmpty(apt.numBathrooms),
    numBalconies: numOrEmpty(apt.numBalconies),
    hasWashingMachine: apt.hasWashingMachine,
    rentChf: numOrEmpty(apt.rentChf),
    listingUrl: apt.listingUrl ?? "",
    summary: apt.summary ?? "",
    availableFrom: apt.availableFrom ?? "",
    rawExtractedData: null,
  };
}

export type ApartmentFieldValues = Pick<
  Apartment,
  | "name"
  | "address"
  | "sizeM2"
  | "numRooms"
  | "numBathrooms"
  | "numBalconies"
  | "hasWashingMachine"
  | "rentChf"
  | "listingUrl"
  | "summary"
  | "availableFrom"
>;

// The user-editable fields, coerced from form strings. Callers merge this
// into an existing Apartment (edit) or into emptyApartment (create).
export function formToFields(form: ApartmentForm): ApartmentFieldValues {
  return {
    name: form.name,
    address: form.address || null,
    sizeM2: form.sizeM2 ? parseFloat(form.sizeM2) : null,
    numRooms: form.numRooms ? parseFloat(form.numRooms) : null,
    numBathrooms: form.numBathrooms ? parseInt(form.numBathrooms) : null,
    numBalconies: form.numBalconies ? parseInt(form.numBalconies) : null,
    hasWashingMachine: form.hasWashingMachine,
    rentChf: form.rentChf ? parseFloat(form.rentChf) : null,
    listingUrl: form.listingUrl || null,
    summary: form.summary || null,
    availableFrom: form.availableFrom || null,
  };
}

export function apartmentFromForm(form: ApartmentForm, pdf: ApartmentPdf | null): Apartment {
  return {
    ...emptyApartment(form.name),
    ...formToFields(form),
    rawExtractedData: form.rawExtractedData,
    pdf,
  };
}
```

- [ ] **Step 4: Run the helper test**

Run: `npx vitest run src/components/__tests__/apartment-form-fields.test.tsx`
Expected: PASS.

- [ ] **Step 4b: Add `errorDetailsFromException` to `src/lib/fetch-error.ts` (test first)**

Append to `src/lib/__tests__/fetch-error.test.ts` (import `errorDetailsFromException` alongside the existing imports):

```ts
describe("errorDetailsFromException", () => {
  it("captures message and stack, and a numeric status when the error carries one", () => {
    const err = Object.assign(new Error("Stale version"), { status: 409 });
    const d = errorDetailsFromException(err);
    expect(d.message).toBe("Stale version");
    expect(d.status).toBe(409);
    expect(d.stack).toContain("Stale version");
    expect(d.url).toBeUndefined();
    expect(typeof d.timestamp).toBe("string");
  });

  it("leaves status undefined for a plain Error and stringifies non-Errors", () => {
    expect(errorDetailsFromException(new Error("x")).status).toBeUndefined();
    expect(errorDetailsFromException("boom").message).toBe("boom");
  });
});
```

Run: `npx vitest run src/lib/__tests__/fetch-error.test.ts` — expected FAIL (not exported). Then add to `src/lib/fetch-error.ts`:

```ts
// For errors thrown by the household store or a process client rather than
// by a fetch the page made itself: no URL to report, but ApiClientError and
// ParsePdfError carry the HTTP status, which is worth surfacing.
export function errorDetailsFromException(err: unknown): ErrorDetails {
  const status =
    typeof err === "object" && err !== null && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;
  if (err instanceof Error) {
    return { status, message: err.message, stack: err.stack, timestamp: new Date().toISOString() };
  }
  return { status, message: String(err), timestamp: new Date().toISOString() };
}
```

Run again — expected PASS.

- [ ] **Step 5: Extend `UploadItem` and the review card**

`src/app/apartments/new/_components/types.ts`:

```ts
import type { ApartmentForm } from "@/components/apartment-form-fields";
import type { ApartmentPdf } from "@/lib/household-data/types";

export interface UploadItem {
  // Also the apartment id the item is saved under (client-minted UUID).
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  errorReason?: "quota" | "invalid_pdf" | "unknown";
  errorRetryAfterSeconds?: number;
  form: ApartmentForm;
  // Set once the encrypted PDF is stored; null when the upload failed.
  pdf: ApartmentPdf | null;
  pdfWarning?: string;
  expanded: boolean;
  saved: boolean;
  discarded: boolean;
}
```

In `src/app/apartments/new/_components/review-step.tsx`, directly after the `<p className="text-xs text-muted-foreground truncate">…</p>` summary line inside the card header, add:

```tsx
                      {item.pdfWarning && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          {item.pdfWarning}
                        </p>
                      )}
```

- [ ] **Step 6: Rewrite the full-flow test on the store**

Replace `src/app/apartments/new/__tests__/full-flow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";
import { makeApartmentView } from "@/components/household-data/__tests__/fake-household-data";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

vi.mock("@/components/household-data/process-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/household-data/process-client")>()),
  parsePdf: vi.fn(),
}));
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));

import UploadPage from "../page";
import { parsePdf } from "@/components/household-data/process-client";
import { encryptAndUploadPdf } from "@/components/household-data/pdf-files";

const PDF = { path: "/api/uploads/households/7/x.pdf.enc", iv: "AAAA" };

function makePdfFile(name: string): File {
  return new File([new Blob(["%PDF-1.4\n"], { type: "application/pdf" })], name, {
    type: "application/pdf",
  });
}

async function uploadFiles(user: ReturnType<typeof userEvent.setup>, files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  await user.upload(input, files);
}

beforeEach(() => {
  vi.mocked(parsePdf).mockImplementation(async (_bytes, filename) => ({
    extracted: { name: `Parsed ${filename}`, rentChf: 1500 },
    aiAvailable: true,
  }));
  vi.mocked(encryptAndUploadPdf).mockResolvedValue(PDF);
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

describe("manual single-entry flow", () => {
  it("shows the drop zone first", () => {
    renderWithHouseholdData(<UploadPage />);
    expect(screen.getByRole("button", { name: /Or add manually without PDF/i })).toBeInTheDocument();
  });

  it("switches to the manual form", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<UploadPage />);
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    expect(screen.getByLabelText(/^Name/i)).toBeInTheDocument();
  });

  it("requires a name", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    fireEvent.submit(screen.getByLabelText(/^Name/i).closest("form")!);
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(value.createApartment).not.toHaveBeenCalled();
  });

  it("saves a manual apartment through the store and redirects to its detail page", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    await user.type(screen.getByLabelText(/^Name/i), "Manual Flat");
    await user.type(screen.getByLabelText(/Rent/i), "1800");
    await user.click(screen.getByRole("button", { name: /^Save apartment$/i }));

    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    const [id, data] = vi.mocked(value.createApartment).mock.calls[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data).toEqual(expect.objectContaining({ name: "Manual Flat", rentChf: 1800, pdf: null }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/apartments/${id}`));
  });

  it("shows an error when the store rejects the save", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockRejectedValue(new Error("Duplicate id"));
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    await user.type(screen.getByLabelText(/^Name/i), "Manual Flat");
    await user.click(screen.getByRole("button", { name: /^Save apartment$/i }));
    expect(await screen.findByText("Failed to save apartment")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("cancel returns to the drop zone", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<UploadPage />);
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.getByRole("button", { name: /Or add manually without PDF/i })).toBeInTheDocument();
  });
});

describe("drop zone validation", () => {
  it("rejects non-PDF files", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }));
    // jsdom honours the input's accept filter when it can; either the file
    // is dropped before reaching the page or the page rejects it.
    await waitFor(() =>
      expect(
        screen.queryByText("No PDF files selected") ??
          screen.getByRole("button", { name: /Or add manually without PDF/i })
      ).toBeInTheDocument()
    );
    expect(parsePdf).not.toHaveBeenCalled();
  });
});

describe("batch review flow", () => {
  it("parses and encrypt-uploads each PDF concurrently, then saves all through the store", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />, {
      dataKey: null,
      identity: { userId: "u-me", householdId: 7, userName: "Me" },
    });
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );

    await uploadFiles(user, [makePdfFile("a.pdf"), makePdfFile("b.pdf")]);

    expect(await screen.findByText("Parsed a.pdf")).toBeInTheDocument();
    expect(screen.getByText("Parsed b.pdf")).toBeInTheDocument();
    expect(parsePdf).toHaveBeenCalledTimes(2);
    expect(encryptAndUploadPdf).toHaveBeenCalledTimes(2);
    // Upload is keyed by the item id, which is also the apartment id.
    const [, householdId, uploadedId] = vi.mocked(encryptAndUploadPdf).mock.calls[0];
    expect(householdId).toBe(7);
    expect(uploadedId).toMatch(/^[0-9a-f-]{36}$/);

    await user.click(screen.getByRole("button", { name: /Save all 2/i }));
    await waitFor(() => expect(screen.getAllByText("Saved")).toHaveLength(2));
    expect(value.createApartment).toHaveBeenCalledTimes(2);
    const [savedId, savedData] = vi.mocked(value.createApartment).mock.calls[0];
    expect(savedId).toBe(uploadedId);
    expect(savedData).toEqual(
      expect.objectContaining({ name: "Parsed a.pdf", rentChf: 1500, pdf: PDF })
    );
    expect(savedData.rawExtractedData).toEqual({ name: "Parsed a.pdf", rentChf: 1500 });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/apartments"));
  });

  it("saves with pdf: null and shows a warning when the upload fails", async () => {
    const user = userEvent.setup();
    vi.mocked(encryptAndUploadPdf).mockRejectedValue(new Error("Blob down"));
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );

    await uploadFiles(user, [makePdfFile("a.pdf")]);
    expect(await screen.findByText("Parsed a.pdf")).toBeInTheDocument();
    expect(screen.getByText(/PDF could not be stored/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].pdf).toBeNull();
  });

  it("marks an item 'Failed to save' when the store rejects it and does not redirect", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockRejectedValue(new Error("Stale version"));

    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await screen.findByText("Parsed a.pdf");
    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    expect(await screen.findByText("Failed to save")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("'Upload more' returns to the drop zone and a discarded item is skipped on save", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );
    await uploadFiles(user, [makePdfFile("a.pdf"), makePdfFile("b.pdf")]);
    await screen.findByText("Parsed b.pdf");

    // Discard b (the ✕ buttons are in card order).
    const discardButtons = screen.getAllByRole("button", { name: "✕" });
    await user.click(discardButtons[1]);
    expect(screen.queryByText("Parsed b.pdf")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].name).toBe("Parsed a.pdf");
  });

  it("expanding a card shows its editable fields and edits flow into the saved data", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );
    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await user.click(await screen.findByText("Parsed a.pdf"));
    const name = screen.getByLabelText(/^Name/i);
    await user.clear(name);
    await user.type(name, "Renamed");
    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].name).toBe("Renamed");
  });
});

describe("Save all guard", () => {
  it("shows 'No apartments to save' when every parsed item has an empty name", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockResolvedValue({ extracted: { name: "" }, aiAvailable: true });
    const { value } = renderWithHouseholdData(<UploadPage />);
    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await waitFor(() => expect(screen.getByText("Parsed")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText("No apartments to save")).toBeInTheDocument();
    expect(value.createApartment).not.toHaveBeenCalled();
  });
});
```

Before running, open the current `full-flow.test.tsx` and carry over any label/role query that differs from the ones used here (e.g. the exact discard button text, the "Upload more" button, the "Save all N" vs "Save apartment" wording, and how a card is expanded). The intent is the same coverage against the new data path — the queries must match the existing components, which this task does not restyle.

- [ ] **Step 7: Rewrite the retry test**

Replace `src/app/apartments/new/__tests__/retry.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/household-data/process-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/household-data/process-client")>()),
  parsePdf: vi.fn(),
}));
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));

import UploadPage from "../page";
import { parsePdf, ParsePdfError } from "@/components/household-data/process-client";
import { encryptAndUploadPdf } from "@/components/household-data/pdf-files";

function makePdfFile(name = "listing.pdf"): File {
  return new File([new Blob(["%PDF-1.4\n"], { type: "application/pdf" })], name, {
    type: "application/pdf",
  });
}

async function dropPdf(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);
}

beforeEach(() => {
  vi.mocked(encryptAndUploadPdf).mockResolvedValue({ path: "/p", iv: null });
});

afterEach(() => cleanup());

describe("upload retry", () => {
  it("shows the quota message with retry-after and a Retry button", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockRejectedValueOnce(
      new ParsePdfError("AI quota exhausted", "quota", 429, 30)
    );
    renderWithHouseholdData(<UploadPage />);
    await dropPdf(user, makePdfFile());
    expect(await screen.findByText(/AI quota exhausted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("shows the invalid-PDF message with a Retry button", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockRejectedValueOnce(
      new ParsePdfError("Could not read this PDF", "invalid_pdf", 400)
    );
    renderWithHouseholdData(<UploadPage />);
    await dropPdf(user, makePdfFile());
    expect(await screen.findByText(/Could not read this PDF/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("maps a non-ParsePdfError failure to reason 'unknown' and still offers Retry", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockRejectedValueOnce(new Error("network down"));
    renderWithHouseholdData(<UploadPage />);
    await dropPdf(user, makePdfFile());
    expect(await screen.findByText(/network down/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("re-runs parse and upload on Retry and transitions to done", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf)
      .mockRejectedValueOnce(new ParsePdfError("AI quota exhausted", "quota", 429, 5))
      .mockResolvedValueOnce({ extracted: { name: "Parsed Apartment" }, aiAvailable: true });
    renderWithHouseholdData(<UploadPage />);
    await dropPdf(user, makePdfFile());
    await user.click(await screen.findByRole("button", { name: /Retry/i }));
    expect(await screen.findByText("Parsed Apartment")).toBeInTheDocument();
    expect(parsePdf).toHaveBeenCalledTimes(2);
    expect(encryptAndUploadPdf).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Retry/i })).toBeNull());
  });
});
```

Then `git rm src/app/apartments/new/__tests__/blob-upload.test.tsx`.

- [ ] **Step 8: Run both tests to see them fail**

Run: `npx vitest run src/app/apartments/new`
Expected: FAIL — the page still calls `uploadAndParsePdf` / `fetch("/api/apartments")`.

- [ ] **Step 9: Rewrite `src/app/apartments/new/page.tsx`**

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ApartmentForm,
  apartmentFromForm,
  emptyApartmentForm,
  formFromExtracted,
} from "@/components/apartment-form-fields";
import { type ErrorDetails, errorDetailsFromException } from "@/lib/fetch-error";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { parsePdf, ParsePdfError } from "@/components/household-data/process-client";
import { encryptAndUploadPdf } from "@/components/household-data/pdf-files";
import { newRowId } from "@/lib/household-data/ids";
import { UploadStep } from "./_components/upload-step";
import { ReviewStep } from "./_components/review-step";
import { SingleEntryStep } from "./_components/single-entry-step";
import { StatusBadge } from "./_components/status-badge";
import type { UploadItem } from "./_components/types";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

const PDF_STORE_WARNING =
  "PDF could not be stored — the apartment will be saved without it";

export default function UploadPage() {
  const router = useRouter();
  const { createApartment, dataKey, identity } = useHouseholdData();
  // "upload" = drop zone, "processing" = batch in progress, "review" = edit & save, "single" = manual entry
  const [step, setStep] = useState<"upload" | "processing" | "review" | "single">("upload");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [singleForm, setSingleForm] = useState<ApartmentForm>(emptyApartmentForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const processingRef = useRef(false);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateItemForm(id: string, field: keyof ApartmentForm, value: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, form: { ...item.form, [field]: value } } : item
      )
    );
  }

  function updateItemWashingMachine(id: string, value: boolean | null) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, form: { ...item.form, hasWashingMachine: value } } : item
      )
    );
  }

  function discardItem(id: string) {
    fileMapRef.current.delete(id);
    updateItem(id, { discarded: true });
  }

  // Parse (blind proxy) and encrypt+upload run concurrently on the same
  // bytes. The item id is the future apartment id, so the file lands at its
  // final path before the row exists.
  async function parseOne(itemId: string, file: File) {
    updateItem(itemId, { status: "uploading", error: undefined, errorReason: undefined, errorRetryAfterSeconds: undefined, pdfWarning: undefined });
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      updateItem(itemId, {
        status: "error",
        error: err instanceof Error ? err.message : "Could not read file",
        errorReason: "unknown",
      });
      return;
    }

    const [parsed, uploaded] = await Promise.allSettled([
      parsePdf(bytes, file.name),
      encryptAndUploadPdf(dataKey, identity.householdId, itemId, bytes),
    ]);

    if (parsed.status === "rejected") {
      const err: unknown = parsed.reason;
      const known = err instanceof ParsePdfError ? err : null;
      updateItem(itemId, {
        status: "error",
        error: err instanceof Error ? err.message : "Parsing failed",
        errorReason: known?.reason ?? "unknown",
        errorRetryAfterSeconds: known?.retryAfterSeconds,
      });
      return;
    }

    updateItem(itemId, {
      status: "done",
      form: formFromExtracted(parsed.value.extracted),
      pdf: uploaded.status === "fulfilled" ? uploaded.value : null,
      pdfWarning: uploaded.status === "rejected" ? PDF_STORE_WARNING : undefined,
    });
  }

  async function retryItem(itemId: string) {
    const file = fileMapRef.current.get(itemId);
    if (!file) {
      updateItem(itemId, {
        status: "error",
        error: "File reference lost — please re-upload",
        errorReason: "unknown",
        errorRetryAfterSeconds: undefined,
      });
      return;
    }
    await parseOne(itemId, file);
  }

  const processFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      setError({ headline: "No PDF files selected" });
      return;
    }

    const newItems: UploadItem[] = pdfFiles.map((file) => ({
      id: newRowId(),
      fileName: file.name,
      status: "queued" as const,
      form: emptyApartmentForm,
      pdf: null,
      expanded: false,
      saved: false,
      discarded: false,
    }));
    pdfFiles.forEach((file, i) => fileMapRef.current.set(newItems[i].id, file));

    setItems(newItems);
    setStep("processing");
    setError(null);
    processingRef.current = true;

    // Sequential across files: each file already runs two requests.
    for (let i = 0; i < pdfFiles.length; i++) {
      if (!processingRef.current) break;
      await parseOne(newItems[i].id, pdfFiles[i]);
    }

    setStep("review");
    // parseOne reads dataKey/identity from the closure; both are stable for
    // the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      void processFiles(Array.from(fileList));
    },
    [processFiles]
  );

  async function handleSaveAll() {
    const toSave = items.filter(
      (item) => item.status === "done" && !item.saved && !item.discarded && item.form.name.trim()
    );
    if (toSave.length === 0) {
      setError({ headline: "No apartments to save" });
      return;
    }

    setSaving(true);
    setError(null);

    for (const item of toSave) {
      try {
        await createApartment(item.id, apartmentFromForm(item.form, item.pdf));
        fileMapRef.current.delete(item.id);
        updateItem(item.id, { saved: true });
      } catch {
        updateItem(item.id, { status: "error", error: "Failed to save" });
      }
    }

    setSaving(false);

    // If all saved, redirect to list
    setItems((prev) => {
      const allDone = prev.every((i) => i.saved || i.discarded || i.status === "error");
      if (allDone) {
        setTimeout(() => router.push("/apartments"), 500);
      }
      return prev;
    });
  }

  async function handleSaveSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!singleForm.name.trim()) {
      setError({ headline: "Name is required" });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createApartment(newRowId(), apartmentFromForm(singleForm, null));
      router.push(`/apartments/${created.id}`);
    } catch (err) {
      setError({
        headline: "Failed to save apartment",
        details: errorDetailsFromException(err),
      });
      setSaving(false);
    }
  }

  if (step === "upload") {
    return (
      <UploadStep
        onFiles={handleFiles}
        onManualEntry={() => {
          setSingleForm(emptyApartmentForm);
          setStep("single");
        }}
        error={error}
      />
    );
  }

  if (step === "processing") {
    const doneCount = items.filter((i) => i.status === "done" || i.status === "error").length;
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">
          Processing ({doneCount}/{items.length})
        </h1>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <span className="truncate text-sm">{item.fileName}</span>
              <StatusBadge status={item.status} error={item.error} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <ReviewStep
        items={items}
        saving={saving}
        error={error}
        onSaveAll={handleSaveAll}
        onUploadMore={() => {
          processingRef.current = false;
          setStep("upload");
          setError(null);
        }}
        onRetry={retryItem}
        onUpdateItem={updateItem}
        onUpdateForm={updateItemForm}
        onUpdateWashingMachine={updateItemWashingMachine}
        onDiscard={discardItem}
      />
    );
  }

  return (
    <SingleEntryStep
      form={singleForm}
      saving={saving}
      error={error}
      onSubmit={handleSaveSingle}
      onChange={(field, value) => setSingleForm((f) => ({ ...f, [field]: value }))}
      onWashingMachineChange={(v) => setSingleForm((f) => ({ ...f, hasWashingMachine: v }))}
      onCancel={() => {
        setStep("upload");
        setError(null);
      }}
    />
  );
}
```

The `processing`/`review`/`single` JSX above mirrors the current file — diff against it and keep any prop or handler the current file passes that is not listed here (the step components are not changed by this task).

- [ ] **Step 10: Run the upload page tests**

Run: `npx vitest run src/app/apartments/new src/components/__tests__/apartment-form-fields.test.tsx`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/fetch-error.ts src/lib/__tests__/fetch-error.test.ts src/components/apartment-form-fields.tsx src/components/__tests__/apartment-form-fields.test.tsx src/app/apartments/new
git commit -m "feat(upload): parse and encrypt PDFs in the browser, save through the store

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 14: Detail page — row from the store, Leaflet pin, View PDF / Reprocess through `openBytes`, edit + rating + delete through the store

**Files:**
- Modify: `src/lib/edited-fields.ts` + `src/lib/__tests__/edited-fields.test.ts` (typed `diffInferableFields`; add `mergeUserEdit`, `applyExtraction`)
- Create: `src/components/apartment-location-map.tsx`, `src/components/apartment-location-map-inner.tsx`, `src/components/__tests__/apartment-location-map.test.tsx`
- Modify: `src/components/apartment-rating-panel.tsx` (`OtherRatingPanel` prop drops `id`)
- Modify: `src/app/apartments/[id]/_components/types.ts`, `apartment-pager-nav.tsx`, `apartment-actions.tsx`, `apartment-metric-badges.tsx`, `distance-section.tsx`, `__tests__/distance-section.test.tsx`
- Rewrite: `src/app/apartments/[id]/page.tsx`
- Rewrite tests: `src/app/apartments/[id]/__tests__/edit-flow.test.tsx`, `error-states.test.tsx`, `pager.test.tsx`, `rating-cancel.test.tsx`, `reprocess.test.tsx`; create `__tests__/view-pdf.test.tsx`

**Interfaces:**
- Consumes: `useHouseholdData()` (Task 11) → `status`, `error`, `apartments`, `locations`, `identity`, `dataKey`, `updateApartment`, `deleteApartment`, `rateApartment`; `useApartmentPager(currentId: string)` (Task 12); `downloadPdf(dataKey, householdId, apartmentId, pdf)` (Task 10); `parsePdf` (Task 11); `formFromApartment`, `formToFields`, `type ApartmentForm` (Task 13); `errorDetailsFromException` (Task 13); `Apartment`, `ApartmentView`, `ApartmentDistance`, `LocationView`, `Rating` from `@/lib/household-data/types` (Task 4).
- Produces:
  - `src/lib/edited-fields.ts`: `type InferableField`, `type InferableFields = Pick<Apartment, InferableField>` (structurally identical to Task 13's `ApartmentFieldValues`); `diffInferableFields(current: Partial<InferableFields>, incoming: Partial<InferableFields>): InferableField[]`; `mergeUserEdit(current: Apartment, incoming: InferableFields): Apartment` (applies the edit and extends `userEditedFields` with the fields that changed); `applyExtraction(current: Apartment, incoming: InferableFields, raw: Record<string, unknown>): Apartment` (overwrites every inferable field **not** in `userEditedFields`, sets `rawExtractedData: raw`).
  - `ApartmentLocationMap({ latitude, longitude, label }: { latitude: number | null; longitude: number | null; label: string })` renders nothing when either coordinate is null; `apartment-location-map-inner.tsx` default-exports the Leaflet map (`{ latitude: number; longitude: number; label: string }`).
  - `LocationLite = Pick<LocationView, "id" | "label" | "icon" | "address">` from `./_components/types` (the detail page passes the store's `LocationView[]` straight in; Task 15's compare page uses `LocationView` directly).
  - `ApartmentActions` props: `{ hasPdf: boolean; listingUrl: string | null; editing; reprocessing; deleting; onEdit; onViewPdf; onReprocess; onDelete }`.

Spec: "`apartments/[id]` finds its row in the cache and renders the existing not-found UI if absent", "View PDF fetches, `openBytes`, and opens a `blob:` URL in a new tab", "Reprocess decrypts and POSTs the plaintext to `/api/process/parse-pdf`, then updates the apartment through the store", "the edit form calls `updateApartment` with a mutator built from the form diff (`diffInferableFields` keeps working on plaintext)". Address changes are re-geocoded by the store (`planEnrichment` in `updateApartment`), so the page never calls a process endpoint other than `parsePdf`.

- [ ] **Step 1: Test `mergeUserEdit` and `applyExtraction`**

Append to `src/lib/__tests__/edited-fields.test.ts` (extend the import to include `mergeUserEdit`, `applyExtraction`, and add `import { emptyApartment } from "@/lib/household-data/types";`):

```ts
describe("mergeUserEdit", () => {
  it("applies the edit and records only the fields that changed", () => {
    const current = { ...emptyApartment("X"), rentChf: 1500, userEditedFields: ["summary"] };
    const next = mergeUserEdit(current, {
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: true,
      rentChf: 1600,
      listingUrl: null,
      summary: null,
      availableFrom: null,
    });
    expect(next.rentChf).toBe(1600);
    expect(next.hasWashingMachine).toBe(true);
    expect(next.userEditedFields.sort()).toEqual(["hasWashingMachine", "rentChf", "summary"]);
    // Non-inferable state is carried over untouched.
    expect(next.userEditedFields).not.toContain("distances");
    expect(next.pdf).toBeNull();
  });

  it("does not duplicate a field already marked as edited", () => {
    const current = { ...emptyApartment("X"), userEditedFields: ["name"] };
    const next = mergeUserEdit(current, { ...current, name: "Y" });
    expect(next.userEditedFields).toEqual(["name"]);
  });
});

describe("applyExtraction", () => {
  it("overwrites inferable fields the user has not edited and keeps the edited ones", () => {
    const current = {
      ...emptyApartment("Old name"),
      rentChf: 1500,
      summary: "my own words",
      userEditedFields: ["summary"],
    };
    const raw = { name: "New name", rentChf: 1700, summary: "AI words" };
    const next = applyExtraction(
      current,
      { ...current, name: "New name", rentChf: 1700, summary: "AI words" },
      raw
    );
    expect(next.name).toBe("New name");
    expect(next.rentChf).toBe(1700);
    expect(next.summary).toBe("my own words");
    expect(next.rawExtractedData).toEqual(raw);
    expect(next.userEditedFields).toEqual(["summary"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/__tests__/edited-fields.test.ts`
Expected: FAIL — `mergeUserEdit` / `applyExtraction` not exported.

- [ ] **Step 3: Extend `src/lib/edited-fields.ts`**

Replace the file:

```ts
import type { Apartment } from "@/lib/household-data/types";

export const INFERABLE_FIELDS = [
  "name",
  "address",
  "sizeM2",
  "numRooms",
  "numBathrooms",
  "numBalconies",
  "hasWashingMachine",
  "rentChf",
  "listingUrl",
  "summary",
  "availableFrom",
] as const;

export type InferableField = (typeof INFERABLE_FIELDS)[number];
export type InferableFields = Pick<Apartment, InferableField>;

export function diffInferableFields(
  current: Partial<InferableFields>,
  incoming: Partial<InferableFields>
): InferableField[] {
  const changed: InferableField[] = [];
  for (const field of INFERABLE_FIELDS) {
    if (current[field] !== incoming[field]) changed.push(field);
  }
  return changed;
}

// A user edit: apply the fields and remember which inferable ones changed,
// so a later reprocess leaves them alone.
export function mergeUserEdit(current: Apartment, incoming: InferableFields): Apartment {
  const next: Apartment = { ...current, ...incoming };
  const changed = diffInferableFields(current, next);
  return {
    ...next,
    userEditedFields: Array.from(new Set([...current.userEditedFields, ...changed])),
  };
}

// A reprocess: refresh every inferable field the user has not edited from a
// fresh extraction, and keep the raw extraction for reference.
export function applyExtraction(
  current: Apartment,
  incoming: InferableFields,
  raw: Record<string, unknown>
): Apartment {
  const edited = new Set(current.userEditedFields);
  const next: Apartment = { ...current, rawExtractedData: raw };
  for (const field of INFERABLE_FIELDS) {
    if (edited.has(field)) continue;
    (next as Record<InferableField, unknown>)[field] = incoming[field];
  }
  return next;
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/__tests__/edited-fields.test.ts`
Expected: PASS (the pre-existing `diffInferableFields` tests pass unchanged: their fixtures are plain object literals, assignable to `Partial<InferableFields>` — if one holds a non-inferable key like `distanceBikeMin`, cast it `as Partial<InferableFields>`).

- [ ] **Step 5: Test the single-pin map wrapper**

Create `src/components/__tests__/apartment-location-map.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../apartment-location-map-inner", () => ({
  default: ({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) => (
    <div data-testid="leaflet-pin">
      {label} @ {latitude},{longitude}
    </div>
  ),
}));

import { ApartmentLocationMap } from "../apartment-location-map";

afterEach(() => cleanup());

describe("ApartmentLocationMap", () => {
  it("renders nothing when a coordinate is missing", () => {
    const { container } = render(
      <ApartmentLocationMap latitude={null} longitude={8.5} label="Sonnenweg 3" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Leaflet pin when both coordinates are present", async () => {
    render(<ApartmentLocationMap latitude={47.37} longitude={8.54} label="Sonnenweg 3" />);
    expect(await screen.findByTestId("leaflet-pin")).toHaveTextContent("Sonnenweg 3 @ 47.37,8.54");
  });
});
```

- [ ] **Step 6: Create the map components**

`src/components/apartment-location-map.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";

const LeafletPin = dynamic(() => import("./apartment-location-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

// Replaces the Google Maps Embed iframe: under E3 the server never sees an
// address, so the pin is drawn from the coordinates the client geocoded.
export function ApartmentLocationMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number | null;
  longitude: number | null;
  label: string;
}) {
  if (latitude === null || longitude === null) return null;
  return (
    <div className="overflow-hidden rounded-lg border">
      <LeafletPin latitude={latitude} longitude={longitude} label={label} />
    </div>
  );
}
```

`src/components/apartment-location-map-inner.tsx`:

```tsx
"use client";

import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const PIN_ICON = L.divIcon({
  className: "flatpare-pin",
  html: `<svg viewBox="0 0 24 24" width="28" height="28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8z" fill="#2563eb" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="10" r="3" fill="white"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  tooltipAnchor: [0, -28],
});

export default function ApartmentLocationMapInner({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  return (
    <div className="h-[260px] w-full">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]} icon={PIN_ICON}>
          <Tooltip direction="top" offset={[0, -4]} permanent className="flatpare-marker-label">
            {label}
          </Tooltip>
        </Marker>
      </MapContainer>
    </div>
  );
}
```

Run: `npx vitest run src/components/__tests__/apartment-location-map.test.tsx` — expected PASS.

- [ ] **Step 7: Sub-components on the new types**

`src/app/apartments/[id]/_components/types.ts` (whole file):

```ts
import type { LocationView } from "@/lib/household-data/types";

// The detail page reads ApartmentView / RatingView straight from the store;
// only the location subset the distance section needs is named here.
export type LocationLite = Pick<LocationView, "id" | "label" | "icon" | "address">;
```

`apartment-pager-nav.tsx`: change the three id props to strings —

```ts
interface PagerNavProps {
  prevId: string | null;
  nextId: string | null;
  position: number | null;
  total: number;
  onNavigate: (id: string) => void;
}
```

`apartment-metric-badges.tsx`: replace the `ApartmentDetail` import with `import type { Apartment } from "@/lib/household-data/types";` and the prop type with `apartment: Apartment`. The JSX is unchanged.

`distance-section.tsx`: replace the `distances` prop with `distances: Record<string, ApartmentDistance>` (`import type { ApartmentDistance } from "@/lib/household-data/types";`), delete the `distancesByLoc` map, and read `const d = distances[loc.id];`. Everything else is unchanged.

`src/components/apartment-rating-panel.tsx`: in `OtherRatingPanel`, remove `id: number;` from the `rating` prop type (the store's `RatingView` has no row id; the caller keys on `userId`).

`apartment-actions.tsx` (whole file):

```tsx
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ApartmentActionsProps {
  hasPdf: boolean;
  listingUrl: string | null;
  editing: boolean;
  reprocessing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onViewPdf: () => void;
  onReprocess: () => void;
  onDelete: () => void;
}

export function ApartmentActions({
  hasPdf,
  listingUrl,
  editing,
  reprocessing,
  deleting,
  onEdit,
  onViewPdf,
  onReprocess,
  onDelete,
}: ApartmentActionsProps) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      {hasPdf && (
        // A button, not a link: the stored file is ciphertext, so the page
        // decrypts it and opens a blob: URL.
        <Button
          variant="outline"
          size="sm"
          onClick={onViewPdf}
          className="h-11 w-full sm:h-7 sm:w-auto"
        >
          View PDF
        </Button>
      )}
      {listingUrl ? (
        <a
          href={listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-11 w-full sm:h-7 sm:w-auto"
          )}
        >
          Original Listing
        </a>
      ) : (
        <Badge
          variant="secondary"
          className="w-full justify-center text-muted-foreground sm:w-auto sm:justify-start"
        >
          URL missing
        </Badge>
      )}
      {!editing && (
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="h-11 w-full sm:h-7 sm:w-auto"
        >
          Edit
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={reprocessing || editing || !hasPdf}
        onClick={onReprocess}
        className="h-11 w-full sm:h-7 sm:w-auto"
      >
        {reprocessing ? "Reprocessing..." : "Reprocess"}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={deleting || editing}
        onClick={onDelete}
        className="h-11 w-full sm:h-7 sm:w-auto"
      >
        {deleting ? "Deleting..." : "Delete"}
      </Button>
    </div>
  );
}
```

Update `src/app/apartments/[id]/_components/__tests__/distance-section.test.tsx`: `locations` ids become `"loc-1"` / `"loc-2"`, and every `distances={[{ locationId: 1, bikeMin, transitMin }, …]}` becomes `distances={{ "loc-1": { bikeMin, transitMin }, … }}`; `distances={[]}` becomes `distances={{}}`. The assertions do not change.

Run: `npx vitest run "src/app/apartments/[id]/_components"` — expected PASS.

- [ ] **Step 8: Rewrite the detail-page tests on the store**

All five tests share this preamble — put it in each file verbatim (each file is standalone; do not create a shared module for it beyond `fake-household-data.tsx`):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
  makeLocationView,
} from "@/components/household-data/__tests__/fake-household-data";

const push = vi.fn();
let currentParamsId = "a1";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: currentParamsId }),
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/components/apartment-location-map", () => ({
  ApartmentLocationMap: ({ label }: { label: string }) => <div data-testid="pin-map">{label}</div>,
}));
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));
vi.mock("@/components/household-data/process-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/household-data/process-client")>()),
  parsePdf: vi.fn(),
}));

import ApartmentDetailPage from "../page";

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});
```

`edit-flow.test.tsx` (after the preamble):

```tsx
const A1 = makeApartmentView({
  id: "a1",
  name: "Sonnenweg 3",
  address: "Sonnenweg 3, 8001 Zurich",
  sizeM2: 60,
  numRooms: 2.5,
  numBathrooms: 1,
  numBalconies: 1,
  hasWashingMachine: null,
  rentChf: 2200,
  summary: "Quiet 2.5-room flat in a leafy district near transit.",
  availableFrom: "2026-05-01",
  userEditedFields: ["summary"],
});

function setup() {
  currentParamsId = "a1";
  const rendered = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
  // Apply the mutator to the fixture and return the resulting view, the way
  // the real store does.
  vi.mocked(rendered.value.updateApartment).mockImplementation(async (id, mutate) =>
    makeApartmentView({ ...mutate(A1), id })
  );
  return rendered;
}

describe("Apartment detail edit flow", () => {
  it("opens the edit form, saves through updateApartment and records the changed fields", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    expect(screen.getByText(/CHF 2,200/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    const rentInput = screen.getByLabelText(/Rent/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Sonnenweg 3");
    expect(rentInput.value).toBe("2200");

    await user.clear(nameInput);
    await user.type(nameInput, "Sonnenweg 3b");
    await user.clear(rentInput);
    await user.type(rentInput, "2400");
    await user.click(screen.getByRole("button", { name: /^Yes$/ }));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    const [id, mutate] = vi.mocked(value.updateApartment).mock.calls[0];
    expect(id).toBe("a1");
    const next = mutate(A1);
    expect(next.name).toBe("Sonnenweg 3b");
    expect(next.rentChf).toBe(2400);
    expect(next.hasWashingMachine).toBe(true);
    expect(next.userEditedFields.sort()).toEqual(["hasWashingMachine", "name", "rentChf", "summary"]);
    // Edit form closed again.
    await waitFor(() => expect(screen.queryByLabelText(/Rent/i)).toBeNull());
  }, 10000);

  it("Cancel discards edits and returns to read-only view", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Something else");
    const cancels = screen.getAllByRole("button", { name: /^Cancel$/ });
    await user.click(cancels.find((b) => !(b as HTMLButtonElement).disabled)!);
    expect(value.updateApartment).not.toHaveBeenCalled();
    expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
  });

  it("disables Delete while editing and re-enables it after Cancel", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole("button", { name: /Delete/i })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    expect(screen.getByRole("button", { name: /Delete/i })).toBeDisabled();
    const cancels = screen.getAllByRole("button", { name: /^Cancel$/ });
    await user.click(cancels.find((b) => !(b as HTMLButtonElement).disabled)!);
    expect(screen.getByRole("button", { name: /Delete/i })).not.toBeDisabled();
  });

  it("requires a name", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    await user.clear(screen.getByLabelText(/Name/i));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(value.updateApartment).not.toHaveBeenCalled();
  });

  it("shows an error and stays in edit mode when the store rejects the save", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.updateApartment).mockRejectedValue(new Error("Stale version"));
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText(/Couldn't save changes/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rent/i)).toBeInTheDocument();
  });

  it("displays availableFrom in Swiss format and the summary card", () => {
    setup();
    expect(screen.getByText(/01\.05\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/Quiet 2.5-room flat in a leafy district/)).toBeInTheDocument();
  });

  it("round-trips summary and availableFrom through the edit form", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    const summaryField = screen.getByLabelText(/Summary/i) as HTMLTextAreaElement;
    expect(summaryField.value).toBe("Quiet 2.5-room flat in a leafy district near transit.");
    await user.clear(summaryField);
    await user.type(summaryField, "Updated description after edit.");
    const dateInput = screen.getByLabelText(/Available from/i) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-05-01");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-07-15");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    const next = vi.mocked(value.updateApartment).mock.calls[0][1](A1);
    expect(next.summary).toBe("Updated description after edit.");
    expect(next.availableFrom).toBe("2026-07-15");
  }, 10000);
});
```

`error-states.test.tsx`:

```tsx
const A1 = makeApartmentView({ id: "a1", name: "Sonnenweg 3", address: "Sonnenweg 3, 8001 Zurich" });

describe("Apartment detail — loading, not-found and error states", () => {
  it("renders the loading placeholder while the store is loading", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, { status: "loading", apartments: [] });
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it("renders ErrorDisplay when the store failed to load", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      status: "error",
      error: "Failed to load household data",
      apartments: [],
    });
    expect(screen.getByText(/Failed to load household data/)).toBeInTheDocument();
  });

  it("renders the not-found message when the id is not in the store", () => {
    currentParamsId = "nope";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
    expect(screen.getByText(/Apartment not found/)).toBeInTheDocument();
  });

  it("renders the corrupt placeholder with a delete action for a corrupt row", async () => {
    currentParamsId = "a1";
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ id: "a1", corrupt: true })],
    });
    expect(screen.getByText(/could not be decrypted/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(value.deleteApartment).toHaveBeenCalledWith("a1"));
    expect(push).toHaveBeenCalledWith("/apartments");
  });

  it("surfaces an error when delete fails", async () => {
    currentParamsId = "a1";
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
    vi.mocked(value.deleteApartment).mockRejectedValue(new Error("boom"));
    await userEvent.setup().click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(await screen.findByText(/Couldn't delete apartment/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("aborts delete when the user cancels confirm()", async () => {
    currentParamsId = "a1";
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
    await userEvent.setup().click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(value.deleteApartment).not.toHaveBeenCalled();
  });

  it("deletes through the store and redirects to the list", async () => {
    currentParamsId = "a1";
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
    await userEvent.setup().click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(value.deleteApartment).toHaveBeenCalledWith("a1"));
    expect(push).toHaveBeenCalledWith("/apartments");
  });

  it("renders the pin map from stored coordinates and the distance section from the store's locations", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [
        makeApartmentView({
          id: "a1",
          name: "Sonnenweg 3",
          latitude: 47.37,
          longitude: 8.54,
          distances: { "loc-1": { bikeMin: 12, transitMin: 25 } },
        }),
      ],
      locations: [makeLocationView({ id: "loc-1", label: "Work", icon: "Briefcase", address: "Zurich HQ" })],
    });
    expect(screen.getByTestId("pin-map")).toHaveTextContent("Sonnenweg 3");
    expect(screen.getByText(/12 min bike.*25 min transit/)).toBeInTheDocument();
  });
});
```

`pager.test.tsx` (the persisted sort is `createdAt desc`; ids are strings):

```tsx
const LIST = [
  makeApartmentView({ id: "a1", name: "Sonnenweg 3", createdAt: "2026-01-15T10:00:00Z" }),
  makeApartmentView({ id: "a2", name: "Bergstrasse 12", createdAt: "2026-03-20T10:00:00Z" }),
  makeApartmentView({ id: "a3", name: "Seeblick 7", createdAt: "2026-02-10T10:00:00Z" }),
];

beforeEach(() => localStorage.clear());

describe("Apartment detail page — pager", () => {
  it("renders position and enabled buttons for a middle apartment", () => {
    currentParamsId = "a3"; // Seeblick — middle under createdAt desc
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  it("clicking Next navigates to nextId", async () => {
    currentParamsId = "a3";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    await userEvent.setup().click(screen.getByRole("button", { name: /Next/i }));
    expect(push).toHaveBeenCalledWith("/apartments/a1");
  });

  it("disables Previous on the first apartment", () => {
    currentParamsId = "a2";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
  });

  it("disables Next on the last apartment", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("follows the persisted sort field", () => {
    localStorage.setItem("flatpare-apartment-sort-field", "name" as string);
    // "name" is not a sort field → falls back to createdAt; use rentChf asc.
    localStorage.setItem("flatpare-apartment-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartment-sort-direction", "asc");
    currentParamsId = "a2";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [
        makeApartmentView({ ...LIST[0], rentChf: 2200 }),
        makeApartmentView({ ...LIST[1], rentChf: 1800 }),
        makeApartmentView({ ...LIST[2], rentChf: 3000 }),
      ],
    });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });
});
```

Before running, check the two localStorage keys against `SORT_FIELD_STORAGE_KEY` / `SORT_DIRECTION_STORAGE_KEY` in `src/lib/apartment-sort.ts` and use those exact strings (delete the throwaway `"name"` line — it is there only to show that unknown values fall back; keep the test to the `rentChf` case).

`rating-cancel.test.tsx`:

```tsx
const ALICE = { userId: "u-me", userName: "Me", updatedAt: "2026-01-02T00:00:00.000Z" };
const A1 = makeApartmentView({
  id: "a1",
  name: "Test Flat",
  ratings: [
    { ...ALICE, kitchen: 3, balconies: 3, location: 3, floorplan: 3, overallFeeling: 3, comment: "saved text" },
    { userId: "u-bob", userName: "Bob", updatedAt: "2026-01-03T00:00:00.000Z", kitchen: 5, balconies: 4, location: 4, floorplan: 4, overallFeeling: 5, comment: "Bob's view" },
  ],
});

function setup() {
  currentParamsId = "a1";
  return renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
}

describe("Rating panel", () => {
  it("prefills my rating from the store and lists the other member's panel", () => {
    setup();
    expect(screen.getByText(/Your Rating \(Me\)/)).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/Notes about this apartment/i) as HTMLTextAreaElement).value).toBe("saved text");
    expect(screen.getByText(/Bob’s Rating/)).toBeInTheDocument();
    expect(screen.getByText("Bob's view")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Rating/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeDisabled();
  });

  it("Cancel reverts an unsaved comment change and re-disables both buttons", async () => {
    const user = userEvent.setup();
    setup();
    const comment = screen.getByPlaceholderText(/Notes about this apartment/i) as HTMLTextAreaElement;
    await user.clear(comment);
    await user.type(comment, "edited but not saved");
    expect(screen.getByRole("button", { name: /Save Rating/ })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(comment.value).toBe("saved text");
    expect(screen.getByRole("button", { name: /Save Rating/ })).toBeDisabled();
  });

  it("Save Rating calls rateApartment with the draft and redirects to /apartments", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    const comment = screen.getByPlaceholderText(/Notes about this apartment/i);
    await user.clear(comment);
    await user.type(comment, "new comment");
    await user.click(screen.getByRole("button", { name: /Save Rating/ }));
    await waitFor(() => expect(value.rateApartment).toHaveBeenCalledTimes(1));
    expect(value.rateApartment).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ overallFeeling: 3, comment: "new comment" })
    );
    expect(push).toHaveBeenCalledWith("/apartments");
  });

  it("shows an error when rateApartment rejects", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.rateApartment).mockRejectedValue(new Error("boom"));
    await user.type(screen.getByPlaceholderText(/Notes about this apartment/i), "!");
    await user.click(screen.getByRole("button", { name: /Save Rating/ }));
    expect(await screen.findByText(/Couldn't save rating/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
```

`reprocess.test.tsx`:

```tsx
import { downloadPdf } from "@/components/household-data/pdf-files";
import { parsePdf, ParsePdfError } from "@/components/household-data/process-client";

const PDF = { path: "/api/pdf/households/7/a1.pdf.enc", iv: "AAAA" };
const A1 = makeApartmentView({
  id: "a1",
  name: "Sonnenweg 3",
  rentChf: 2200,
  summary: "Original AI summary.",
  userEditedFields: ["rentChf"],
  pdf: PDF,
});

function setup(apartment = A1) {
  currentParamsId = "a1";
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  const rendered = renderWithHouseholdData(<ApartmentDetailPage />, {
    apartments: [apartment],
    dataKey: null,
  });
  vi.mocked(rendered.value.updateApartment).mockImplementation(async (id, mutate) =>
    makeApartmentView({ ...mutate(apartment), id })
  );
  return rendered;
}

beforeEach(() => {
  vi.mocked(downloadPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.mocked(parsePdf).mockResolvedValue({
    extracted: { name: "Sonnenweg 3", rentChf: 2500, summary: "Refreshed summary after reprocess." },
    aiAvailable: true,
  });
});

describe("Apartment detail — reprocess", () => {
  it("decrypts the PDF, parses it and applies the extraction to un-edited fields only", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Reprocess$/ }));

    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    expect(downloadPdf).toHaveBeenCalledWith(null, 7, "a1", PDF);
    expect(parsePdf).toHaveBeenCalledWith(expect.any(Uint8Array), "a1.pdf");
    const next = vi.mocked(value.updateApartment).mock.calls[0][1](A1);
    expect(next.summary).toBe("Refreshed summary after reprocess.");
    expect(next.rentChf).toBe(2200); // user-edited: kept
    expect(next.rawExtractedData).toEqual(expect.objectContaining({ rentChf: 2500 }));
  });

  it("Reprocess is disabled when the apartment has no pdf", () => {
    setup(makeApartmentView({ ...A1, pdf: null }));
    expect(screen.getByRole("button", { name: /^Reprocess$/ })).toBeDisabled();
  });

  it("does nothing when the user cancels the confirm", async () => {
    const { value } = setup();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reprocess$/ }));
    expect(downloadPdf).not.toHaveBeenCalled();
    expect(value.updateApartment).not.toHaveBeenCalled();
  });

  it("surfaces a ParsePdfError message and leaves the apartment untouched", async () => {
    vi.mocked(parsePdf).mockRejectedValue(new ParsePdfError("AI quota exhausted", "quota", 429, 30));
    const { value } = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reprocess$/ }));
    expect(await screen.findByText(/Couldn't reprocess apartment/)).toBeInTheDocument();
    expect(screen.getByText(/AI quota exhausted/)).toBeInTheDocument();
    expect(value.updateApartment).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Reprocess$/ })).toBeEnabled();
  });
});
```

`view-pdf.test.tsx` (new):

```tsx
import { downloadPdf } from "@/components/household-data/pdf-files";

const PDF = { path: "/api/pdf/households/7/a1.pdf.enc", iv: "AAAA" };

describe("Apartment detail — View PDF", () => {
  it("decrypts the file and opens a blob: URL in a new tab", async () => {
    currentParamsId = "a1";
    const createObjectURL = vi.fn().mockReturnValue("blob:pdf-1");
    const open = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    vi.stubGlobal("open", open);
    vi.mocked(downloadPdf).mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ id: "a1", name: "Sonnenweg 3", pdf: PDF })],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /^View PDF$/ }));

    await waitFor(() => expect(open).toHaveBeenCalledWith("blob:pdf-1", "_blank", "noopener"));
    expect(downloadPdf).toHaveBeenCalledWith(null, 7, "a1", PDF);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
  });

  it("hides the button when there is no pdf", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ id: "a1", pdf: null })],
    });
    expect(screen.queryByRole("button", { name: /^View PDF$/ })).toBeNull();
  });

  it("shows an error when decryption fails", async () => {
    currentParamsId = "a1";
    vi.mocked(downloadPdf).mockRejectedValue(new Error("Could not decrypt file"));
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ id: "a1", pdf: PDF })],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /^View PDF$/ }));
    expect(await screen.findByText(/Couldn't open PDF/)).toBeInTheDocument();
  });
});
```

If `vi.stubGlobal("URL", …)` proves awkward in jsdom, assign directly instead: `URL.createObjectURL = createObjectURL;` in the test and restore it in `afterEach`.

- [ ] **Step 9: Run the detail tests to see them fail**

Run: `npx vitest run "src/app/apartments/[id]"`
Expected: FAIL — the page still fetches `/api/apartments/…`.

- [ ] **Step 10: Rewrite `src/app/apartments/[id]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { ApartmentLocationMap } from "@/components/apartment-location-map";
import { ErrorDisplay } from "@/components/error-display";
import {
  formFromApartment,
  formToFields,
  type ApartmentForm,
} from "@/components/apartment-form-fields";
import { ApartmentEditForm } from "@/components/apartment-edit-form";
import {
  MyRatingPanel,
  OtherRatingPanel,
  type RatingState,
} from "@/components/apartment-rating-panel";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { downloadPdf } from "@/components/household-data/pdf-files";
import { parsePdf } from "@/components/household-data/process-client";
import { type ErrorDetails, errorDetailsFromException } from "@/lib/fetch-error";
import { applyExtraction, mergeUserEdit } from "@/lib/edited-fields";
import { useApartmentPager } from "@/lib/use-apartment-pager";
import { setUnsavedRating } from "@/lib/unsaved-changes";
import { formatSwissDate } from "@/lib/iso-date";
import type { RatingView } from "@/lib/household-data/types";
import { ApartmentPagerNav } from "./_components/apartment-pager-nav";
import { ApartmentActions } from "./_components/apartment-actions";
import { ApartmentMetricBadges } from "./_components/apartment-metric-badges";
import { DistanceSection } from "./_components/distance-section";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

const EMPTY_RATING: RatingState = {
  kitchen: 0,
  balconies: 0,
  location: 0,
  floorplan: 0,
  overallFeeling: 0,
  comment: "",
};

function snapshotOf(rating: RatingView | null): RatingState {
  return rating
    ? {
        kitchen: rating.kitchen,
        balconies: rating.balconies,
        location: rating.location,
        floorplan: rating.floorplan,
        overallFeeling: rating.overallFeeling,
        comment: rating.comment || "",
      }
    : EMPTY_RATING;
}

function isSameRating(a: RatingState, b: RatingState): boolean {
  return (
    a.kitchen === b.kitchen &&
    a.balconies === b.balconies &&
    a.location === b.location &&
    a.floorplan === b.floorplan &&
    a.overallFeeling === b.overallFeeling &&
    a.comment === b.comment
  );
}

export default function ApartmentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const {
    status,
    error: loadError,
    apartments,
    locations,
    identity,
    dataKey,
    updateApartment,
    deleteApartment,
    rateApartment,
  } = useHouseholdData();
  const pager = useApartmentPager(id);
  const apartment = apartments.find((a) => a.id === id) ?? null;

  const [deleting, setDeleting] = useState(false);
  const [myRating, setMyRating] = useState<RatingState>(EMPTY_RATING);
  const [cleanRating, setCleanRating] = useState<RatingState>(EMPTY_RATING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<ApartmentForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  // My stored rating, if any. The draft is re-seeded from it whenever the
  // stored copy changes (first load, after a save) — keyed on updatedAt so
  // typing a draft is not clobbered by unrelated store updates.
  const storedRating = apartment?.ratings.find((r) => r.userId === identity.userId) ?? null;
  const storedRatingStamp = storedRating?.updatedAt ?? null;
  useEffect(() => {
    const snapshot = snapshotOf(storedRating);
    setMyRating(snapshot);
    setCleanRating(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, storedRatingStamp]);

  const isRatingDirty = !isSameRating(myRating, cleanRating);
  useEffect(() => {
    setUnsavedRating(isRatingDirty);
    return () => setUnsavedRating(false);
  }, [isRatingDirty]);

  async function handleDelete() {
    if (!confirm("Delete this apartment? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteApartment(id);
      router.push("/apartments");
    } catch (err) {
      setError({
        headline: "Couldn't delete apartment",
        details: errorDetailsFromException(err),
      });
      setDeleting(false);
    }
  }

  async function handleViewPdf() {
    if (!apartment?.pdf) return;
    try {
      const bytes = await downloadPdf(dataKey, identity.householdId, apartment.id, apartment.pdf);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener");
      // The tab has the bytes now; release the URL after it has had time to load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError({ headline: "Couldn't open PDF", details: errorDetailsFromException(err) });
    }
  }

  async function handleReprocess() {
    if (!apartment?.pdf) return;
    const ok = window.confirm(
      "Reprocess this apartment? Fields you haven't edited will be refreshed from the PDF. Fields you've edited will stay."
    );
    if (!ok) return;
    setReprocessing(true);
    setError(null);
    try {
      const bytes = await downloadPdf(dataKey, identity.householdId, apartment.id, apartment.pdf);
      const { extracted } = await parsePdf(bytes, `${apartment.id}.pdf`);
      // Coerce through the form helpers so the extraction lands as typed
      // Apartment fields, then keep whatever the user edited by hand.
      const fields = formToFields(formFromExtracted(extracted));
      await updateApartment(apartment.id, (current) => applyExtraction(current, fields, extracted));
    } catch (err) {
      setError({
        headline: "Couldn't reprocess apartment",
        details: errorDetailsFromException(err),
      });
    } finally {
      setReprocessing(false);
    }
  }

  function startEdit() {
    if (!apartment) return;
    setEditForm(formFromApartment(apartment));
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm(null);
  }

  async function handleSaveEdit() {
    if (!editForm || !apartment) return;
    if (!editForm.name.trim()) {
      setError({ headline: "Name is required" });
      return;
    }
    setSavingEdit(true);
    const fields = formToFields(editForm);
    try {
      await updateApartment(apartment.id, (current) => mergeUserEdit(current, fields));
      setEditing(false);
      setEditForm(null);
      setSavingEdit(false);
    } catch (err) {
      setError({
        headline: "Couldn't save changes",
        details: errorDetailsFromException(err),
      });
      setSavingEdit(false);
    }
  }

  function handleCancelRating() {
    setMyRating(cleanRating);
  }

  async function handleSaveRating() {
    setSaving(true);
    try {
      await rateApartment(id, myRating);
      router.push("/apartments");
    } catch (err) {
      setError({
        headline: "Couldn't save rating",
        details: errorDetailsFromException(err),
      });
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8">
        <ErrorDisplay headline={loadError ?? "Couldn't load apartment"} />
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="py-8">
        <ErrorDisplay headline="Apartment not found" />
      </div>
    );
  }

  if (apartment.corrupt) {
    return (
      <div className="space-y-4 py-8">
        <ErrorDisplay
          headline="This apartment could not be decrypted"
          details={{
            message:
              "The stored record could not be opened with the household key. It can only be deleted.",
            timestamp: new Date().toISOString(),
          }}
        />
        {error && <ErrorDisplay headline={error.headline} details={error.details} />}
        <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    );
  }

  const otherRatings = apartment.ratings.filter((r) => r.userId !== identity.userId);

  return (
    <div className="space-y-6">
      <ApartmentPagerNav
        prevId={pager.prevId}
        nextId={pager.nextId}
        position={pager.position}
        total={pager.total}
        onNavigate={(nextId) => router.push(`/apartments/${nextId}`)}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <ShortCode code={apartment.shortCode} size="lg" />
          <h1 className="text-2xl font-semibold">{apartment.name}</h1>
          {apartment.address && (
            <AddressLink address={apartment.address} className="text-muted-foreground" />
          )}
        </div>
        <ApartmentActions
          hasPdf={apartment.pdf !== null}
          listingUrl={apartment.listingUrl}
          editing={editing}
          reprocessing={reprocessing}
          deleting={deleting}
          onEdit={startEdit}
          onViewPdf={() => void handleViewPdf()}
          onReprocess={() => void handleReprocess()}
          onDelete={() => void handleDelete()}
        />
      </div>

      {apartment.summary && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm leading-relaxed">{apartment.summary}</p>
          </CardContent>
        </Card>
      )}

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      {editing && editForm ? (
        <ApartmentEditForm
          form={editForm}
          saving={savingEdit}
          onChange={(field, value) =>
            setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev))
          }
          onWashingMachineChange={(v) =>
            setEditForm((prev) => (prev ? { ...prev, hasWashingMachine: v } : prev))
          }
          onSave={() => void handleSaveEdit()}
          onCancel={cancelEdit}
        />
      ) : (
        <ApartmentMetricBadges apartment={apartment} />
      )}

      {apartment.availableFrom && (
        <div className="text-sm text-muted-foreground">
          Available from: {formatSwissDate(apartment.availableFrom)}
        </div>
      )}

      {locations.length > 0 && (
        <DistanceSection
          locations={locations}
          distances={apartment.distances}
          apartmentAddress={apartment.address}
        />
      )}

      <ApartmentLocationMap
        latitude={apartment.latitude}
        longitude={apartment.longitude}
        label={apartment.shortCode ?? apartment.name}
      />

      <Separator />

      <MyRatingPanel
        userName={identity.userName}
        rating={myRating}
        saving={saving}
        dirty={isRatingDirty}
        onChange={setMyRating}
        onSave={() => void handleSaveRating()}
        onCancel={handleCancelRating}
      />

      {otherRatings.map((rating) => (
        <OtherRatingPanel key={rating.userId} rating={rating} />
      ))}
    </div>
  );
}
```

Add `formFromExtracted` to the `@/components/apartment-form-fields` import (it is used in `handleReprocess`). `LocationView` satisfies `LocationLite` structurally, so `locations` is passed straight through. `ErrorDisplay`'s `details` prop is optional (`src/components/error-display.tsx`), which the `status === "error"` and not-found branches rely on.

- [ ] **Step 11: Run the detail tests**

Run: `npx vitest run "src/app/apartments/[id]" src/components/__tests__/apartment-location-map.test.tsx src/lib/__tests__/edited-fields.test.ts`
Expected: PASS. If the rating draft test fails because the seeding effect runs after the first assertion, wrap the first `expect` of "prefills my rating" in `await waitFor(...)`.

- [ ] **Step 12: Commit**

```bash
git add src/lib/edited-fields.ts src/lib/__tests__/edited-fields.test.ts \
  src/components/apartment-location-map.tsx src/components/apartment-location-map-inner.tsx \
  src/components/__tests__/apartment-location-map.test.tsx src/components/apartment-rating-panel.tsx \
  "src/app/apartments/[id]"
git commit -m "feat(apartments): detail page reads the household store, decrypts PDFs client-side

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 15: Compare page — columns from the store, string ids, decrypt-on-click PDF icon

**Files:**
- Modify: `src/app/compare/_components/compare-types.ts` (drop `ApartmentWithRatings`)
- Modify: `src/app/compare/_components/compare-column-header.tsx`, `compare-table.tsx`
- Rewrite: `src/app/compare/page.tsx`
- Rewrite tests: `src/app/compare/_components/__tests__/compare-table.test.tsx`, `src/app/compare/__tests__/compare-page.test.tsx`, `src/app/compare/__tests__/error-states.test.tsx`

**Interfaces:**
- Consumes: `useHouseholdData()` → `status`, `error`, `apartments`, `locations`, `identity`, `dataKey`; `downloadPdf` (Task 10); `compareApartments`, `compareSortOptions`, `COMPARE_SORT_*`, `isSortField`, `isSortDirection` (Task 12, string-id `bikeTo:`/`transitTo:` fields); `ApartmentView`, `LocationView` (Task 4); `errorDetailsFromException` (Task 13).
- Produces: `CompareTable({ visible: ApartmentView[]; sortedVisible: ApartmentView[]; locations: LocationView[]; onHide: (id: string) => void; onViewPdf: (apt: ApartmentView) => void })`; `CompareColumnHeader({ apt: ApartmentView; onHide; onViewPdf })`. `metricRows`, `ratingKeys`, `ratingLabels` unchanged.

Spec: "`compare` reads the same cache; hidden-column state stays local". The PDF icon becomes a button (decrypt → `blob:` URL → new tab) because the stored file is ciphertext; the detail-page link, listing link and hide button keep their roles and labels so the existing queries still work.

- [ ] **Step 1: Rewrite the `CompareTable` test on `ApartmentView`**

Replace the top of `src/app/compare/_components/__tests__/compare-table.test.tsx` (imports, `makeApt`, `trainStation`) with:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareTable } from "../compare-table";
import {
  makeApartmentView,
  makeLocationView,
} from "@/components/household-data/__tests__/fake-household-data";
import type { ApartmentView } from "@/lib/household-data/types";

afterEach(() => cleanup());

function makeApt(over: Partial<ApartmentView> & { id?: string } = {}): ApartmentView {
  return makeApartmentView({
    id: "a1",
    name: "Apt",
    sizeM2: 50,
    numRooms: 2.5,
    numBathrooms: 1,
    numBalconies: 1,
    rentChf: 2000,
    shortCode: "ABC-2.5B-WY-4001",
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  });
}

const trainStation = makeLocationView({
  id: "loc-7",
  label: "Train Station",
  icon: "Train",
  address: "Basel SBB",
});

function renderTable(apts: ApartmentView[], locations = [] as ReturnType<typeof makeLocationView>[]) {
  const onHide = vi.fn();
  const onViewPdf = vi.fn();
  render(
    <CompareTable
      visible={apts}
      sortedVisible={apts}
      locations={locations}
      onHide={onHide}
      onViewPdf={onViewPdf}
    />
  );
  return { onHide, onViewPdf };
}
```

Then, through the rest of the file:
- every `id: 1` / `id: 2` becomes `id: "a1"` / `id: "a2"`;
- every `<CompareTable visible={[…]} sortedVisible={[…]} locations={…} onHide={() => {}} />` becomes `renderTable([…], […])`;
- `distances: [{ locationId: 7, bikeMin: 12, transitMin: 25 }]` becomes `distances: { "loc-7": { bikeMin: 12, transitMin: 25 } }` (same for the null / mixed cases);
- every rating literal gains `updatedAt: "2026-01-01T00:00:00Z"`;
- the "labels a rating from an account with no display name" test uses `userName: ""` instead of `null` (the store's `RatingView.userName` is a string; the derive step already substitutes a label for accounts without one, and the table keeps `|| "Household member"` as the last resort).

Append one new describe:

```tsx
describe("CompareTable — column header PDF button", () => {
  it("renders a View PDF button that reports the apartment when it has a pdf", async () => {
    const a = makeApt({ id: "a1", name: "With PDF", pdf: { path: "/api/pdf/households/7/a1.pdf.enc", iv: "AAAA" } });
    const { onViewPdf } = renderTable([a]);
    await userEvent.setup().click(screen.getByRole("button", { name: /View PDF for With PDF/i }));
    expect(onViewPdf).toHaveBeenCalledWith(a);
  });

  it("omits the button when there is no pdf", () => {
    renderTable([makeApt({ id: "a1", name: "No PDF", pdf: null })]);
    expect(screen.queryByRole("button", { name: /View PDF for No PDF/i })).toBeNull();
  });

  it("Hide reports the string id", async () => {
    const { onHide } = renderTable([makeApt({ id: "a1", name: "Apt" })]);
    await userEvent.setup().click(screen.getByRole("button", { name: /Hide Apt/i }));
    expect(onHide).toHaveBeenCalledWith("a1");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/app/compare/_components`
Expected: FAIL — type errors on `distances` / `onViewPdf` and no button rendered.

- [ ] **Step 3: Update the compare sub-components**

`src/app/compare/_components/compare-types.ts`: delete the `ApartmentWithRatings` interface (and nothing else — `metricRows`, `ratingKeys`, `ratingLabels` stay).

`src/app/compare/_components/compare-column-header.tsx` (whole file):

```tsx
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import type { ApartmentView } from "@/lib/household-data/types";

export function CompareColumnHeader({
  apt,
  onHide,
  onViewPdf,
}: {
  apt: ApartmentView;
  onHide: (id: string) => void;
  onViewPdf: (apt: ApartmentView) => void;
}) {
  return (
    <th className="min-w-[160px] px-4 py-3 text-left font-medium">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <a
              href={`/apartments/${apt.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center font-semibold hover:underline sm:min-h-0"
            >
              {apt.name}
            </a>
            {apt.pdf && (
              // The stored file is ciphertext; the page decrypts and opens
              // it, so this is a button rather than a link.
              <button
                type="button"
                aria-label={`View PDF for ${apt.name}`}
                className="tap-target text-muted-foreground hover:text-foreground"
                onClick={() => onViewPdf(apt)}
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
            )}
            {apt.listingUrl && (
              <a
                href={apt.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Original listing for ${apt.name}`}
                className="tap-target text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <ShortCode code={apt.shortCode} />
          {apt.address && (
            <AddressLink
              address={apt.address}
              className="text-xs font-normal text-muted-foreground"
            />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Hide ${apt.name}`}
          className="tap-target h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onHide(apt.id)}
        >
          ✕
        </Button>
      </div>
    </th>
  );
}
```

`src/app/compare/_components/compare-table.tsx` — four edits, the JSX body is otherwise unchanged:

```tsx
// imports
import type { ApartmentView, LocationView } from "@/lib/household-data/types";
import { CompareColumnHeader } from "./compare-column-header";
import { metricRows, ratingKeys, ratingLabels } from "./compare-types";

interface CompareTableProps {
  visible: ApartmentView[];
  sortedVisible: ApartmentView[];
  locations: LocationView[];
  onHide: (id: string) => void;
  onViewPdf: (apt: ApartmentView) => void;
}

export function CompareTable({ visible, sortedVisible, locations, onHide, onViewPdf }: CompareTableProps) {
```

- `userLabels` becomes `new Map<string, string>()` and the section label is `const label = userLabels.get(userId) || "Household member";`.
- The header row renders `<CompareColumnHeader key={apt.id} apt={apt} onHide={onHide} onViewPdf={onViewPdf} />`.
- In the location rows, replace `const d = apt.distances.find((x) => x.locationId === loc.id);` with `const d = apt.distances[loc.id];`.

Delete the `import type { LocationOfInterest } from "@/lib/db/schema";` line.

Run: `npx vitest run src/app/compare/_components` — expected PASS.

- [ ] **Step 4: Rewrite the page tests on the store**

`src/app/compare/__tests__/compare-page.test.tsx` (whole file):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
  makeLocationView,
} from "@/components/household-data/__tests__/fake-household-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));

import ComparePage from "../page";
import { downloadPdf } from "@/components/household-data/pdf-files";

const PDF = { path: "/api/pdf/households/7/a1.pdf.enc", iv: "AAAA" };
const WORK = makeLocationView({ id: "loc-1", label: "Work", icon: "Briefcase", address: "Zurich HQ" });

const APARTMENTS = [
  makeApartmentView({
    id: "a1",
    name: "Sonnenweg 3",
    sizeM2: 60,
    numRooms: 2.5,
    numBathrooms: 1,
    numBalconies: 1,
    rentChf: 2200,
    distances: { "loc-1": { bikeMin: 12, transitMin: 25 } },
    shortCode: "ABC-2.5B-WY-4057",
    createdAt: "2026-01-15T10:00:00Z",
    pdf: PDF,
    listingUrl: null,
  }),
  makeApartmentView({
    id: "a2",
    name: "Bergstrasse 12",
    sizeM2: 45,
    numRooms: 2,
    numBathrooms: 1,
    numBalconies: 0,
    rentChf: 1800,
    distances: { "loc-1": { bikeMin: 8, transitMin: 15 } },
    shortCode: "DEF-2B-W-4058",
    createdAt: "2026-03-20T10:00:00Z",
    pdf: null,
    listingUrl: "https://example.com/bergstrasse-listing",
  }),
  makeApartmentView({
    id: "a3",
    name: "Seeblick 7",
    sizeM2: 80,
    numRooms: 3.5,
    numBathrooms: 2,
    numBalconies: 2,
    rentChf: null,
    distances: { "loc-1": { bikeMin: 18, transitMin: 30 } },
    shortCode: "GHI-3.5B-WY-4059",
    createdAt: "2026-02-10T10:00:00Z",
    pdf: null,
    listingUrl: null,
  }),
];

function columnOrder(): string[] {
  return Array.from(document.querySelectorAll("thead th .font-semibold")).map(
    (el) => el.textContent ?? ""
  );
}

function setup() {
  return renderWithHouseholdData(<ComparePage />, { apartments: APARTMENTS, locations: [WORK] });
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Compare page — sort", () => {
  it("defaults to rentChf ascending (cheapest first, null last)", () => {
    setup();
    expect(columnOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  it("reads a location sort field from localStorage on mount", () => {
    localStorage.setItem("flatpare-compare-sort-field", "bikeTo:loc-1");
    localStorage.setItem("flatpare-compare-sort-direction", "desc");
    setup();
    expect(columnOrder()).toEqual(["Seeblick 7", "Sonnenweg 3", "Bergstrasse 12"]);
  });

  it("changing the sort field re-orders columns and persists to localStorage", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox", { name: /Sort by/i }));
    await user.click(screen.getByRole("option", { name: "Bathrooms" }));
    await waitFor(() => {
      expect(columnOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
    });
    expect(localStorage.getItem("flatpare-compare-sort-field")).toBe("numBathrooms");
  });

  it("direction toggle flips column order and persists", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /Ascending/i }));
    await waitFor(() => {
      expect(columnOrder()).toEqual(["Sonnenweg 3", "Bergstrasse 12", "Seeblick 7"]);
    });
    expect(localStorage.getItem("flatpare-compare-sort-direction")).toBe("desc");
  });

  it("falls back to defaults when localStorage has invalid sort values", () => {
    localStorage.setItem("flatpare-compare-sort-field", "bogus");
    localStorage.setItem("flatpare-compare-sort-direction", "sideways");
    setup();
    expect(columnOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  it("hidden columns compose with sort order and Show all restores them", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /Hide Bergstrasse 12/i }));
    await waitFor(() => expect(columnOrder()).toEqual(["Sonnenweg 3", "Seeblick 7"]));
    await user.click(screen.getByRole("button", { name: /Show all \(1 hidden\)/i }));
    await waitFor(() =>
      expect(columnOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"])
    );
  });
});

describe("Compare page — column header links", () => {
  it("renders the apartment name as a link to its detail page in a new tab", () => {
    setup();
    const link = screen.getByRole("link", { name: "Sonnenweg 3" });
    expect(link).toHaveAttribute("href", "/apartments/a1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("View PDF decrypts the file and opens a blob: URL", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:pdf-1");
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const open = vi.fn();
    vi.stubGlobal("open", open);
    vi.mocked(downloadPdf).mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    setup();
    await userEvent.setup().click(screen.getByRole("button", { name: /View PDF for Sonnenweg 3/i }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("blob:pdf-1", "_blank", "noopener"));
    expect(downloadPdf).toHaveBeenCalledWith(null, 7, "a1", PDF);
  });

  it("shows an error when the PDF cannot be opened", async () => {
    vi.mocked(downloadPdf).mockRejectedValue(new Error("Could not decrypt file"));
    setup();
    await userEvent.setup().click(screen.getByRole("button", { name: /View PDF for Sonnenweg 3/i }));
    expect(await screen.findByText(/Couldn't open PDF/)).toBeInTheDocument();
    // The table is still there — the error is a banner, not a page replacement.
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
  });

  it("hides the PDF button when there is no pdf", () => {
    setup();
    expect(screen.queryByRole("button", { name: /View PDF for Bergstrasse 12/i })).toBeNull();
  });

  it("renders an Original listing icon link when listingUrl is present", () => {
    setup();
    const listingLink = screen.getByRole("link", { name: /Original listing for Bergstrasse 12/i });
    expect(listingLink).toHaveAttribute("href", "https://example.com/bergstrasse-listing");
    expect(listingLink).toHaveAttribute("target", "_blank");
  });

  it("hides the Original listing icon link when listingUrl is null", () => {
    setup();
    expect(screen.queryByRole("link", { name: /Original listing for Sonnenweg 3/i })).toBeNull();
  });

  it("renders a distance row per store location", () => {
    setup();
    expect(screen.getAllByTitle(/Bike \+ transit to Work/i).length).toBe(1);
    expect(screen.getByText(/12.*25 min/)).toBeInTheDocument();
  });
});
```

`src/app/compare/__tests__/error-states.test.tsx` (whole file):

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import {
  renderWithHouseholdData,
  makeApartmentView,
} from "@/components/household-data/__tests__/fake-household-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ComparePage from "../page";

afterEach(() => cleanup());

describe("Compare page — load + error states", () => {
  it("shows 'Loading comparison...' while the store is loading", () => {
    renderWithHouseholdData(<ComparePage />, { status: "loading", apartments: [] });
    expect(screen.getByText(/Loading comparison/i)).toBeInTheDocument();
  });

  it("renders ErrorDisplay when the store failed to load", () => {
    renderWithHouseholdData(<ComparePage />, {
      status: "error",
      error: "Failed to load household data",
      apartments: [],
    });
    expect(screen.getByText(/Couldn't load comparison data/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to load household data/)).toBeInTheDocument();
  });

  it("renders the empty state with an upload link when there are no apartments", () => {
    renderWithHouseholdData(<ComparePage />, { apartments: [] });
    expect(screen.getByText(/No apartments to compare yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload a listing/i })).toHaveAttribute(
      "href",
      "/apartments/new"
    );
  });

  it("leaves corrupt rows out of the table", () => {
    renderWithHouseholdData(<ComparePage />, {
      apartments: [
        makeApartmentView({ id: "a1", name: "Readable" }),
        makeApartmentView({ id: "a2", corrupt: true }),
      ],
    });
    expect(screen.getByText("Readable")).toBeInTheDocument();
    expect(document.querySelectorAll("thead th .font-semibold")).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run the page tests to see them fail**

Run: `npx vitest run src/app/compare`
Expected: FAIL — the page still fetches.

- [ ] **Step 6: Rewrite `src/app/compare/page.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
import { ErrorDisplay } from "@/components/error-display";
import { type ErrorDetails, errorDetailsFromException } from "@/lib/fetch-error";
import {
  compareApartments,
  compareSortOptions,
  COMPARE_SORT_CHANGE_EVENT,
  COMPARE_SORT_DIRECTION_STORAGE_KEY,
  COMPARE_SORT_FIELD_STORAGE_KEY,
  isSortDirection,
  isSortField,
  type SortDirection,
  type SortField,
} from "@/lib/apartment-sort";
import { usePersistedEnum } from "@/lib/use-persisted-enum";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { downloadPdf } from "@/components/household-data/pdf-files";
import type { ApartmentView } from "@/lib/household-data/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompareTable } from "./_components/compare-table";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

export default function ComparePage() {
  const { status, error: loadError, apartments, locations, identity, dataKey } =
    useHouseholdData();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<ErrorState | null>(null);
  const [sortField, setSortField] = usePersistedEnum<SortField>(
    COMPARE_SORT_FIELD_STORAGE_KEY,
    COMPARE_SORT_CHANGE_EVENT,
    "rentChf",
    isSortField
  );
  const [sortDirection, setSortDirection] = usePersistedEnum<SortDirection>(
    COMPARE_SORT_DIRECTION_STORAGE_KEY,
    COMPARE_SORT_CHANGE_EVENT,
    "asc",
    isSortDirection
  );

  const sortOptions = useMemo(() => compareSortOptions(locations), [locations]);

  // Corrupt rows have no plaintext to compare; the list page is where they
  // surface (with a delete action).
  const readable = useMemo(() => apartments.filter((a) => !a.corrupt), [apartments]);
  const visible = useMemo(
    () => readable.filter((a) => !hiddenIds.has(a.id)),
    [readable, hiddenIds]
  );
  const sortedVisible = useMemo(
    () => [...visible].sort((a, b) => compareApartments(a, b, sortField, sortDirection)),
    [visible, sortField, sortDirection]
  );

  async function handleViewPdf(apt: ApartmentView) {
    if (!apt.pdf) return;
    try {
      const bytes = await downloadPdf(dataKey, identity.householdId, apt.id, apt.pdf);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError({ headline: "Couldn't open PDF", details: errorDetailsFromException(err) });
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading comparison...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8">
        <ErrorDisplay
          headline="Couldn't load comparison data"
          details={{ message: loadError ?? undefined, timestamp: new Date().toISOString() }}
        />
      </div>
    );
  }

  if (readable.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="rounded-full bg-muted p-4">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="font-medium">No apartments to compare yet</p>
          <p className="text-sm text-muted-foreground">
            Upload at least two listings to start comparing
          </p>
        </div>
        <Link href="/apartments/new" className={buttonVariants()}>
          Upload a listing
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Compare</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Select
            value={sortField}
            onValueChange={(value) => setSortField(value as SortField)}
          >
            <SelectTrigger
              aria-label="Sort by"
              className="min-w-0 flex-1 data-[size=default]:h-11 sm:w-[160px] sm:flex-none sm:data-[size=default]:h-8"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={sortDirection === "asc" ? "Ascending" : "Descending"}
            onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
            className="h-11 w-11 p-0 sm:h-8 sm:w-8"
          >
            {sortDirection === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>
          {hiddenIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={() => setHiddenIds(new Set())}>
              Show all ({hiddenIds.size} hidden)
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <CompareTable
        visible={visible}
        sortedVisible={sortedVisible}
        locations={locations}
        onHide={(id) => setHiddenIds((prev) => new Set([...prev, id]))}
        onViewPdf={(apt) => void handleViewPdf(apt)}
      />
    </div>
  );
}
```

(`ErrorDetails.message` is `string | undefined` per `src/lib/fetch-error.ts`; the `status === "error"` branch passes the store's message through so the test can find it.)

- [ ] **Step 7: Run the compare tests**

Run: `npx vitest run src/app/compare`
Expected: PASS. The localStorage keys in the tests are the literal values of `COMPARE_SORT_FIELD_STORAGE_KEY` / `COMPARE_SORT_DIRECTION_STORAGE_KEY` (`"flatpare-compare-sort-field"` / `"flatpare-compare-sort-direction"` today) — if Task 12 renamed them, use the constants.

- [ ] **Step 8: Commit**

```bash
git add src/app/compare
git commit -m "feat(compare): read columns from the household store, decrypt PDFs on click

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 16: Settings page — locations and Recompute through the store

**Files:**
- Rewrite: `src/app/settings/page.tsx`
- Rewrite: `src/app/settings/__tests__/settings-page.test.tsx`

**Interfaces:**
- Consumes: `useHouseholdData()` → `status`, `error`, `locations`, `createLocation(id, data: Location)`, `updateLocation(id, mutate)`, `deleteLocation(id)`, `moveLocation(id, "up" | "down")`, `runMaintenance("distances", onProgress)` → `MaintenanceReport { updated; skipped; failed: { id; reason }[] }` (Task 11); `newRowId()` (Task 4); `LocationView` (Task 4); `errorDetailsFromException` (Task 13); `MAX_LOCATIONS`, `LocationIconName` (existing `@/lib/location-icons`).
- Produces: nothing new — the page is a leaf. `EncryptionSettings` and `HouseholdSettings` stay mounted unchanged (spec: `household-settings.tsx` is untouched).

Spec: "`POST /api/settings/recompute-distances` → client `runMaintenance("distances")`". The store geocodes a new or re-addressed location and fills its distances itself (Task 11's `createLocation`/`updateLocation` call `fillDistances`), so the page only submits `{ label, icon, address, latitude: null, longitude: null }`.

- [ ] **Step 1: Rewrite the settings test on the store**

`src/app/settings/__tests__/settings-page.test.tsx` (whole file):

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeLocationView,
} from "@/components/household-data/__tests__/fake-household-data";

// The settings page mounts the encryption and household panels; they have
// their own tests and need a CryptoProvider, so stub them here.
vi.mock("@/components/crypto/encryption-settings", () => ({
  EncryptionSettings: () => null,
}));
vi.mock("@/components/household-settings", () => ({
  HouseholdSettings: () => null,
}));

import SettingsPage from "../page";

const STATION = makeLocationView({
  id: "loc-1",
  label: "Train Station",
  icon: "Train",
  address: "Basel SBB",
  sortOrder: 0,
});

function setup(over: Parameters<typeof renderWithHouseholdData>[1] = {}) {
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  return renderWithHouseholdData(<SettingsPage />, { locations: [STATION], ...over });
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("SettingsPage", () => {
  it("renders the store's locations", () => {
    setup();
    expect(screen.getByText("Train Station")).toBeInTheDocument();
    expect(screen.getByText("Basel SBB")).toBeInTheDocument();
    expect(screen.getByText(/1 of 5/)).toBeInTheDocument();
  });

  it("adds a new location via the icon-picker modal and createLocation", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.createLocation).mockImplementation(async (id, data) =>
      makeLocationView({ id, ...data, sortOrder: 1 })
    );

    await user.click(screen.getByRole("button", { name: /Add location/i }));
    await user.type(screen.getByLabelText(/Label/i), "Work");
    await user.type(screen.getByLabelText(/Address/i), "Zürich");
    await user.click(screen.getByRole("button", { name: /Pick icon/i }));
    expect(screen.getByRole("dialog", { name: /Pick an icon/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Briefcase" }));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(value.createLocation).toHaveBeenCalledTimes(1));
    const [id, data] = vi.mocked(value.createLocation).mock.calls[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data).toEqual({
      label: "Work",
      icon: "Briefcase",
      address: "Zürich",
      latitude: null,
      longitude: null,
    });
    // Form closes on success.
    await waitFor(() => expect(screen.queryByLabelText(/Label/i)).toBeNull());
  });

  it("shows an error and keeps the form open when createLocation rejects", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.createLocation).mockRejectedValue(new Error("Too many locations"));
    await user.click(screen.getByRole("button", { name: /Add location/i }));
    await user.type(screen.getByLabelText(/Label/i), "Work");
    await user.type(screen.getByLabelText(/Address/i), "Zürich");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText(/Couldn't save location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Label/i)).toBeInTheDocument();
  });

  it("deletes a location after confirmation", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /Delete Train Station/i }));
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete "Train Station"? Apartments will lose this distance.'
    );
    await waitFor(() => expect(value.deleteLocation).toHaveBeenCalledWith("loc-1"));
  });

  it("does not delete when the confirm is declined", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    await user.click(screen.getByRole("button", { name: /Delete Train Station/i }));
    expect(value.deleteLocation).not.toHaveBeenCalled();
  });

  it("edit flow: opens, changes label, saves through updateLocation with a mutator", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.updateLocation).mockImplementation(async (id, mutate) =>
      makeLocationView({ ...mutate(STATION), id, sortOrder: 0 })
    );
    await user.click(screen.getByRole("button", { name: /Edit Train Station/i }));
    const labelInput = screen.getByLabelText(/^Label$/i) as HTMLInputElement;
    expect(labelInput.value).toBe("Train Station");
    await user.clear(labelInput);
    await user.type(labelInput, "Renamed");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(value.updateLocation).toHaveBeenCalledTimes(1));
    const [id, mutate] = vi.mocked(value.updateLocation).mock.calls[0];
    expect(id).toBe("loc-1");
    expect(mutate(STATION)).toEqual({ ...STATION, label: "Renamed" });
  });

  it("Save stays disabled while the edit form is unchanged", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /Edit Train Station/i }));
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
  });

  it("move up / move down call moveLocation and disable at the edges", async () => {
    const user = userEvent.setup();
    const { value } = setup({
      locations: [
        makeLocationView({ id: "loc-1", label: "First", address: "A", sortOrder: 0 }),
        makeLocationView({ id: "loc-2", label: "Second", address: "B", sortOrder: 1 }),
      ],
    });
    expect(screen.getByRole("button", { name: /Move First up/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Move Second down/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Move Second up/i }));
    await waitFor(() => expect(value.moveLocation).toHaveBeenCalledWith("loc-2", "up"));
    await user.click(screen.getByRole("button", { name: /Move First down/i }));
    await waitFor(() => expect(value.moveLocation).toHaveBeenCalledWith("loc-1", "down"));
  });

  it("recompute runs the distances maintenance and reports the result", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.runMaintenance).mockImplementation(async (_kind, onProgress) => {
      onProgress?.(1, 3);
      onProgress?.(3, 3);
      return { updated: 3, skipped: 1, failed: [{ id: "a9", reason: "No route" }] };
    });
    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    expect(value.runMaintenance).toHaveBeenCalledWith("distances", expect.any(Function));
    expect(
      await screen.findByText(/Recomputed 3 apartments \(1 failed\) \(1 skipped — no address\)/i)
    ).toBeInTheDocument();
  });

  it("shows progress while recomputing", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    let finish: (r: { updated: number; skipped: number; failed: [] }) => void = () => {};
    vi.mocked(value.runMaintenance).mockImplementation(
      (_kind, onProgress) =>
        new Promise((resolve) => {
          onProgress?.(1, 4);
          finish = resolve;
        })
    );
    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    expect(await screen.findByText(/Recomputing… 1 of 4/)).toBeInTheDocument();
    finish({ updated: 4, skipped: 0, failed: [] });
    expect(await screen.findByText(/Recomputed 4 apartments/)).toBeInTheDocument();
  });

  it("shows an error when the maintenance run itself throws", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.runMaintenance).mockRejectedValue(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: /Recompute all/i }));
    expect(await screen.findByText(/Couldn't recompute distances/i)).toBeInTheDocument();
  });

  it("disables Recompute when there are no locations, and Add at the 5-location limit", () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      makeLocationView({ id: `loc-${i}`, label: `Loc ${i + 1}`, address: `Addr ${i + 1}`, sortOrder: i })
    );
    setup({ locations: five });
    expect(screen.getByRole("button", { name: /Add location/i })).toBeDisabled();
    expect(screen.getByText(/5 of 5/)).toBeInTheDocument();
    cleanup();
    setup({ locations: [] });
    expect(screen.getByRole("button", { name: /Recompute all/i })).toBeDisabled();
    expect(screen.getByText(/No locations yet/)).toBeInTheDocument();
  });

  it("shows the store's load error", () => {
    setup({ status: "error", error: "Failed to load household data", locations: [] });
    expect(screen.getByText(/Couldn't load locations/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/app/settings`
Expected: FAIL — the page still fetches `/api/locations`.

- [ ] **Step 3: Rewrite `src/app/settings/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";
import { EncryptionSettings } from "@/components/crypto/encryption-settings";
import { HouseholdSettings } from "@/components/household-settings";
import {
  LocationIconDisplay,
  LocationIconPicker,
} from "@/components/location-icon-picker";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { newRowId } from "@/lib/household-data/ids";
import type { LocationView } from "@/lib/household-data/types";
import { MAX_LOCATIONS, type LocationIconName } from "@/lib/location-icons";
import { type ErrorDetails, errorDetailsFromException } from "@/lib/fetch-error";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

type Editing =
  | { kind: "create"; label: string; icon: string; address: string }
  | {
      kind: "edit";
      id: string;
      label: string;
      icon: string;
      address: string;
      original: { label: string; icon: string; address: string };
    };

export default function SettingsPage() {
  const {
    status,
    error: loadError,
    locations,
    createLocation,
    updateLocation,
    deleteLocation,
    moveLocation,
    runMaintenance,
  } = useHouseholdData();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeProgress, setRecomputeProgress] = useState<[number, number] | null>(null);
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  function startCreate() {
    setEditing({ kind: "create", label: "", icon: "Train", address: "" });
  }

  function startEdit(loc: LocationView) {
    setEditing({
      kind: "edit",
      id: loc.id,
      label: loc.label,
      icon: loc.icon,
      address: loc.address,
      original: { label: loc.label, icon: loc.icon, address: loc.address },
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function handleSave() {
    if (!editing) return;
    const label = editing.label.trim();
    const address = editing.address.trim();
    if (label === "" || address === "") return;

    setSaving(true);
    try {
      if (editing.kind === "create") {
        // Coordinates are null here; the store geocodes the address and
        // computes distances before the row is persisted.
        await createLocation(newRowId(), {
          label,
          icon: editing.icon,
          address,
          latitude: null,
          longitude: null,
        });
      } else {
        const icon = editing.icon;
        await updateLocation(editing.id, (current) => ({ ...current, label, icon, address }));
      }
      setEditing(null);
      setError(null);
    } catch (err) {
      setError({
        headline: "Couldn't save location",
        details: errorDetailsFromException(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete "${label}"? Apartments will lose this distance.`)) return;
    try {
      await deleteLocation(id);
    } catch (err) {
      setError({
        headline: "Couldn't delete location",
        details: errorDetailsFromException(err),
      });
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    try {
      await moveLocation(id, direction);
    } catch (err) {
      setError({ headline: "Couldn't reorder", details: errorDetailsFromException(err) });
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    setRecomputeProgress(null);
    setRecomputeResult(null);
    try {
      const report = await runMaintenance("distances", (done, total) =>
        setRecomputeProgress([done, total])
      );
      setRecomputeResult(
        `Recomputed ${report.updated} apartments` +
          (report.failed.length > 0 ? ` (${report.failed.length} failed)` : "") +
          (report.skipped > 0 ? ` (${report.skipped} skipped — no address)` : "")
      );
      setError(null);
    } catch (err) {
      setError({
        headline: "Couldn't recompute distances",
        details: errorDetailsFromException(err),
      });
    } finally {
      setRecomputing(false);
      setRecomputeProgress(null);
    }
  }

  const loaded = status === "ready";
  const canAdd = locations.length < MAX_LOCATIONS;
  const editingDirty =
    editing?.kind === "create"
      ? editing.label.trim() !== "" && editing.address.trim() !== ""
      : editing
        ? editing.label.trim() !== "" &&
          editing.address.trim() !== "" &&
          (editing.label.trim() !== editing.original.label ||
            editing.icon !== editing.original.icon ||
            editing.address.trim() !== editing.original.address)
        : false;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <EncryptionSettings />
      <HouseholdSettings />

      {status === "error" && (
        <ErrorDisplay
          headline="Couldn't load locations"
          details={{ message: loadError ?? undefined, timestamp: new Date().toISOString() }}
        />
      )}
      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Locations of interest ({locations.length} of {MAX_LOCATIONS})
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={startCreate}
            disabled={!canAdd || editing !== null}
            className="h-11 gap-1 sm:h-8"
          >
            <Plus className="h-4 w-4" />
            Add location
          </Button>
        </div>

        {loaded && locations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No locations yet. Apartments will hide their distance section until you
            add one.
          </p>
        )}

        <div className="divide-y rounded-md border">
          {locations.map((loc, i) => (
            <div key={loc.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <LocationIconDisplay
                name={loc.icon}
                className="h-5 w-5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{loc.label}</div>
                <div className="truncate text-xs text-muted-foreground">{loc.address}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                  aria-label={`Move ${loc.label} up`}
                  onClick={() => void handleMove(loc.id, "up")}
                  disabled={i === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                  aria-label={`Move ${loc.label} down`}
                  onClick={() => void handleMove(loc.id, "down")}
                  disabled={i === locations.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                  aria-label={`Edit ${loc.label}`}
                  onClick={() => startEdit(loc)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
                  aria-label={`Delete ${loc.label}`}
                  onClick={() => void handleDelete(loc.id, loc.label)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {editing && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">
              {editing.kind === "create" ? "Add location" : "Edit location"}
            </h3>
            <div className="space-y-2">
              <Label htmlFor="loc-label">Label</Label>
              <Input
                id="loc-label"
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                placeholder="Work, Home, Gym, …"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-address">Address</Label>
              <Input
                id="loc-address"
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                placeholder="Street, postcode, city"
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIconPickerOpen(true)}
                className="gap-2"
                aria-label="Pick icon"
              >
                <LocationIconDisplay name={editing.icon} className="h-4 w-4" />
                Change
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={() => void handleSave()} disabled={!editingDirty || saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recompute distances</h2>
        <p className="text-sm text-muted-foreground">
          Rebuild bike and transit minutes for every apartment × location pair.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => void handleRecompute()}
            className="h-11 sm:h-8"
            disabled={recomputing || locations.length === 0}
          >
            {recomputing
              ? recomputeProgress
                ? `Recomputing… ${recomputeProgress[0]} of ${recomputeProgress[1]}`
                : "Recomputing…"
              : "Recompute all"}
          </Button>
          {recomputeResult && (
            <span className="text-sm text-muted-foreground">{recomputeResult}</span>
          )}
        </div>
      </section>

      <LocationIconPicker
        open={iconPickerOpen}
        selected={editing?.icon ?? ""}
        onPick={(name: LocationIconName) => {
          if (editing) setEditing({ ...editing, icon: name });
          setIconPickerOpen(false);
        }}
        onClose={() => setIconPickerOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the settings tests**

Run: `npx vitest run src/app/settings`
Expected: PASS.

- [ ] **Step 5: Whole-suite checkpoint**

This is the first task after which every page reads the store, so the suite should be green here even though Task 17 is the gate:

Run: `npm test && npm run typecheck && npm run lint`
Expected: all three pass. Any failure belongs to this task or an earlier one — fix it before committing (Task 17 only adds docs and re-runs the gates).

- [ ] **Step 6: Commit**

```bash
git add src/app/settings
git commit -m "feat(settings): manage locations and recompute distances through the store

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

---

### Task 17: Docs, enola re-pin, full gate, PR

**Files:**
- Modify: `AGENTS.md` (Database bullets, Auth `requireHousehold` bullet, Encryption layering bullet, new `## Data (E3)` section, `## File uploads` rewritten, `## Architecture checks (enola)` E3 bullet)
- Modify: `docs/security-notes.md` (new `## Encrypted data — reviewed 2026-09-07 (E3)` section)
- Modify: `docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md` (dated deviation note under `## E3 — Encrypted data model`)

**Interfaces:**
- Consumes: everything Tasks 1–16 produced; nothing new is written in `src/`.
- Produces: the merged state of the branch. This task is the gate: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:coverage` and `enola check --fail-on=cycles` all pass here, and the enola baseline is re-pinned here and nowhere else.

Spec §Rollout, docs, architecture lists exactly what the docs must say; each step below quotes the sentence it satisfies.

- [ ] **Step 1: Confirm the tree is what Task 16 left**

```bash
git status --short
git log --oneline main..HEAD | wc -l
```

Expected: clean tree, 17 or more commits ahead of `main` (spec + plan + one or more per task). If `git status` shows changes, stop and find which task left them uncommitted before touching docs.

- [ ] **Step 2: AGENTS.md — Database bullets**

In `AGENTS.md`, under `## Database`, **after** the bullet that begins `**Upgrading a database that already holds rows requires choosing the encryption mode by hand.**`, insert:

```markdown
- **Migration 0014 (E3) dropped the plaintext data tables** (`apartments`, `ratings`, `locations_of_interest`, `apartment_distances`) and created three envelope tables (`apartments`, `ratings`, `locations`) keyed by client-minted UUIDs. There is no data migration: `preflightEncryptedModelMigration` in `src/lib/db/migrate.ts` throws before 0014 runs if any of the four old tables holds rows, naming them, so a pre-E3 database has to be wiped by hand first (the hosted one was wiped before deploying, same posture as E1). The four legacy runtime backfills (`ensureListingUrlColumn`, `reconcileHasWashingMachine`, `backfillShortCodes`, `migrateLocationsOfInterestBackfill`) are gone with the columns they patched; `preflightTenancyMigration` stays. Known limit, unchanged by E3: `scripts/vercel-build.mjs` runs `drizzle-kit migrate` at build time and bypasses the runtime preflights (#211).
```

- [ ] **Step 3: AGENTS.md — Auth `requireHousehold` bullet**

Replace the bullet that begins `**\`src/lib/session.ts\` exports \`requireHousehold()\`**` with:

```markdown
- **`src/lib/session.ts` exports `requireHousehold()`** — the shared authentication *and* tenant-scope check for route handlers. It reads the session, throws `UnauthorizedError` (from `src/lib/household.ts`) when there's no authenticated household, and otherwise returns `{ householdId, userId, role }`. **Since E3, every data route calls `requireMember()` from `src/lib/api-route.ts` instead**, which wraps `requireHousehold()` and re-checks membership against the `household_members` table on every request — reads included — and turns a non-member into `404` (never `403`, which would confirm the row exists in another household). `requireHousehold()` alone is still what the crypto, invitation and household routes use. Both are defense-in-depth, since the proxy allow-lists `/api/auth/*` wholesale and route handlers are the last line for anything under it.
```

- [ ] **Step 4: AGENTS.md — Encryption layering bullet**

In `## Encryption (E2)`, find the bullet beginning `**Layering rule, enforced by ESLint`. Immediately after its nested `Hand-verified 2026-09-06` sub-bullet, add a second sub-bullet:

```markdown
  - **E3 extends the layering one level up:** `src/lib/household-data/**` is the pure data layer (types, zod schemas, wire shapes, ids, codec, derivation, enrichment planners, maintenance planners, concurrency helper). It imports nothing outside itself except `@/lib/crypto`. `src/components/household-data/**` is the only place that combines the codec with `fetch` (`api-client.ts`, `process-client.ts`, `pdf-files.ts`, `enrichment.ts`, `household-data-provider.tsx`). Route handlers import types from `@/lib/household-data/wire` and nothing else from that tree. Pages import `useHouseholdData` and the plaintext types; they never import the codec or call `fetch` for household data.
```

- [ ] **Step 5: AGENTS.md — new `## Data (E3)` section**

Insert a new section **between** `## Encryption (E2)` and `## PWA`:

```markdown
## Data (E3)

- **Three envelope tables**, `apartments`, `ratings`, `locations` (`src/lib/db/schema.ts`), each with a text `envelope` column holding E2's `Envelope` JSON — `{ v: 1, iv, ct }` when `FLATPARE_ENCRYPTION=on`, `{ v: 0, data }` when `off`. The server never parses `envelope`; route handlers only check its version matches the deployment's mode (`requireEnvelopeMode`, 400 on mismatch, before any write). Everything user-supplied — name, address, rent, rooms, coordinates, distances, the short code, rating scores and comments, location labels — lives *inside* the envelope. What stays plaintext, and why, is the table in the spec's Data model section: ids, `household_id`, timestamps, `version`, `sort_order` on locations, and `(apartment_id, user_id)` on ratings — the columns the server needs to scope, order and upsert without reading anything.
- **Plaintext shapes** live in `src/lib/household-data/types.ts` (`Apartment`, `Rating`, `Location`, plus `ApartmentPdf`, `ApartmentDistance`) with zod schemas in `schemas.ts`; the wire rows (`ApartmentRow`, `RatingRow`, `LocationRow`) in `wire.ts`. Adding a field means: type + schema (with a default so old envelopes still validate) + `emptyApartment()`; no migration.
- **AAD convention** (`src/lib/household-data/codec.ts`): every row is sealed with `envelopeAad(householdId, table, rowId)` = `"<householdId>:<table>:<rowId>"`, where a rating's row id is `"<apartmentId>:<userId>"`. A ciphertext therefore cannot be moved between rows, tables or households by anyone holding only the database. A row that fails to open or to validate decodes to `null` and shows up in the UI as a **corrupt** placeholder (`ApartmentView.corrupt`), never as a crash.
- **Ids are client-minted UUIDs**: `newRowId()` (`src/lib/household-data/ids.ts`, `crypto.randomUUID()`); routes validate with `z.uuid()`. `POST` with an id that already exists is `409 { error: "Duplicate id" }`.
- **`version`** on apartments is bumped by the server on every successful write. `PUT /api/apartments/:id` carries the version the client read; a mismatch is `409 { error: "Stale version", version }`. The store (`updateApartment`) refetches, re-applies the mutator and retries **once**, then throws. Ratings (one writer per row) and locations (at most five) carry no version; last write wins.
- **Routes** (`src/app/api/{apartments,ratings,locations}/**`): every handler is `requireMember()` → `parseBody` → work, and answers 404 for unknown *and* foreign rows. `GET /api/apartments`, `GET /api/ratings`, `GET /api/locations` return the household's rows; `PUT /api/apartments/:id/ratings/me` and `DELETE …/ratings/me` are the only rating writes (a member can only rate as themselves). `MAX_LOCATIONS = 5` is enforced server-side (`409 Too many locations`) and mirrored in the settings page.
- **`/api/process/*` never writes.** `geocode`, `distance`, `check-listing` and `parse-pdf` are blind proxies: plaintext in, third-party result out, no table touched (each has a test asserting every row count is unchanged). This is the documented **privacy exception** — the server sees one address, one URL or one PDF per call, in memory, and does not log the body. E4 hardens them (rate limits, log scrubbing); the comment at the top of each route names the exception.
- **Client store**: `src/components/household-data/household-data-provider.tsx` loads the three tables once per signed-in layout (mounted by `src/components/crypto/crypto-gate.tsx` beneath `CryptoProvider`, so `dataKey` is available), decodes them, and exposes `useHouseholdData()` — `apartments: ApartmentView[]`, `locations: LocationView[]`, and the write methods (`createApartment`, `updateApartment(id, mutate)`, `deleteApartment`, `rateApartment`, `createLocation`, `updateLocation`, `deleteLocation`, `moveLocation`, `runMaintenance`). Sorting, search, averages and distances are derived in the browser (`src/lib/household-data/derive.ts`, `src/lib/apartment-sort.ts`); nothing user-visible is computed server-side. Enrichment (geocode → short code → distances) runs client-side after a write through `enrichment.ts` and re-writes the row; a failure lands in `enrichmentError[id]` and `retryEnrichment(id)`.
- **Removed routes**: `/api/apartments/check-listings`, `/api/apartments/:id/reprocess`, `/api/apartments/:id/ratings` (POST), `/api/geocode`, `/api/settings/recompute-distances`, `/api/parse-pdf` (the extraction now lives at `/api/process/parse-pdf`; the upload token moved to `/api/files/upload-token`). Their work moved into the store's `runMaintenance("listings" | "distances" | "geocode")` and the detail page's Reprocess.
- **Fixtures for page tests**: `src/components/household-data/__tests__/fake-household-data.tsx` exports `makeApartmentView`, `makeLocationView`, `makeHouseholdData` and `renderWithHouseholdData(ui, overrides)`, which renders under a fake context whose write methods are `vi.fn()`s. Page tests assert on those, never on `fetch`.
```

- [ ] **Step 6: AGENTS.md — rewrite `## File uploads`**

Replace the whole `## File uploads` section with:

```markdown
## File uploads
- **PDFs are encrypted in the browser before upload** (`src/components/household-data/pdf-files.ts`: `encryptAndUploadPdf` / `downloadPdf`, over `sealBytes` / `openBytes` from `@/lib/crypto`). The stored object is `households/<householdId>/<apartmentId>.pdf.enc` — AES-256-GCM ciphertext with AAD `"<householdId>:pdf:<apartmentId>"` when encryption is on, the raw PDF bytes with `iv: null` when off. The server stores and serves it as `application/octet-stream` and never learns which. The apartment envelope carries `pdf: { path, iv } | null`.
- **Transport**: `uploadEncryptedFile(bytes, apartmentId)` in `src/lib/upload-pdf.ts` probes `GET /api/files/upload-token`; when Blob is enabled (`BLOB_READ_WRITE_TOKEN`, auto-set by Vercel) it uploads client-direct to Vercel Blob with a token scoped to that path, otherwise it multipart-POSTs to `/api/files` (local-disk fallback via `src/lib/storage.ts`). Files larger than ~4.5 MB **must** take the Blob path — serverless routes hit the body limit — which is why the probe exists.
- **Reading back**: `/api/pdf/[...path]` (Blob) and `/api/uploads/[...path]` (local disk) stream the ciphertext to a signed-in member of the owning household; the client decrypts and opens a `blob:` URL. There is no server-side "view PDF" any more.
- **Extraction** goes through `POST /api/process/parse-pdf` (multipart, plaintext PDF, Gemini) — the privacy exception above. The PDF the user uploads is sent there *and* encrypted for storage; the server keeps only the ciphertext.
- Deleting an apartment deletes its file (`deleteStoredFile` in `src/lib/storage.ts`, called by `DELETE /api/apartments/:id` with the `pdfPath` the client sends, validated to belong to the household).
```

- [ ] **Step 7: AGENTS.md — enola E3 bullet**

In `## Architecture checks (enola)`, after the bullet that begins `E2 re-pinned the baseline`, add:

```markdown
- E3 re-pinned the baseline after replacing the data layer: `src/lib/household-data/**`, `src/components/household-data/**`, `src/lib/data-rows.ts`, `src/lib/process-schemas.ts`, `src/lib/crypto/bytes.ts`, the `/api/process`, `/api/files`, `/api/ratings` route trees, and the removal of `src/lib/map-embed.ts`, `src/lib/short-code.ts`, `src/components/apartment-map.tsx` and the `/api/geocode`, `/api/settings`, `/api/parse-pdf` trees. Intended layering: `src/components/household-data → src/lib/household-data → src/lib/crypto`; `src/lib/household-data` imports nothing from `src/app` or `src/components`; routes import `src/lib/household-data/wire` types only.
```

- [ ] **Step 8: `docs/security-notes.md` — the E3 section**

Append to the end of `docs/security-notes.md`:

```markdown

## Encrypted data — reviewed 2026-09-07 (E3 encrypted data model)

Spec: `docs/superpowers/specs/2026-09-07-e3-encrypted-data-model-design.md`. Apartments,
ratings and locations are stored as E2 envelopes sealed with the household data key;
the server scopes, orders and versions rows but never reads them. PDFs are encrypted
client-side before upload. Below are the limits that were accepted, not oversights.

### Accepted: the server sees metadata

Ids, `household_id`, `created_at`/`updated_at`, `version`, a location's `sort_order`,
and `(apartment_id, user_id)` on ratings are plaintext because the server needs them to
scope, order and upsert. So the host can see how many apartments a household has, when
each was created and last edited, which member rated which apartment and when, how many
locations of interest exist and their order, and the byte size of each stored PDF. None
of it says *what* an apartment is. The short code was moved inside the envelope for
exactly this reason — it encodes rooms, bathrooms, washing machine and postcode.

### Accepted: whole-row last-write-wins after one retry

An apartment envelope is one value. Two members editing the same apartment at once
race on `version`; the loser gets `409 Stale version`, the store refetches, re-applies
its mutator on the fresh plaintext and retries once. A second conflict in a row
surfaces as an error to the user. Field-level merging would need the server to read the
row; it cannot. Ratings have one writer per row and locations are at most five, so
they carry no version at all.

### Accepted: process endpoints see plaintext in memory

`/api/process/{geocode,distance,check-listing,parse-pdf}` receive one address, one
URL or one PDF per call, forward it to Google or Gemini with the host's keys, and
return the result. They touch no table (each has a test that asserts every row count is
unchanged) and do not log bodies. This is the privacy exception the parent spec
names, and it is documented at the top of each route. E4 hardens it — per-account
rate limits, log scrubbing on every code path, the landing-page disclosure — but does
not remove it: the host cannot geocode what it cannot read.

### Accepted: a removed member can open ciphertext they already fetched

`requireMember()` re-checks the database on every data read, so a removed member's
still-valid JWT stops returning rows immediately. But ciphertext they fetched *before*
removal, and the data key cached in their device store, remain usable offline. Closing
this needs data-key rotation on removal, tracked as #219.

### Accepted: corrupt rows are shown, not hidden

A row whose envelope fails to open or to validate renders as a placeholder marked
*could not be decrypted* with a Delete button, and is excluded from sorting, search and
the compare table. Hiding it would let a corrupted or tampered row disappear silently;
showing it makes tampering visible to every member.
```

- [ ] **Step 9: Parent spec — deviation note**

In `docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md`, at the end of the `## E3 — Encrypted data model` section (immediately before the line `## E4 — Blind-proxy processing`), insert:

```markdown
> **Note, 2026-09-07 (E3 spec):** as built, E3 deviates from the paragraph above in
> four dated ways, recorded in
> `docs/superpowers/specs/2026-09-07-e3-encrypted-data-model-design.md`
> (*Deviations from the parent spec*): the short code lives inside the encrypted blob
> rather than as a plaintext column; the `(ciphertext, iv)` pair is one `envelope`
> column holding E2's `Envelope` JSON; the `/api/process/*` blind proxies ship in E3
> as thin conversions of the existing lib functions (E4 hardens them); and stored PDFs
> are encrypted client-side before upload.

```

- [ ] **Step 10: Grade the architecture with enola**

Using the enola MCP tools: run `generate_snapshot`, then `diff_snapshot` against the baseline pinned before Task 1. Read the diff. Expected: new symbols under `src/lib/household-data`, `src/components/household-data`, `src/app/api/process`, `src/app/api/files`, `src/app/api/ratings`; removed symbols for the deleted routes and libs; **no new cycle finding** beyond the accepted `src ↔ src/lib` cycle. If the diff shows a cycle involving `src/lib/household-data` or `src/components/household-data`, it is a defect in an earlier task — fix the import (the layering rule in Global Constraints says which direction is allowed), commit the fix with a `fix(arch):` message, and re-run the diff before continuing.

Then re-pin and check:

```bash
enola baseline pin
enola check --fail-on=cycles
```

Expected: `PASS`. This is the only task allowed to run `enola baseline pin`.

- [ ] **Step 11: The full gate**

```bash
npm test
npm run typecheck
npm run lint
npm run test:coverage
```

Expected: every command exits 0; coverage reports lines ≥ 80, statements ≥ 80, functions ≥ 78, branches ≥ 75. A coverage shortfall is fixed by adding tests to the file that dropped (check the per-file table at the bottom of the coverage output), never by excluding it in `vitest.config.ts`. A red test here belongs to the task that owns the file; fix it in place and commit with the message `fix(<area>): <what>` plus the trailers.

Also confirm nothing still references the removed surface:

```bash
grep -rn "api/geocode\|api/settings/recompute\|api/parse-pdf\b\|check-listings\|/reprocess\|map-embed\|@/lib/short-code\|apartment-map\"" src --include='*.ts' --include='*.tsx' | grep -v __tests__
grep -rn "locationsOfInterest\|apartmentDistances\|ApartmentWithRatings" src
```

Expected: both greps print nothing.

- [ ] **Step 12: Commit the docs**

```bash
git add AGENTS.md docs/security-notes.md docs/superpowers/specs/2026-09-01-accounts-e2ee-billing-design.md
git commit -m "docs: record the E3 encrypted data model, its accepted limits and the parent-spec deviations

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH"
```

- [ ] **Step 13: Push and open the PR**

```bash
git push -u origin feat/e3-encrypted-data-model
gh pr create --base main --title "feat: E3 encrypted data model (#185)" --body "$(cat <<'BODY'
Closes #185.

Apartments, ratings and locations are now client-encrypted envelope blobs sealed with the E2 household data key. The server stores, versions and scopes them but never reads them; every derived view (sort, search, averages, distances) is computed in the browser from one `HouseholdDataProvider` store.

## What changed

- **Migration 0014** drops the four plaintext data tables and creates `apartments` / `ratings` / `locations` envelope tables keyed by client-minted UUIDs, with `version` on apartments. `preflightEncryptedModelMigration` refuses to run against a database that still holds plaintext rows (there is no data migration — the hosted DB is wiped by hand before deploying, as in E1).
- **Data routes** accept and return envelopes only; every handler is `requireMember()` (database membership re-check on reads too) → `parseBody` → work, with the 400/404/409/413 contract from the spec.
- **`/api/process/{geocode,distance,check-listing,parse-pdf}`** — blind proxies that touch no table, each with a row-count-unchanged test. These are the E4 plumbing; E4 is now hardening only.
- **PDFs are encrypted client-side** (`sealBytes` / `openBytes`) and stored as opaque bytes via `/api/files` (multipart) or the Blob client path (`/api/files/upload-token`). View PDF and Reprocess decrypt in the browser.
- **`src/lib/household-data`** (pure: types, schemas, codec with per-row AAD, derivation, enrichment and maintenance planners) and **`src/components/household-data`** (the store, API/process clients, enrichment runner) replace all server-side computation. The five pages read `useHouseholdData()`; the detail page's map is a Leaflet pin instead of a Maps Embed iframe.
- Removed: `/api/geocode`, `/api/settings/recompute-distances`, `/api/apartments/check-listings`, `/api/apartments/:id/reprocess`, `POST /api/apartments/:id/ratings`, `/api/parse-pdf`, `src/lib/map-embed.ts`, `src/lib/short-code.ts`.

## Docs

`AGENTS.md` gains a `## Data (E3)` section and a rewritten `## File uploads`; `docs/security-notes.md` records the accepted limits (visible metadata, whole-row last-write-wins after one retry, plaintext in process endpoints, removed members' cached keys, corrupt rows shown not hidden); the parent spec carries the dated deviations note.

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:coverage` green locally.
- `enola check --fail-on=cycles` PASS; baseline re-pinned.
- Deployment stays deferred; the hosted database must be wiped before this ships.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_017Acu2MRuYDm6YjLjiqZYsH
BODY
)"
```

Report the PR URL. **Do not merge**: merging waits for green GitHub Actions and the user's go-ahead (squash: `gh pr merge <N> --squash --delete-branch`).

- [ ] **Step 14: Leave the scoping comment on #186**

After the PR exists (not after merge — the comment references the PR number):

```bash
gh issue comment 186 --body "$(cat <<'BODY'
E3 (#185, PR <PR-URL>) shipped the `/api/process/*` plumbing this issue described: `geocode`, `distance`, `check-listing` and `parse-pdf` exist as blind proxies that touch no table (each has a row-count-unchanged test), results go back to the client for encryption, and the privacy exception is documented at the top of each route and in `docs/security-notes.md`.

What remains for E4 is hardening only:
- per-account rate limiting on the four routes (they spend the host's money);
- no request/response bodies in logs on any code path, including errors (`console.error` in the catch blocks still prints the thrown error's message — audit those);
- the privacy-exception disclosure on the landing page (E7 territory, coordinate there).

#199 (private-address block) stays open and is unaffected.
BODY
)"
```

Replace `<PR-URL>` with the URL from Step 13 before running.
