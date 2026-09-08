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
