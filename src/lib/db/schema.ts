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
