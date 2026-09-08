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

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Read by E5/E6. Present now so the column does not need adding later.
  tier: text("tier").notNull().default("free"),
  // Recovery kit: the data key AES-GCM-wrapped under a KEK derived from the
  // recovery code. All nullable — the owner may not have set up yet.
  recoveryWrappedKey: text("recovery_wrapped_key"),
  recoveryIv: text("recovery_iv"),
  recoveryKdfSalt: text("recovery_kdf_salt"),
  recoveryKdfMemoryKib: integer("recovery_kdf_memory_kib"),
  recoveryKdfIterations: integer("recovery_kdf_iterations"),
  recoveryKdfParallelism: integer("recovery_kdf_parallelism"),
  recoveryKdfVersion: integer("recovery_kdf_version"),
  recoveryCreatedAt: integer("recovery_created_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.userId] })]
);

export type Household = typeof households.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;

// Deployment-wide flags stamped at boot. Today it holds one key,
// `encryption_mode` (see src/lib/encryption-mode.ts).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// One row per user: their RSA-OAEP public key (SPKI, base64) and their
// private key wrapped under an Argon2id-derived KEK. The server never holds
// a passphrase or an unwrapped private key.
export const memberKeys = sqliteTable("member_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  wrappedPrivateKey: text("wrapped_private_key").notNull(),
  privateKeyIv: text("private_key_iv").notNull(),
  kdfSalt: text("kdf_salt").notNull(),
  kdfMemoryKib: integer("kdf_memory_kib").notNull(),
  kdfIterations: integer("kdf_iterations").notNull(),
  kdfParallelism: integer("kdf_parallelism").notNull(),
  kdfVersion: integer("kdf_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

// The household data key, RSA-OAEP-wrapped to one member's public key. A
// member without a row here has a key pair but cannot read household data
// yet ("pending wrap").
export const householdKeyWraps = sqliteTable(
  "household_key_wraps",
  {
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wrappedKey: text("wrapped_key").notNull(),
    wrappedBy: text("wrapped_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.userId] })]
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // Lowercased and trimmed before insert (src/lib/invitations.ts).
    email: text("email").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "accepted", "revoked", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    acceptedBy: text("accepted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [
    // One live invitation per address per household; history rows are kept.
    uniqueIndex("invitations_pending_household_email")
      .on(table.householdId, table.email)
      .where(sql`status = 'pending'`),
  ]
);

export type MemberKeyRow = typeof memberKeys.$inferSelect;
export type HouseholdKeyWrap = typeof householdKeyWraps.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;

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

// E4 rate limiting for the /api/process/* blind proxies, which spend the
// host's Gemini and Maps budget. Fixed one-hour windows: the point is
// bounding spend, not smoothing traffic, and a fixed window is one atomic
// upsert with no read-modify-write race.
//
// This table holds NO request content — a household id, an endpoint name,
// the hour bucket, and a count. E4's "no plaintext persisted at any layer"
// requirement invites the opposite reading, so it is worth stating: nothing
// here is derived from an address, a URL, or a PDF.
export const processUsage = sqliteTable(
  "process_usage",
  {
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    // Unix seconds, truncated to the hour.
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.householdId, table.endpoint, table.windowStart],
    }),
  ]
);

export type ApartmentRecord = typeof apartments.$inferSelect;
export type RatingRecord = typeof ratings.$inferSelect;
export type LocationRecord = typeof locations.$inferSelect;
export type ProcessUsageRecord = typeof processUsage.$inferSelect;

export { users, accounts, sessions, verificationTokens } from "./schema-auth";
