import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { households, householdMembers, apartmentDrafts } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;

vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

import { GET as listGET, POST as createPOST } from "../route";
import { DELETE as removeDELETE } from "../[id]/route";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const v1 = (tag: string) => ({ v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ct: Buffer.from(tag).toString("base64") });
const v0 = { v: 0 as const, data: { url: "https://example.com" } };

function json(method: string, body?: unknown) {
  return new Request("http://localhost/api/drafts", {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let hid: number;
let otherHid: number;

beforeEach(async () => {
  vi.stubEnv("FLATPARE_ENCRYPTION", "on");
  signedIn = true;
  await db.delete(apartmentDrafts);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com", name: "Olive" });
  await db.insert(users).values({ id: "x", email: "x@example.com", name: "x" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  const [h2] = await db.insert(households).values({ name: "X", ownerId: "x" }).returning();
  otherHid = h2.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: otherHid, userId: "x", role: "owner" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

afterEach(() => vi.unstubAllEnvs());

describe("/api/drafts", () => {
  it("401s without a session", async () => {
    signedIn = false;
    expect((await listGET()).status).toBe(401);
    expect((await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }))).status).toBe(401);
    expect((await removeDELETE(json("DELETE"), params(uuid(1)))).status).toBe(401);
  });

  it("answers 404 to a non-member on all three handlers", async () => {
    await db.delete(householdMembers).where(eq(householdMembers.userId, "o"));
    expect((await listGET()).status).toBe(404);
    expect((await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }))).status).toBe(404);
    expect((await removeDELETE(json("DELETE"), params(uuid(1)))).status).toBe(404);
  });

  it("creates as the caller, lists with the creator's name, deletes", async () => {
    const res = await createPOST(
      json("POST", { id: uuid(1), createdBy: "x", envelope: v1("a") })
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      id: uuid(1),
      createdBy: "o",
      createdByName: "Olive",
      envelope: v1("a"),
    });
    const list = await (await listGET()).json();
    expect(list).toHaveLength(1);
    expect(list[0].createdBy).toBe("o");
    expect((await removeDELETE(json("DELETE"), params(uuid(1)))).status).toBe(204);
    expect(await (await listGET()).json()).toEqual([]);
  });

  it("refuses an envelope of the wrong mode with 400", async () => {
    expect((await createPOST(json("POST", { id: uuid(1), envelope: v0 }))).status).toBe(400);
  });

  it("refuses a stale key with 409", async () => {
    await db.update(households).set({ keyVersion: 2 }).where(eq(households.id, hid));
    const res = await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Stale key");
  });

  it("refuses a duplicate id with 409", async () => {
    await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    const res = await createPOST(json("POST", { id: uuid(1), envelope: v1("b") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Duplicate id");
  });

  it("refuses the 21st draft with 409", async () => {
    for (let i = 1; i <= 20; i++) {
      expect((await createPOST(json("POST", { id: uuid(i), envelope: v1("a") }))).status).toBe(201);
    }
    const res = await createPOST(json("POST", { id: uuid(21), envelope: v1("a") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Too many drafts");
  });

  it("answers 404 deleting a foreign or non-uuid id", async () => {
    await db.insert(apartmentDrafts).values({
      id: uuid(9),
      householdId: otherHid,
      createdBy: "x",
      envelope: JSON.stringify(v1("a")),
    });
    expect((await removeDELETE(json("DELETE"), params(uuid(9)))).status).toBe(404);
    expect((await removeDELETE(json("DELETE"), params("nope"))).status).toBe(404);
  });

  it("never touches the credit counters, billing on", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    await db
      .update(households)
      .set({ apartmentCreditsGranted: 5, apartmentsEverAdded: 2 })
      .where(eq(households.id, hid));
    await createPOST(json("POST", { id: uuid(1), envelope: v1("a") }));
    const [h] = await db.select().from(households).where(eq(households.id, hid));
    expect(h.apartmentCreditsGranted).toBe(5);
    expect(h.apartmentsEverAdded).toBe(2);
  });
});
