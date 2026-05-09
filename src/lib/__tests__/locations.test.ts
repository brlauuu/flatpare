import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { locationsOfInterest, apartments } from "@/lib/db/schema";
import {
  createLocation,
  deleteLocation,
  getLocation,
  listLocations,
  moveLocation,
  updateLocation,
} from "@/lib/locations";

beforeEach(async () => {
  await db.delete(locationsOfInterest);
  await db.delete(apartments);
});

afterEach(async () => {
  await db.delete(locationsOfInterest);
  await db.delete(apartments);
});

describe("locations", () => {
  it("createLocation persists fields and assigns sortOrder=0 for the first row", async () => {
    const created = await createLocation({
      label: "Train Station",
      icon: "Train",
      address: "Basel SBB",
    });
    expect(created.label).toBe("Train Station");
    expect(created.icon).toBe("Train");
    expect(created.address).toBe("Basel SBB");
    expect(created.sortOrder).toBe(0);
  });

  it("createLocation increments sortOrder for subsequent rows", async () => {
    await createLocation({ label: "A", icon: "Train", address: "X" });
    const second = await createLocation({
      label: "B",
      icon: "Bus",
      address: "Y",
    });
    expect(second.sortOrder).toBe(1);
  });

  it("createLocation rejects unknown icon", async () => {
    await expect(
      createLocation({ label: "A", icon: "Skull", address: "X" })
    ).rejects.toThrow(/icon/i);
  });

  it("createLocation rejects empty label or address", async () => {
    await expect(
      createLocation({ label: "  ", icon: "Train", address: "X" })
    ).rejects.toThrow(/label/i);
    await expect(
      createLocation({ label: "A", icon: "Train", address: "  " })
    ).rejects.toThrow(/address/i);
  });

  it("createLocation enforces a max of 5 rows", async () => {
    for (let i = 0; i < 5; i++) {
      await createLocation({
        label: `Loc ${i}`,
        icon: "Train",
        address: `Addr ${i}`,
      });
    }
    await expect(
      createLocation({ label: "X", icon: "Train", address: "Y" })
    ).rejects.toThrow(/more than 5/);
  });

  it("listLocations returns rows ordered by sortOrder", async () => {
    const a = await createLocation({ label: "A", icon: "Train", address: "X" });
    const b = await createLocation({ label: "B", icon: "Bus", address: "Y" });
    const c = await createLocation({
      label: "C",
      icon: "Coffee",
      address: "Z",
    });
    await moveLocation(c.id, "up");
    await moveLocation(c.id, "up");
    const list = await listLocations();
    expect(list.map((l) => l.label)).toEqual(["C", "A", "B"]);
    expect(list[0].id).toBe(c.id);
    expect(list[1].id).toBe(a.id);
    expect(list[2].id).toBe(b.id);
  });

  it("updateLocation patches only provided fields", async () => {
    const created = await createLocation({
      label: "A",
      icon: "Train",
      address: "X",
    });
    const updated = await updateLocation(created.id, { label: "A2" });
    expect(updated.label).toBe("A2");
    expect(updated.icon).toBe("Train");
    expect(updated.address).toBe("X");
  });

  it("deleteLocation removes the row", async () => {
    const created = await createLocation({
      label: "A",
      icon: "Train",
      address: "X",
    });
    await deleteLocation(created.id);
    expect(await listLocations()).toEqual([]);
  });

  it("moveLocation is a no-op at boundaries", async () => {
    const a = await createLocation({ label: "A", icon: "Train", address: "X" });
    const b = await createLocation({ label: "B", icon: "Bus", address: "Y" });
    await moveLocation(a.id, "up");
    await moveLocation(b.id, "down");
    const list = await listLocations();
    expect(list.map((l) => l.label)).toEqual(["A", "B"]);
  });

  it("getLocation returns null when the id is not found", async () => {
    expect(await getLocation(99999)).toBeNull();
  });

  it("updateLocation patches address and triggers a re-geocode pass", async () => {
    const created = await createLocation({
      label: "A",
      icon: "Train",
      address: "Old St",
    });
    const updated = await updateLocation(created.id, { address: "New St 2" });
    expect(updated.address).toBe("New St 2");
  });

  it("updateLocation patches icon", async () => {
    const created = await createLocation({
      label: "A",
      icon: "Train",
      address: "X",
    });
    const updated = await updateLocation(created.id, { icon: "Bus" });
    expect(updated.icon).toBe("Bus");
  });

  it("updateLocation rejects an empty label or address (whitespace only)", async () => {
    const created = await createLocation({
      label: "A",
      icon: "Train",
      address: "X",
    });
    await expect(
      updateLocation(created.id, { label: "   " })
    ).rejects.toThrow(/label/i);
    await expect(
      updateLocation(created.id, { address: "  " })
    ).rejects.toThrow(/address/i);
  });

  it("updateLocation rejects an unknown icon", async () => {
    const created = await createLocation({
      label: "A",
      icon: "Train",
      address: "X",
    });
    await expect(
      updateLocation(created.id, { icon: "Skull" })
    ).rejects.toThrow(/icon/i);
  });

  it("updateLocation throws when the id does not exist", async () => {
    await expect(
      updateLocation(99999, { label: "X" })
    ).rejects.toThrow(/not found/i);
  });

  it("moveLocation throws when the id does not exist", async () => {
    await expect(moveLocation(99999, "up")).rejects.toThrow(/not found/i);
  });
});
