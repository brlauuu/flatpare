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

import * as draftsRoute from "../route";
import { GET as listGET } from "../route";
import { DELETE as removeDELETE } from "../[id]/route";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const v1 = (tag: string) => ({ v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ct: Buffer.from(tag).toString("base64") });

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

async function insertDraft(id: string, householdId = hid, createdBy = "o") {
  await db.insert(apartmentDrafts).values({ id, householdId, createdBy, envelope: JSON.stringify(v1("a")) });
}

// Since #413 no draft is made: a link becomes an unprocessed apartment. The
// routes that remain let the store turn the drafts left into apartments.
describe("/api/drafts", () => {
  it("has no create route any more", () => {
    expect("POST" in draftsRoute).toBe(false);
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await listGET()).status).toBe(401);
    expect((await removeDELETE(json("DELETE"), params(uuid(1)))).status).toBe(401);
  });

  it("answers 404 to a non-member on both handlers", async () => {
    await db.delete(householdMembers).where(eq(householdMembers.userId, "o"));
    expect((await listGET()).status).toBe(404);
    expect((await removeDELETE(json("DELETE"), params(uuid(1)))).status).toBe(404);
  });

  it("lists with the creator's name, deletes", async () => {
    await insertDraft(uuid(1));
    const list = await (await listGET()).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: uuid(1), createdBy: "o", createdByName: "Olive", envelope: v1("a") });
    expect((await removeDELETE(json("DELETE"), params(uuid(1)))).status).toBe(204);
    expect(await (await listGET()).json()).toEqual([]);
  });

  it("answers 404 deleting a foreign or non-uuid id", async () => {
    await insertDraft(uuid(9), otherHid, "x");
    expect((await removeDELETE(json("DELETE"), params(uuid(9)))).status).toBe(404);
    expect((await removeDELETE(json("DELETE"), params("nope"))).status).toBe(404);
  });
});
