import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { apartmentDrafts, households, users } from "@/lib/db/schema";
import { deleteDraft, listDrafts } from "@/lib/drafts";
import { eq } from "drizzle-orm";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const ENV = JSON.stringify({ v: 0, data: {} });

let hid: number;

// Since #413 nothing creates a draft; these are the ones left from before.
async function createDraft(householdId: number, input: { id: string; createdBy: string; envelope: string }) {
  await db.insert(apartmentDrafts).values({ ...input, householdId });
}

beforeEach(async () => {
  await db.delete(apartmentDrafts);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com", name: "Olga" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
});

describe("drafts", () => {
  it("lists a draft with its creator", async () => {
    await createDraft(hid, { id: uuid(1), createdBy: "o", envelope: ENV });
    const rows = await listDrafts(hid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: uuid(1),
      householdId: hid,
      createdBy: "o",
      envelope: ENV,
      creatorName: "Olga",
      creatorEmail: "o@example.com",
    });
  });

  it("keeps foreign households apart", async () => {
    await createDraft(hid, { id: uuid(1), createdBy: "o", envelope: ENV });
    const [other] = await db.insert(households).values({ name: "X", ownerId: "o" }).returning();
    expect(await listDrafts(other.id)).toEqual([]);
    expect(await deleteDraft(other.id, uuid(1))).toBe(false);
    expect(await deleteDraft(hid, uuid(1))).toBe(true);
    expect(await listDrafts(hid)).toEqual([]);
  });

  it("leaves the draft with a null creator when the user is deleted", async () => {
    await db.insert(users).values({ id: "p", email: "p@example.com" });
    await createDraft(hid, { id: uuid(1), createdBy: "p", envelope: ENV });
    await db.delete(users).where(eq(users.id, "p"));
    const rows = await listDrafts(hid);
    expect(rows[0]).toMatchObject({ createdBy: null, creatorName: null, creatorEmail: null });
  });
});
