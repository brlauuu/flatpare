import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { apartmentDrafts, households, users } from "@/lib/db/schema";
import { createDraft, deleteDraft, listDrafts, MAX_DRAFTS } from "@/lib/drafts";
import { eq } from "drizzle-orm";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const ENV = JSON.stringify({ v: 0, data: {} });

let hid: number;

beforeEach(async () => {
  await db.delete(apartmentDrafts);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com", name: "Olga" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
});

describe("drafts", () => {
  it("lists a created draft with its creator", async () => {
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

  it("caps at 20 and refuses the 21st with 409", async () => {
    expect(MAX_DRAFTS).toBe(20);
    for (let i = 1; i <= MAX_DRAFTS; i++) {
      await createDraft(hid, { id: uuid(i), createdBy: "o", envelope: ENV });
    }
    await expect(
      createDraft(hid, { id: uuid(99), createdBy: "o", envelope: ENV })
    ).rejects.toMatchObject({ message: "Too many drafts", status: 409 });
  });

  it("lets concurrent creates fill exactly the cap", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) =>
        createDraft(hid, { id: uuid(i + 1), createdBy: "o", envelope: ENV })
      )
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(MAX_DRAFTS);
    expect(await listDrafts(hid)).toHaveLength(MAX_DRAFTS);
  });

  it("leaves the draft with a null creator when the user is deleted", async () => {
    await db.insert(users).values({ id: "p", email: "p@example.com" });
    await createDraft(hid, { id: uuid(1), createdBy: "p", envelope: ENV });
    await db.delete(users).where(eq(users.id, "p"));
    const rows = await listDrafts(hid);
    expect(rows[0]).toMatchObject({ createdBy: null, creatorName: null, creatorEmail: null });
  });
});
