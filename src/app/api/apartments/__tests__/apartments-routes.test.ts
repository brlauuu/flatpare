import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, households, householdMembers } from "@/lib/db/schema";
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

const deleteStoredFile = vi.fn(async () => {});
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, deleteStoredFile: (...args: unknown[]) => deleteStoredFile(...(args as [])) };
});

import { GET as listGET, POST as createPOST } from "../route";
import { PUT as updatePUT, DELETE as removeDELETE } from "../[id]/route";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const v1 = (tag: string) => ({ v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ct: Buffer.from(tag).toString("base64") });
const v0 = { v: 0 as const, data: { name: "plain" } };

function json(method: string, body?: unknown) {
  return new Request("http://localhost/api/apartments", {
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
  deleteStoredFile.mockClear();
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  for (const id of ["o", "m", "x"]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  const [h2] = await db.insert(households).values({ name: "X", ownerId: "x" }).returning();
  otherHid = h2.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  await db.insert(householdMembers).values({ householdId: hid, userId: "m", role: "member" });
  await db.insert(householdMembers).values({ householdId: otherHid, userId: "x", role: "owner" });
  currentSession.householdId = hid;
  currentSession.userId = "o";
  currentSession.role = "owner";
});

afterEach(() => vi.unstubAllEnvs());

async function seed(id: string, householdId: number, tag = id) {
  await db.insert(apartments).values({ id, householdId, envelope: JSON.stringify(v1(tag)) });
}

describe("GET /api/apartments", () => {
  it("401s without a session", async () => {
    signedIn = false;
    expect((await listGET()).status).toBe(401);
  });

  it("returns only the household's rows as wire rows", async () => {
    await seed(ID_A, hid);
    await seed(ID_B, otherHid);
    const res = await listGET();
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: ID_A, version: 1, envelope: v1(ID_A) });
    expect(typeof rows[0].createdAt).toBe("string");
  });

  it("404s a removed member whose token still names the household", async () => {
    currentSession.userId = "x"; // x is not a member of hid
    expect((await listGET()).status).toBe(404);
  });
});

describe("POST /api/apartments", () => {
  it("creates a row with the client-minted id", async () => {
    const res = await createPOST(json("POST", { id: ID_A, envelope: v1("a") }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: ID_A, version: 1, envelope: v1("a") });
    const [row] = await db.select().from(apartments).where(eq(apartments.id, ID_A));
    expect(row.householdId).toBe(hid);
  });

  it("409s a duplicate id, even from another household", async () => {
    await seed(ID_A, otherHid);
    const res = await createPOST(json("POST", { id: ID_A, envelope: v1("a") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Duplicate id");
  });

  it("400s a plaintext envelope under encryption on, writing nothing", async () => {
    const res = await createPOST(json("POST", { id: ID_A, envelope: v0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Plaintext envelope in an encrypted deployment");
    expect(await db.select().from(apartments)).toHaveLength(0);
  });

  it("400s an encrypted envelope under encryption off", async () => {
    vi.stubEnv("FLATPARE_ENCRYPTION", "off");
    const res = await createPOST(json("POST", { id: ID_A, envelope: v1("a") }));
    expect(res.status).toBe(400);
  });

  it("400s a non-uuid id", async () => {
    const res = await createPOST(json("POST", { id: "1", envelope: v1("a") }));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/apartments/[id]", () => {
  it("replaces the envelope and bumps the version", async () => {
    await seed(ID_A, hid);
    const res = await updatePUT(json("PUT", { version: 1, envelope: v1("new") }), params(ID_A));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: ID_A, version: 2, envelope: v1("new") });
  });

  it("409s a stale version with the current one and leaves the row unchanged", async () => {
    await seed(ID_A, hid);
    await updatePUT(json("PUT", { version: 1, envelope: v1("second") }), params(ID_A));
    const res = await updatePUT(json("PUT", { version: 1, envelope: v1("third") }), params(ID_A));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Stale version", version: 2 });
    const [row] = await db.select().from(apartments).where(eq(apartments.id, ID_A));
    expect(JSON.parse(row.envelope)).toEqual(v1("second"));
  });

  it("404s another household's row without touching it", async () => {
    await seed(ID_A, otherHid);
    const res = await updatePUT(json("PUT", { version: 1, envelope: v1("evil") }), params(ID_A));
    expect(res.status).toBe(404);
    const [row] = await db.select().from(apartments).where(eq(apartments.id, ID_A));
    expect(JSON.parse(row.envelope)).toEqual(v1(ID_A));
  });

  it("404s an unknown id and a malformed id", async () => {
    expect((await updatePUT(json("PUT", { version: 1, envelope: v1("a") }), params(ID_B))).status).toBe(404);
    expect((await updatePUT(json("PUT", { version: 1, envelope: v1("a") }), params("nope"))).status).toBe(404);
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await updatePUT(json("PUT", { version: 1, envelope: v1("a") }), params(ID_A))).status).toBe(401);
  });
});

describe("DELETE /api/apartments/[id]", () => {
  it("deletes the row and the household's file", async () => {
    await seed(ID_A, hid);
    const res = await removeDELETE(
      json("DELETE", { pdfPath: `/api/uploads/households/${hid}/${ID_A}.pdf.enc` }),
      params(ID_A)
    );
    expect(res.status).toBe(204);
    expect(await db.select().from(apartments)).toHaveLength(0);
    expect(deleteStoredFile).toHaveBeenCalledWith(`/api/uploads/households/${hid}/${ID_A}.pdf.enc`, hid);
  });

  it("deletes without a body", async () => {
    await seed(ID_A, hid);
    expect((await removeDELETE(json("DELETE"), params(ID_A))).status).toBe(204);
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it("400s a foreign pdfPath and keeps the row", async () => {
    await seed(ID_A, hid);
    const res = await removeDELETE(
      json("DELETE", { pdfPath: `/api/uploads/households/${otherHid}/${ID_A}.pdf.enc` }),
      params(ID_A)
    );
    expect(res.status).toBe(400);
    expect(await db.select().from(apartments)).toHaveLength(1);
    expect(deleteStoredFile).not.toHaveBeenCalled();
  });

  it("404s another household's row", async () => {
    await seed(ID_A, otherHid);
    expect((await removeDELETE(json("DELETE"), params(ID_A))).status).toBe(404);
    expect(await db.select().from(apartments)).toHaveLength(1);
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await removeDELETE(json("DELETE"), params(ID_A))).status).toBe(401);
  });
});
