import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  locationsOfInterest,
  type LocationOfInterest,
} from "@/lib/db/schema";
import {
  isLocationIconName,
  MAX_LOCATIONS,
} from "@/lib/location-icons";

export type LocationInput = {
  label: string;
  icon: string;
  address: string;
};

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

export async function listLocations(): Promise<LocationOfInterest[]> {
  return db
    .select()
    .from(locationsOfInterest)
    .orderBy(asc(locationsOfInterest.sortOrder), asc(locationsOfInterest.id));
}

export async function getLocation(
  id: number
): Promise<LocationOfInterest | null> {
  const rows = await db
    .select()
    .from(locationsOfInterest)
    .where(eq(locationsOfInterest.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createLocation(
  input: LocationInput
): Promise<LocationOfInterest> {
  const normalized = normalizeInput(input);

  const existing = await listLocations();
  if (existing.length >= MAX_LOCATIONS) {
    throw new Error(`Cannot have more than ${MAX_LOCATIONS} locations`);
  }
  const nextSortOrder = existing.length === 0
    ? 0
    : Math.max(...existing.map((l) => l.sortOrder)) + 1;

  const [created] = await db
    .insert(locationsOfInterest)
    .values({ ...normalized, sortOrder: nextSortOrder })
    .returning();
  return created;
}

export async function updateLocation(
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

  const [updated] = await db
    .update(locationsOfInterest)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(locationsOfInterest.id, id))
    .returning();
  if (!updated) throw new Error(`Location ${id} not found`);
  return updated;
}

export async function deleteLocation(id: number): Promise<void> {
  await db.delete(locationsOfInterest).where(eq(locationsOfInterest.id, id));
}

export async function moveLocation(
  id: number,
  direction: "up" | "down"
): Promise<void> {
  const all = await listLocations();
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
    .where(eq(locationsOfInterest.id, current.id));
  await db
    .update(locationsOfInterest)
    .set({ sortOrder: current.sortOrder })
    .where(eq(locationsOfInterest.id, swapWith.id));
  await db
    .update(locationsOfInterest)
    .set({ sortOrder: swapWith.sortOrder })
    .where(eq(locationsOfInterest.id, current.id));
}

// Used by callers that just need to know if locations exist (e.g. apartment
// detail rendering). Cheaper than listLocations when we only need a count.
export async function locationCount(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(locationsOfInterest);
  return Number(rows[0]?.n ?? 0);
}
