import {
  sqliteTable,
  text,
  integer,
  real,
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

export const apartments = sqliteTable("apartments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  sizeM2: real("size_m2"),
  numRooms: real("num_rooms"),
  numBathrooms: integer("num_bathrooms"),
  numBalconies: integer("num_balconies"),
  hasWashingMachine: integer("has_washing_machine", { mode: "boolean" }),
  rentChf: real("rent_chf"),
  pdfUrl: text("pdf_url"),
  listingUrl: text("listing_url"),
  shortCode: text("short_code").unique(),
  rawExtractedData: text("raw_extracted_data"),
  userEditedFields: text("user_edited_fields"),
  summary: text("summary"),
  availableFrom: text("available_from"),
  listingGone: integer("listing_gone", { mode: "boolean" }).default(false),
  listingCheckedAt: integer("listing_checked_at", { mode: "timestamp" }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const ratings = sqliteTable(
  "ratings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    apartmentId: integer("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kitchen: integer("kitchen").default(0),
    balconies: integer("balconies").default(0),
    location: integer("location").default(0),
    floorplan: integer("floorplan").default(0),
    overallFeeling: integer("overall_feeling").default(0),
    comment: text("comment").default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [
    uniqueIndex("ratings_apartment_user_idx").on(
      table.apartmentId,
      table.userId
    ),
  ]
);

export const locationsOfInterest = sqliteTable("locations_of_interest", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  icon: text("icon").notNull(),
  address: text("address").notNull(),
  sortOrder: integer("sort_order").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const apartmentDistances = sqliteTable(
  "apartment_distances",
  {
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    apartmentId: integer("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locationsOfInterest.id, { onDelete: "cascade" }),
    bikeMin: integer("bike_min"),
    transitMin: integer("transit_min"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => [
    primaryKey({ columns: [table.apartmentId, table.locationId] }),
  ]
);

export type Apartment = typeof apartments.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type LocationOfInterest = typeof locationsOfInterest.$inferSelect;

export { users, accounts, sessions, verificationTokens } from "./schema-auth";
