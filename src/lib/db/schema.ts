import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const apartments = sqliteTable("apartments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
    apartmentId: integer("apartment_id")
      .notNull()
      .references(() => apartments.id, { onDelete: "cascade" }),
    userName: text("user_name").notNull(),
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
      table.userName
    ),
  ]
);

export const users = sqliteTable("users", {
  name: text("name").primaryKey().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const apiUsage = sqliteTable("api_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  service: text("service").notNull(),
  operation: text("operation").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const locationsOfInterest = sqliteTable("locations_of_interest", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  icon: text("icon").notNull(),
  address: text("address").notNull(),
  sortOrder: integer("sort_order").notNull(),
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
export type NewApartment = typeof apartments.$inferInsert;
export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiUsage = typeof apiUsage.$inferSelect;
export type LocationOfInterest = typeof locationsOfInterest.$inferSelect;
export type NewLocationOfInterest = typeof locationsOfInterest.$inferInsert;
export type ApartmentDistance = typeof apartmentDistances.$inferSelect;
export type NewApartmentDistance = typeof apartmentDistances.$inferInsert;
