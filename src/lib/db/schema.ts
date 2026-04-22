import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const apartments = sqliteTable("apartments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  sizeM2: real("size_m2"),
  numRooms: real("num_rooms"),
  numBathrooms: integer("num_bathrooms"),
  numBalconies: integer("num_balconies"),
  rentChf: real("rent_chf"),
  distanceBikeMin: integer("distance_bike_min"),
  distanceTransitMin: integer("distance_transit_min"),
  pdfUrl: text("pdf_url"),
  listingUrl: text("listing_url"),
  rawExtractedData: text("raw_extracted_data"),
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
  service: text("service").notNull(), // "gemini" | "google_maps"
  operation: text("operation").notNull(), // "parse_pdf" | "calculate_distance"
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;
export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiUsage = typeof apiUsage.$inferSelect;
