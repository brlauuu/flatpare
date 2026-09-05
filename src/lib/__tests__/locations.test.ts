import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  locationsOfInterest,
  apartments,
  households,
  householdMembers,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import {
  createLocation,
  deleteLocation,
  getLocation,
  listLocations,
  moveLocation,
  updateLocation,
} from "@/lib/locations";

// Two real households on the real test database. Every assertion below runs
// as household A; household B exists so the scoping is actually exercised
// rather than assumed — with a single household, an unfiltered query and a
// correctly filtered one are indistinguishable.
let houseA = 0;
let houseB = 0;

async function reset() {
  await db.delete(locationsOfInterest);
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
}

beforeEach(async () => {
  await reset();
  await db.insert(users).values([
    { id: "loc-ua", email: "loc-a@example.com" },
    { id: "loc-ub", email: "loc-b@example.com" },
  ]);
  const [a] = await db
    .insert(households)
    .values({ name: "A", ownerId: "loc-ua" })
    .returning();
  const [b] = await db
    .insert(households)
    .values({ name: "B", ownerId: "loc-ub" })
    .returning();
  houseA = a.id;
  houseB = b.id;
  await db.insert(householdMembers).values([
    { householdId: houseA, userId: "loc-ua", role: "owner" },
    { householdId: houseB, userId: "loc-ub", role: "owner" },
  ]);
});

afterEach(reset);

describe("locations", () => {
  it("createLocation persists fields and assigns sortOrder=0 for the first row", async () => {
    const created = await createLocation(houseA, {
      label: "Train Station",
      icon: "Train",
      address: "Basel SBB",
    });
    expect(created.label).toBe("Train Station");
    expect(created.icon).toBe("Train");
    expect(created.address).toBe("Basel SBB");
    expect(created.sortOrder).toBe(0);
    expect(created.householdId).toBe(houseA);
  });

  it("createLocation increments sortOrder for subsequent rows", async () => {
    await createLocation(houseA, { label: "A", icon: "Train", address: "X" });
    const second = await createLocation(houseA, {
      label: "B",
      icon: "Bus",
      address: "Y",
    });
    expect(second.sortOrder).toBe(1);
  });

  it("createLocation rejects unknown icon", async () => {
    await expect(
      createLocation(houseA, { label: "A", icon: "Skull", address: "X" })
    ).rejects.toThrow(/icon/i);
  });

  it("createLocation rejects empty label or address", async () => {
    await expect(
      createLocation(houseA, { label: "  ", icon: "Train", address: "X" })
    ).rejects.toThrow(/label/i);
    await expect(
      createLocation(houseA, { label: "A", icon: "Train", address: "  " })
    ).rejects.toThrow(/address/i);
  });

  it("createLocation enforces a max of 5 rows", async () => {
    for (let i = 0; i < 5; i++) {
      await createLocation(houseA, {
        label: `Loc ${i}`,
        icon: "Train",
        address: `Addr ${i}`,
      });
    }
    await expect(
      createLocation(houseA, { label: "X", icon: "Train", address: "Y" })
    ).rejects.toThrow(/more than 5/);
  });

  it("the 5-row cap is per household, not global", async () => {
    for (let i = 0; i < 5; i++) {
      await createLocation(houseA, {
        label: `Loc ${i}`,
        icon: "Train",
        address: `Addr ${i}`,
      });
    }
    const other = await createLocation(houseB, {
      label: "B first",
      icon: "Train",
      address: "Z",
    });
    expect(other.sortOrder).toBe(0);
    expect(other.householdId).toBe(houseB);
  });

  it("listLocations returns rows ordered by sortOrder", async () => {
    const a = await createLocation(houseA, { label: "A", icon: "Train", address: "X" });
    const b = await createLocation(houseA, { label: "B", icon: "Bus", address: "Y" });
    const c = await createLocation(houseA, {
      label: "C",
      icon: "Coffee",
      address: "Z",
    });
    await moveLocation(houseA, c.id, "up");
    await moveLocation(houseA, c.id, "up");
    const list = await listLocations(houseA);
    expect(list.map((l) => l.label)).toEqual(["C", "A", "B"]);
    expect(list[0].id).toBe(c.id);
    expect(list[1].id).toBe(a.id);
    expect(list[2].id).toBe(b.id);
  });

  it("listLocations returns only the caller's household", async () => {
    await createLocation(houseA, { label: "Mine", icon: "Train", address: "X" });
    await createLocation(houseB, { label: "Theirs", icon: "Bus", address: "Y" });
    expect((await listLocations(houseA)).map((l) => l.label)).toEqual(["Mine"]);
    expect((await listLocations(houseB)).map((l) => l.label)).toEqual([
      "Theirs",
    ]);
  });

  it("updateLocation patches only provided fields", async () => {
    const created = await createLocation(houseA, {
      label: "A",
      icon: "Train",
      address: "X",
    });
    const updated = await updateLocation(houseA, created.id, { label: "A2" });
    expect(updated.label).toBe("A2");
    expect(updated.icon).toBe("Train");
    expect(updated.address).toBe("X");
  });

  it("deleteLocation removes the row", async () => {
    const created = await createLocation(houseA, {
      label: "A",
      icon: "Train",
      address: "X",
    });
    expect(await deleteLocation(houseA, created.id)).toBe(true);
    expect(await listLocations(houseA)).toEqual([]);
  });

  it("moveLocation is a no-op at boundaries", async () => {
    const a = await createLocation(houseA, { label: "A", icon: "Train", address: "X" });
    const b = await createLocation(houseA, { label: "B", icon: "Bus", address: "Y" });
    await moveLocation(houseA, a.id, "up");
    await moveLocation(houseA, b.id, "down");
    const list = await listLocations(houseA);
    expect(list.map((l) => l.label)).toEqual(["A", "B"]);
  });

  it("getLocation returns null when the id is not found", async () => {
    expect(await getLocation(houseA, 99999)).toBeNull();
  });

  it("updateLocation patches address and triggers a re-geocode pass", async () => {
    const created = await createLocation(houseA, {
      label: "A",
      icon: "Train",
      address: "Old St",
    });
    const updated = await updateLocation(houseA, created.id, {
      address: "New St 2",
    });
    expect(updated.address).toBe("New St 2");
  });

  it("updateLocation patches icon", async () => {
    const created = await createLocation(houseA, {
      label: "A",
      icon: "Train",
      address: "X",
    });
    const updated = await updateLocation(houseA, created.id, { icon: "Bus" });
    expect(updated.icon).toBe("Bus");
  });

  it("updateLocation rejects an empty label or address (whitespace only)", async () => {
    const created = await createLocation(houseA, {
      label: "A",
      icon: "Train",
      address: "X",
    });
    await expect(
      updateLocation(houseA, created.id, { label: "   " })
    ).rejects.toThrow(/label/i);
    await expect(
      updateLocation(houseA, created.id, { address: "  " })
    ).rejects.toThrow(/address/i);
  });

  it("updateLocation rejects an unknown icon", async () => {
    const created = await createLocation(houseA, {
      label: "A",
      icon: "Train",
      address: "X",
    });
    await expect(
      updateLocation(houseA, created.id, { icon: "Skull" })
    ).rejects.toThrow(/icon/i);
  });

  it("updateLocation throws when the id does not exist", async () => {
    await expect(
      updateLocation(houseA, 99999, { label: "X" })
    ).rejects.toThrow(/not found/i);
  });

  it("moveLocation throws when the id does not exist", async () => {
    await expect(moveLocation(houseA, 99999, "up")).rejects.toThrow(
      /not found/i
    );
  });
});

describe("locations cross-household isolation", () => {
  it("getLocation cannot read another household's row", async () => {
    const theirs = await createLocation(houseB, {
      label: "Theirs",
      icon: "Train",
      address: "X",
    });
    expect(await getLocation(houseA, theirs.id)).toBeNull();
    // ...and is readable by its own household, so the null above is scoping
    // and not simply a broken lookup.
    expect((await getLocation(houseB, theirs.id))?.label).toBe("Theirs");
  });

  it("updateLocation cannot modify another household's row", async () => {
    const theirs = await createLocation(houseB, {
      label: "Theirs",
      icon: "Train",
      address: "X",
    });
    await expect(
      updateLocation(houseA, theirs.id, { label: "Pwned" })
    ).rejects.toThrow(/not found/i);
    expect((await getLocation(houseB, theirs.id))?.label).toBe("Theirs");
  });

  it("deleteLocation cannot delete another household's row", async () => {
    const theirs = await createLocation(houseB, {
      label: "Theirs",
      icon: "Train",
      address: "X",
    });
    expect(await deleteLocation(houseA, theirs.id)).toBe(false);
    expect(await getLocation(houseB, theirs.id)).not.toBeNull();
  });

  it("moveLocation cannot reorder another household's rows", async () => {
    const b1 = await createLocation(houseB, {
      label: "B1",
      icon: "Train",
      address: "X",
    });
    const b2 = await createLocation(houseB, {
      label: "B2",
      icon: "Bus",
      address: "Y",
    });
    await expect(moveLocation(houseA, b2.id, "up")).rejects.toThrow(
      /not found/i
    );
    expect((await listLocations(houseB)).map((l) => l.id)).toEqual([
      b1.id,
      b2.id,
    ]);
  });
});
