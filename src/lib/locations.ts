import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  locationsOfInterest,
  type LocationOfInterest,
} from "@/lib/db/schema";
import {
  isLocationIconName,
  MAX_LOCATIONS,
} from "@/lib/location-icons";
import { geocodeLatLng } from "@/lib/geocode";

type LocationInput = {
  label: string;
  icon: string;
  address: string;
};

// Every function here takes the caller's household as its FIRST parameter and
// filters on it. It is required, not optional, so the compiler enumerates any
// future call site instead of relying on each one to remember — the same
// reasoning as `readStoredFile`'s required `expectedHouseholdId`.
//
// A row belonging to another household is indistinguishable from a row that
// does not exist: lookups return null / throw "not found", never a distinct
// "forbidden". A 403 would confirm the id exists somewhere else.

function normalizeInput(input: LocationInput): LocationInput {
  const label = input.label.trim();
  const icon = input.icon.trim();
  const address = input.address.trim();
  if (label === "") throw new Error("Label cannot be empty");
  if (address === "") throw new Error("Address cannot be empty");
  if (!isLocationIconName(icon)) {
    throw new Error(`Unknown icon: ${icon}`);
  }
  return { label, icon, address };
}

function scoped(householdId: number, id: number) {
  return and(
    eq(locationsOfInterest.id, id),
    eq(locationsOfInterest.householdId, householdId)
  );
}

export async function listLocations(
  householdId: number
): Promise<LocationOfInterest[]> {
  return db
    .select()
    .from(locationsOfInterest)
    .where(eq(locationsOfInterest.householdId, householdId))
    .orderBy(asc(locationsOfInterest.sortOrder), asc(locationsOfInterest.id));
}

export async function getLocation(
  householdId: number,
  id: number
): Promise<LocationOfInterest | null> {
  const rows = await db
    .select()
    .from(locationsOfInterest)
    .where(scoped(householdId, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createLocation(
  householdId: number,
  input: LocationInput
): Promise<LocationOfInterest> {
  const normalized = normalizeInput(input);

  const existing = await listLocations(householdId);
  if (existing.length >= MAX_LOCATIONS) {
    throw new Error(`Cannot have more than ${MAX_LOCATIONS} locations`);
  }
  const nextSortOrder = existing.length === 0
    ? 0
    : Math.max(...existing.map((l) => l.sortOrder)) + 1;

  const [created] = await db
    .insert(locationsOfInterest)
    .values({ ...normalized, householdId, sortOrder: nextSortOrder })
    .returning();

  try {
    const coords = await geocodeLatLng(created.address);
    if (coords) {
      const [withCoords] = await db
        .update(locationsOfInterest)
        .set({ latitude: coords.lat, longitude: coords.lng })
        .where(scoped(householdId, created.id))
        .returning();
      return withCoords ?? created;
    }
  } catch (err) {
    console.error(`[locations:create] geocode failed loc=${created.id}:`, err);
  }
  return created;
}

export async function updateLocation(
  householdId: number,
  id: number,
  input: Partial<LocationInput>
): Promise<LocationOfInterest> {
  const updates: Partial<LocationInput> = {};
  if (input.label !== undefined) {
    const trimmed = input.label.trim();
    if (trimmed === "") throw new Error("Label cannot be empty");
    updates.label = trimmed;
  }
  if (input.address !== undefined) {
    const trimmed = input.address.trim();
    if (trimmed === "") throw new Error("Address cannot be empty");
    updates.address = trimmed;
  }
  if (input.icon !== undefined) {
    const trimmed = input.icon.trim();
    if (!isLocationIconName(trimmed)) {
      throw new Error(`Unknown icon: ${trimmed}`);
    }
    updates.icon = trimmed;
  }

  const previous = await getLocation(householdId, id);
  const addressChanged =
    updates.address !== undefined &&
    previous !== null &&
    updates.address !== previous.address;

  const [updated] = await db
    .update(locationsOfInterest)
    .set({ ...updates, updatedAt: new Date() })
    .where(scoped(householdId, id))
    .returning();
  if (!updated) throw new Error(`Location ${id} not found`);

  if (addressChanged) {
    try {
      const coords = await geocodeLatLng(updated.address);
      const [withCoords] = await db
        .update(locationsOfInterest)
        .set({
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        })
        .where(scoped(householdId, id))
        .returning();
      return withCoords ?? updated;
    } catch (err) {
      console.error(`[locations:update] geocode failed loc=${id}:`, err);
    }
  }

  return updated;
}

// Returns false when the id does not exist in this household, so the route can
// answer 404 instead of reporting success for a row it never touched.
export async function deleteLocation(
  householdId: number,
  id: number
): Promise<boolean> {
  const deleted = await db
    .delete(locationsOfInterest)
    .where(scoped(householdId, id))
    .returning({ id: locationsOfInterest.id });
  return deleted.length > 0;
}

export async function moveLocation(
  householdId: number,
  id: number,
  direction: "up" | "down"
): Promise<void> {
  const all = await listLocations(householdId);
  const idx = all.findIndex((l) => l.id === id);
  if (idx === -1) throw new Error(`Location ${id} not found`);
  const swapWith = direction === "up" ? all[idx - 1] : all[idx + 1];
  if (!swapWith) return; // already at boundary

  const current = all[idx];
  // Two updates with a temporary order to dodge any uniqueness on sort_order
  // (we don't have one, but it's defensive against future indexes).
  const tempOrder = -Math.abs(current.sortOrder) - 1;
  await db
    .update(locationsOfInterest)
    .set({ sortOrder: tempOrder })
    .where(scoped(householdId, current.id));
  await db
    .update(locationsOfInterest)
    .set({ sortOrder: current.sortOrder })
    .where(scoped(householdId, swapWith.id));
  await db
    .update(locationsOfInterest)
    .set({ sortOrder: swapWith.sortOrder })
    .where(scoped(householdId, current.id));
}
