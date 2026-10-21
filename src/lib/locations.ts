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

// The cap is one conditional INSERT ... SELECT ... WHERE (count) < max, as in
// createApartmentRow: atomic without a transaction, so concurrent creates
// cannot overshoot MAX_LOCATIONS and never meet SQLITE_BUSY (#225). The next
// sort order is computed in the same statement for the same reason.
export async function createLocation(
  householdId: number,
  input: { id: string; envelope: string }
): Promise<LocationRecord> {
  const result = await db.run(sql`
    INSERT INTO locations (id, household_id, sort_order, envelope)
    SELECT ${input.id}, ${householdId},
      COALESCE((SELECT MAX(sort_order) + 1 FROM locations WHERE household_id = ${householdId}), 0),
      ${input.envelope}
    WHERE (
      SELECT COUNT(*) FROM locations WHERE household_id = ${householdId}
    ) < ${MAX_LOCATIONS}
  `);
  // No row means the WHERE was false. A duplicate id throws instead, and the
  // route turns that into 409 Duplicate id.
  if (Number(result.rowsAffected ?? 0) === 0) {
    throw new HouseholdError("Too many locations", 409);
  }
  // Read back through Drizzle for a typed record (timestamps as Dates).
  const [created] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, input.id))
    .limit(1);
  return created;
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
