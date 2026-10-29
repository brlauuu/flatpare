import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  households,
  householdMembers,
  householdKeyWraps,
  memberKeys,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import {
  CryptoStateError,
  createHouseholdKey,
  fulfilWraps,
  getCryptoStatus,
  listPendingWraps,
  listRotationTargets,
  recoverHousehold,
  replaceMemberKeys,
  replaceRecovery,
  resetMemberKeys,
  rotateHouseholdKey,
  setupMemberKeys,
} from "../member-keys";
import { apartmentDrafts, apartments, locations, ratings } from "@/lib/db/schema";
import { rotateSchema } from "@/lib/crypto-schemas";

const kdf = { salt: "AAAA", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const };
const member = (tag: string) => ({
  publicKey: `PUB${tag}`,
  wrappedPrivateKey: `PRIV${tag}`,
  privateKeyIv: "IVIV",
  kdf,
});
const recovery = { wrappedKey: "RECOV", iv: "RIV", kdf };

beforeEach(async () => {
  await db.delete(ratings);
  await db.delete(apartments);
  await db.delete(locations);
  await db.delete(apartmentDrafts);
  await db.delete(householdKeyWraps);
  await db.delete(memberKeys);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function makeHousehold(ownerId: string, ...memberIds: string[]) {
  for (const id of [ownerId, ...memberIds]) {
    await db.insert(users).values({ id, email: `${id}@example.com`, name: id });
  }
  const [h] = await db
    .insert(households)
    .values({ name: "H", ownerId })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: h.id, userId: ownerId, role: "owner" });
  for (const id of memberIds) {
    await db
      .insert(householdMembers)
      .values({ householdId: h.id, userId: id, role: "member" });
  }
  return h.id;
}

describe("getCryptoStatus", () => {
  it("reports no keys, no wrap, no recovery on a fresh household", async () => {
    const hid = await makeHousehold("o");
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s).toEqual({
      userId: "o",
      householdId: hid,
      role: "owner",
      memberKeys: null,
      wrap: null,
      wrapKeyVersion: null,
      keyVersion: 1,
      rotationDue: false,
      householdHasWraps: false,
      othersHaveWraps: false,
      recovery: null,
    });
  });

  it("othersHaveWraps ignores the caller's own wrap", async () => {
    const hid = await makeHousehold("o", "m");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    // Sole key holder: the household has a wrap, but nobody else does.
    const alone = await getCryptoStatus(hid, "o", "owner");
    expect(alone.householdHasWraps).toBe(true);
    expect(alone.othersHaveWraps).toBe(false);

    await setupMemberKeys({ householdId: hid, userId: "m", role: "member", member: member("m") });
    await fulfilWraps(hid, "o", [{ userId: "m", wrappedKey: "WRAP_M", publicKey: "PUBm" }]);
    expect((await getCryptoStatus(hid, "o", "owner")).othersHaveWraps).toBe(true);
    expect((await getCryptoStatus(hid, "m", "member")).othersHaveWraps).toBe(true);
  });

  it("fulfilWraps rejects a wrap made for a public key the target has replaced", async () => {
    const hid = await makeHousehold("o", "m");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await setupMemberKeys({ householdId: hid, userId: "m", role: "member", member: member("m") });
    await resetMemberKeys(hid, "m", member("m-new"));

    await expect(
      fulfilWraps(hid, "o", [{ userId: "m", wrappedKey: "WRAP_M", publicKey: "PUBm" }])
    ).rejects.toMatchObject({ status: 409 });
    expect((await getCryptoStatus(hid, "m", "member")).wrap).toBeNull();
  });
});

describe("setupMemberKeys", () => {
  it("owner setup stores keys, the wrap, and the recovery kit", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });

    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.memberKeys?.publicKey).toBe("PUBo");
    expect(s.memberKeys?.kdf).toEqual(kdf);
    expect(s.wrap).toBe("WRAP_O");
    expect(s.householdHasWraps).toBe(true);
    expect(s.recovery).toEqual(recovery);

    const [wrap] = await db
      .select()
      .from(householdKeyWraps)
      .where(eq(householdKeyWraps.userId, "o"));
    expect(wrap.wrappedBy).toBe("o");
  });

  it("member setup stores keys only", async () => {
    const hid = await makeHousehold("o", "m");
    await setupMemberKeys({
      householdId: hid,
      userId: "m",
      role: "member",
      member: member("m"),
    });
    const s = await getCryptoStatus(hid, "m", "member");
    expect(s.memberKeys?.publicKey).toBe("PUBm");
    expect(s.wrap).toBeNull();
    expect(s.householdHasWraps).toBe(false);
  });

  it("rejects a second setup with 409", async () => {
    const hid = await makeHousehold("o");
    const args = {
      householdId: hid,
      userId: "o",
      role: "owner" as const,
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    };
    await setupMemberKeys(args);
    await expect(setupMemberKeys(args)).rejects.toMatchObject({ status: 409 });
  });

  it("only the owner may create the household key (403)", async () => {
    const hid = await makeHousehold("o", "m");
    await expect(
      setupMemberKeys({
        householdId: hid,
        userId: "m",
        role: "member",
        member: member("m"),
        household: { wrappedKey: "X", recovery },
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses to create a second household key once wraps exist (409)", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    // Simulate a second owner-like caller: same role, fresh user.
    await db.insert(users).values({ id: "o2", email: "o2@example.com" });
    await db
      .insert(householdMembers)
      .values({ householdId: hid, userId: "o2", role: "owner" });
    await expect(
      setupMemberKeys({
        householdId: hid,
        userId: "o2",
        role: "owner",
        member: member("o2"),
        household: { wrappedKey: "X", recovery },
      })
    ).rejects.toMatchObject({ status: 409 });
    // And the failure left no member_keys row behind.
    const rows = await db.select().from(memberKeys).where(eq(memberKeys.userId, "o2"));
    expect(rows).toHaveLength(0);
  });
});

describe("listPendingWraps / fulfilWraps", () => {
  async function seeded() {
    const hid = await makeHousehold("o", "m1", "m2");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await setupMemberKeys({ householdId: hid, userId: "m1", role: "member", member: member("m1") });
    return hid;
  }

  it("lists members who have keys but no wrap", async () => {
    const hid = await seeded();
    const pending = await listPendingWraps(hid);
    expect(pending).toEqual([
      { userId: "m1", name: "m1", email: "m1@example.com", publicKey: "PUBm1" },
    ]);
  });

  it("fulfils wraps atomically and records who wrapped", async () => {
    const hid = await seeded();
    const n = await fulfilWraps(hid, "o", [
      { userId: "m1", wrappedKey: "WRAP_M1", publicKey: "PUBm1" },
    ]);
    expect(n).toBe(1);
    const s = await getCryptoStatus(hid, "m1", "member");
    expect(s.wrap).toBe("WRAP_M1");
    const [row] = await db
      .select()
      .from(householdKeyWraps)
      .where(eq(householdKeyWraps.userId, "m1"));
    expect(row.wrappedBy).toBe("o");
    expect(await listPendingWraps(hid)).toEqual([]);
  });

  // Not owner-gated (#192): any member holding the key can let a new member
  // in, so an absent owner does not strand a pending one.
  it("lets a member who holds the key wrap it for a pending member", async () => {
    const hid = await seeded();
    await fulfilWraps(hid, "o", [{ userId: "m1", wrappedKey: "WRAP_M1", publicKey: "PUBm1" }]);
    await setupMemberKeys({ householdId: hid, userId: "m2", role: "member", member: member("m2") });
    expect(
      await fulfilWraps(hid, "m1", [{ userId: "m2", wrappedKey: "WRAP_M2", publicKey: "PUBm2" }])
    ).toBe(1);
    const [row] = await db
      .select()
      .from(householdKeyWraps)
      .where(eq(householdKeyWraps.userId, "m2"));
    expect(row.wrappedBy).toBe("m1");
  });

  it("rejects a wrapper who holds no wrap (403)", async () => {
    const hid = await seeded();
    await expect(
      fulfilWraps(hid, "m1", [{ userId: "m1", wrappedKey: "X", publicKey: "PUBm1" }])
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a target that is not pending (400) and writes nothing", async () => {
    const hid = await seeded();
    await expect(
      fulfilWraps(hid, "o", [
        { userId: "m1", wrappedKey: "WRAP_M1", publicKey: "PUBm1" },
        // m2 has no keys yet
        { userId: "m2", wrappedKey: "X", publicKey: "PUBm2" },
      ])
    ).rejects.toMatchObject({ status: 400 });
    const s = await getCryptoStatus(hid, "m1", "member");
    expect(s.wrap).toBeNull();
  });
});

describe("replaceMemberKeys / resetMemberKeys", () => {
  it("replaceMemberKeys swaps the wrapped private key and KDF params", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await replaceMemberKeys("o", {
      wrappedPrivateKey: "PRIV2",
      privateKeyIv: "IV2",
      kdf: { ...kdf, iterations: 4 },
    });
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.memberKeys?.wrappedPrivateKey).toBe("PRIV2");
    expect(s.memberKeys?.publicKey).toBe("PUBo");
    expect(s.memberKeys?.kdf.iterations).toBe(4);
    expect(s.wrap).toBe("WRAP_O");
  });

  it("replaceMemberKeys without keys is 409", async () => {
    await makeHousehold("o");
    await expect(
      replaceMemberKeys("o", { wrappedPrivateKey: "P", privateKeyIv: "I", kdf })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("resetMemberKeys replaces the keypair and drops the user's wrap", async () => {
    const hid = await makeHousehold("o", "m");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await setupMemberKeys({ householdId: hid, userId: "m", role: "member", member: member("m") });
    await fulfilWraps(hid, "o", [{ userId: "m", wrappedKey: "WRAP_M", publicKey: "PUBm" }]);

    await resetMemberKeys(hid, "m", member("m-new"));
    const s = await getCryptoStatus(hid, "m", "member");
    expect(s.memberKeys?.publicKey).toBe("PUBm-new");
    expect(s.wrap).toBeNull();
    expect(await listPendingWraps(hid)).toEqual([
      { userId: "m", name: "m", email: "m@example.com", publicKey: "PUBm-new" },
    ]);
  });
});

describe("recoverHousehold / replaceRecovery", () => {
  it("recover installs new keys, a self-wrap, and a fresh kit", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    const newRecovery = { wrappedKey: "RECOV2", iv: "RIV2", kdf };
    await recoverHousehold(hid, "o", {
      member: member("o-new"),
      wrappedKey: "WRAP_O2",
      recovery: newRecovery,
    });
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.memberKeys?.publicKey).toBe("PUBo-new");
    expect(s.wrap).toBe("WRAP_O2");
    expect(s.recovery).toEqual(newRecovery);
  });

  it("recover without a kit is 409", async () => {
    const hid = await makeHousehold("o");
    await expect(
      recoverHousehold(hid, "o", { member: member("o"), wrappedKey: "W", recovery })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("replaceRecovery overwrites the kit", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await replaceRecovery(hid, "o", { wrappedKey: "R3", iv: "I3", kdf });
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.recovery?.wrappedKey).toBe("R3");
  });
});

describe("KDF version validation on read", () => {
  it("round-trips a member_keys row stamped with kdf_version 1", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.memberKeys?.kdf.version).toBe(1);
    expect(s.recovery?.kdf.version).toBe(1);
  });

  it("throws when member_keys.kdf_version is not 1", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await db
      .update(memberKeys)
      .set({ kdfVersion: 2 })
      .where(eq(memberKeys.userId, "o"));
    await expect(getCryptoStatus(hid, "o", "owner")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws when households.recovery_kdf_version is not 1", async () => {
    const hid = await makeHousehold("o");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAP_O", recovery },
    });
    await db
      .update(households)
      .set({ recoveryKdfVersion: 2 })
      .where(eq(households.id, hid));
    await expect(getCryptoStatus(hid, "o", "owner")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("CryptoStateError", () => {
  it("carries its status", () => {
    expect(new CryptoStateError("x", 409).status).toBe(409);
  });
});

// ---- Data-key rotation (#219) ----------------------------------------------

const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";
const L1 = "33333333-3333-4333-8333-333333333333";
const D1 = "44444444-4444-4444-8444-444444444444";
const L2 = "66666666-6666-4666-8666-666666666666";
const D2 = "55555555-5555-4555-8555-555555555555";
const sealed = (k: number, tag = "x") => ({
  v: 1 as const,
  k,
  iv: "AAAAAAAAAAAAAAAA",
  ct: Buffer.from(tag).toString("base64"),
});

async function rotatableHousehold() {
  const hid = await makeHousehold("o", "m", "p");
  await setupMemberKeys({
    householdId: hid,
    userId: "o",
    role: "owner",
    member: member("o"),
    household: { wrappedKey: "WRAPO", recovery },
  });
  await setupMemberKeys({ householdId: hid, userId: "m", role: "member", member: member("m") });
  await fulfilWraps(hid, "o", [{ userId: "m", wrappedKey: "WRAPM", publicKey: "PUBm" }]);
  // "p" is a member with no key pair at all: gets no wrap, is not a target.
  await db.insert(apartments).values({ id: A1, householdId: hid, envelope: JSON.stringify(sealed(1, "a1")) });
  await db.insert(apartments).values({ id: A2, householdId: hid, envelope: JSON.stringify(sealed(1, "a2")) });
  await db.insert(ratings).values({ householdId: hid, apartmentId: A1, userId: "o", envelope: JSON.stringify(sealed(1, "r")) });
  await db.insert(locations).values({ id: L1, householdId: hid, sortOrder: 0, envelope: JSON.stringify(sealed(1, "l")) });
  await db.insert(apartmentDrafts).values({ id: D1, householdId: hid, createdBy: "m", envelope: JSON.stringify(sealed(1, "d")) });
  return hid;
}

function request(over: Partial<Parameters<typeof rotateHouseholdKey>[2]> = {}) {
  return {
    fromKeyVersion: 1,
    wraps: [
      { userId: "o", wrappedKey: "NEWO", publicKey: "PUBo" },
      { userId: "m", wrappedKey: "NEWM", publicKey: "PUBm" },
    ],
    recovery: { wrappedKey: "RECOV2", iv: "RIV2", kdf },
    apartments: [
      { id: A1, version: 1, envelope: sealed(2, "a1'") },
      { id: A2, version: 1, envelope: sealed(2, "a2'") },
    ],
    ratings: [{ apartmentId: A1, userId: "o", envelope: sealed(2, "r'") }],
    locations: [{ id: L1, envelope: sealed(2, "l'") }],
    drafts: [{ id: D1, envelope: sealed(2, "d'") }],
    retiredPdfPaths: [],
    ...over,
  };
}

describe("listRotationTargets", () => {
  it("names the current version and every member with a public key, pending or not", async () => {
    const hid = await rotatableHousehold();
    await resetMemberKeys(hid, "m", member("m2")); // m becomes pending again
    const t = await listRotationTargets(hid);
    expect(t.keyVersion).toBe(1);
    expect(t.members.map((m) => m.userId).sort()).toEqual(["m", "o"]);
    expect(t.members.find((m) => m.userId === "m")?.publicKey).toBe("PUBm2");
  });
});

describe("rotateHouseholdKey", () => {
  it("replaces every wrap, the kit and every row, and bumps the version", async () => {
    const hid = await rotatableHousehold();
    await db.update(households).set({ rotationDue: true }).where(eq(households.id, hid));

    expect(await rotateHouseholdKey(hid, "o", request())).toEqual({ keyVersion: 2 });

    const s = await getCryptoStatus(hid, "m", "member");
    expect(s.keyVersion).toBe(2);
    expect(s.rotationDue).toBe(false);
    expect(s.wrap).toBe("NEWM");
    expect(s.wrapKeyVersion).toBe(2);
    expect(s.recovery?.wrappedKey).toBe("RECOV2");
    const wraps = await db.select().from(householdKeyWraps);
    expect(wraps.map((w) => w.userId).sort()).toEqual(["m", "o"]);
    expect(wraps.every((w) => w.keyVersion === 2 && w.wrappedBy === "o")).toBe(true);

    const a = await db.select().from(apartments).where(eq(apartments.id, A1));
    expect(a[0].version).toBe(2);
    expect(JSON.parse(a[0].envelope).k).toBe(2);
    const r = await db.select().from(ratings);
    expect(JSON.parse(r[0].envelope).ct).toBe(Buffer.from("r'").toString("base64"));
    const l = await db.select().from(locations);
    expect(JSON.parse(l[0].envelope).k).toBe(2);
    const d = await db.select().from(apartmentDrafts);
    expect(JSON.parse(d[0].envelope)).toEqual(sealed(2, "d'"));
  });

  it("leaves a null (corrupt) draft untouched and still rotates", async () => {
    const hid = await rotatableHousehold();
    await rotateHouseholdKey(hid, "o", request({ drafts: [{ id: D1, envelope: null }] }));
    const d = await db.select().from(apartmentDrafts);
    expect(JSON.parse(d[0].envelope)).toEqual(sealed(1, "d"));
    expect((await getCryptoStatus(hid, "o", "owner")).keyVersion).toBe(2);
  });

  it("refuses a request that omits drafts while the household holds one", async () => {
    const hid = await rotatableHousehold();
    const { drafts: _omitted, ...withoutDrafts } = request();
    void _omitted;
    // The route parses the body; an omitted field defaults to [].
    const parsed = rotateSchema.parse(withoutDrafts);
    expect(parsed.drafts).toEqual([]);
    await expect(rotateHouseholdKey(hid, "o", parsed)).rejects.toMatchObject({
      status: 409,
      message: "Stale rows",
    });
    expect((await getCryptoStatus(hid, "o", "owner")).keyVersion).toBe(1);
    const d = await db.select().from(apartmentDrafts);
    expect(JSON.parse(d[0].envelope)).toEqual(sealed(1, "d"));
  });

  it("accepts an omitted drafts field when the household has none", async () => {
    const hid = await rotatableHousehold();
    await db.delete(apartmentDrafts);
    const { drafts: _omitted, ...withoutDrafts } = request();
    void _omitted;
    expect(await rotateHouseholdKey(hid, "o", rotateSchema.parse(withoutDrafts))).toEqual({ keyVersion: 2 });
  });

  it("leaves a null (corrupt) row untouched and still rotates", async () => {
    const hid = await rotatableHousehold();
    await rotateHouseholdKey(hid, "o", request({
      apartments: [
        { id: A1, version: 1, envelope: null },
        { id: A2, version: 1, envelope: sealed(2, "a2'") },
      ],
    }));
    const a = await db.select().from(apartments).where(eq(apartments.id, A1));
    expect(a[0].version).toBe(1);
    expect(JSON.parse(a[0].envelope).k).toBe(1);
    expect((await getCryptoStatus(hid, "o", "owner")).keyVersion).toBe(2);
  });

  it("refuses a stale version and reports the current one", async () => {
    const hid = await rotatableHousehold();
    await rotateHouseholdKey(hid, "o", request());
    await expect(rotateHouseholdKey(hid, "o", request())).rejects.toMatchObject({
      message: "Stale key",
      status: 409,
      details: { keyVersion: 2 },
    });
  });

  it("refuses a wrap set that is not exactly the members with keys", async () => {
    const hid = await rotatableHousehold();
    await expect(
      rotateHouseholdKey(hid, "o", request({ wraps: [{ userId: "o", wrappedKey: "NEWO", publicKey: "PUBo" }] }))
    ).rejects.toMatchObject({ status: 409, message: /every member/ });
    await expect(
      rotateHouseholdKey(hid, "o", request({
        wraps: [...request().wraps, { userId: "p", wrappedKey: "NEWP", publicKey: "PUBp" }],
      }))
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a wrap made for a public key the member has since replaced", async () => {
    const hid = await rotatableHousehold();
    await resetMemberKeys(hid, "m", member("m2"));
    await expect(rotateHouseholdKey(hid, "o", request())).rejects.toMatchObject({
      status: 409,
      message: /public key has changed/,
    });
  });

  it.each([
    ["a missing apartment", { apartments: [{ id: A1, version: 1, envelope: sealed(2) }] }],
    ["a moved apartment version", { apartments: [{ id: A1, version: 2, envelope: sealed(2) }, { id: A2, version: 1, envelope: sealed(2) }] }],
    ["a missing rating", { ratings: [] }],
    ["an extra location", { locations: [{ id: L1, envelope: sealed(2) }, { id: A2, envelope: sealed(2) }] }],
    ["a missing draft", { drafts: [] }],
    ["an extra draft", { drafts: [{ id: D1, envelope: sealed(2) }, { id: D2, envelope: sealed(2) }] }],
  ])("refuses %s as Stale rows", async (_label, over) => {
    const hid = await rotatableHousehold();
    await expect(rotateHouseholdKey(hid, "o", request(over))).rejects.toMatchObject({
      status: 409,
      message: "Stale rows",
    });
    expect((await getCryptoStatus(hid, "o", "owner")).keyVersion).toBe(1);
    const d = await db.select().from(apartmentDrafts);
    expect(JSON.parse(d[0].envelope)).toEqual(sealed(1, "d"));
  });

  // #401: a request naming one row twice has the right length and only known
  // ids, but leaves the other row sealed under the retired key.
  it.each([
    ["apartments", { apartments: [{ id: A1, version: 1, envelope: sealed(2) }, { id: A1, version: 1, envelope: sealed(2) }] }],
    ["ratings", { ratings: [{ apartmentId: A1, userId: "o", envelope: sealed(2) }, { apartmentId: A1, userId: "o", envelope: sealed(2) }] }],
    ["locations", { locations: [{ id: L1, envelope: sealed(2) }, { id: L1, envelope: sealed(2) }] }],
    ["drafts", { drafts: [{ id: D1, envelope: sealed(2) }, { id: D1, envelope: sealed(2) }] }],
  ])("refuses a duplicated id in %s as Stale rows", async (_label, over) => {
    const hid = await rotatableHousehold();
    // A second row in each table, so the duplicated list has the right length.
    await db.insert(ratings).values({ householdId: hid, apartmentId: A2, userId: "m", envelope: JSON.stringify(sealed(1, "r2")) });
    await db.insert(locations).values({ id: L2, householdId: hid, sortOrder: 1, envelope: JSON.stringify(sealed(1, "l2")) });
    await db.insert(apartmentDrafts).values({ id: D2, householdId: hid, createdBy: "m", envelope: JSON.stringify(sealed(1, "d2")) });
    const full = request({
      ratings: [...request().ratings, { apartmentId: A2, userId: "m", envelope: sealed(2) }],
      locations: [...request().locations, { id: L2, envelope: sealed(2) }],
      drafts: [...request().drafts, { id: D2, envelope: sealed(2) }],
    });
    await expect(rotateHouseholdKey(hid, "o", { ...full, ...over })).rejects.toMatchObject({
      status: 409,
      message: "Stale rows",
    });
    expect((await getCryptoStatus(hid, "o", "owner")).keyVersion).toBe(1);
    const envelopes = [
      ...(await db.select().from(apartments)),
      ...(await db.select().from(ratings)),
      ...(await db.select().from(locations)),
      ...(await db.select().from(apartmentDrafts)),
    ].map((row) => JSON.parse(row.envelope).k);
    expect(envelopes.every((k) => k === 1)).toBe(true);
    // The full request, without the duplicate, goes through.
    expect(await rotateHouseholdKey(hid, "o", full)).toEqual({ keyVersion: 2 });
  });

  it("refuses a wrap set that names one member twice", async () => {
    const hid = await rotatableHousehold();
    const o = { userId: "o", wrappedKey: "NEWO", publicKey: "PUBo" };
    await expect(rotateHouseholdKey(hid, "o", request({ wraps: [o, o] }))).rejects.toMatchObject({
      status: 409,
      message: /every member/,
    });
    expect((await getCryptoStatus(hid, "m", "member")).wrap).toBe("WRAPM");
  });

  it("refuses an envelope not sealed under the new version", async () => {
    const hid = await rotatableHousehold();
    await expect(
      rotateHouseholdKey(hid, "o", request({ drafts: [{ id: D1, envelope: sealed(1) }] }))
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      rotateHouseholdKey(hid, "o", request({ locations: [{ id: L1, envelope: sealed(1) }] }))
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      rotateHouseholdKey(hid, "o", request({ locations: [{ id: L1, envelope: sealed(3) }] }))
    ).rejects.toMatchObject({ status: 400 });
    // Nothing partial landed.
    expect(await db.select().from(householdKeyWraps)).toHaveLength(2);
    expect((await db.select().from(householdKeyWraps))[0].keyVersion).toBe(1);
  });

  it("later wraps and recoveries carry the current version", async () => {
    const hid = await rotatableHousehold();
    await rotateHouseholdKey(hid, "o", request());
    await resetMemberKeys(hid, "m", member("m2"));
    await fulfilWraps(hid, "o", [{ userId: "m", wrappedKey: "AGAIN", publicKey: "PUBm2" }]);
    expect((await getCryptoStatus(hid, "m", "member")).wrapKeyVersion).toBe(2);
    await recoverHousehold(hid, "m", { member: member("m3"), wrappedKey: "REC", recovery });
    expect((await getCryptoStatus(hid, "m", "member")).wrapKeyVersion).toBe(2);
  });
});

// #220: an owner who already has a key pair creating the data key for a
// fresh household.
describe("createHouseholdKey", () => {
  it("wraps the key to the owner at the current version and stores the kit", async () => {
    const hid = await makeHousehold("o");
    await db.update(households).set({ keyVersion: 3, rotationDue: true }).where(eq(households.id, hid));
    await db.insert(memberKeys).values({
      userId: "o", publicKey: "PUBo", wrappedPrivateKey: "PRIVo", privateKeyIv: "IVIV",
      kdfSalt: "AAAA", kdfMemoryKib: 65536, kdfIterations: 3, kdfParallelism: 1, kdfVersion: 1,
    });
    await createHouseholdKey({ householdId: hid, userId: "o", role: "owner", wrappedKey: "WRAP", recovery });
    const s = await getCryptoStatus(hid, "o", "owner");
    expect(s.wrap).toBe("WRAP");
    expect(s.wrapKeyVersion).toBe(3);
    expect(s.recovery?.wrappedKey).toBe("RECOV");
    expect(s.rotationDue).toBe(false);
  });

  it("refuses a member, a user without keys, and a household that already has a key", async () => {
    const hid = await makeHousehold("o", "m");
    await expect(
      createHouseholdKey({ householdId: hid, userId: "m", role: "member", wrappedKey: "W", recovery })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createHouseholdKey({ householdId: hid, userId: "o", role: "owner", wrappedKey: "W", recovery })
    ).rejects.toMatchObject({ status: 409, message: /Set up your keys/ });
    await setupMemberKeys({ householdId: hid, userId: "o", role: "owner", member: member("o"), household: { wrappedKey: "WRAPO", recovery } });
    await expect(
      createHouseholdKey({ householdId: hid, userId: "o", role: "owner", wrappedKey: "W", recovery })
    ).rejects.toMatchObject({ status: 409, message: /already exists/ });
  });
});

describe("who made the recovery kit (#192)", () => {
  async function kitAuthor(hid: number) {
    const [h] = await db
      .select({ by: households.recoveryCreatedBy, at: households.recoveryCreatedAt })
      .from(households)
      .where(eq(households.id, hid));
    return h;
  }

  async function withKit() {
    const hid = await makeHousehold("o", "m");
    await setupMemberKeys({
      householdId: hid,
      userId: "o",
      role: "owner",
      member: member("o"),
      household: { wrappedKey: "WRAPO", recovery },
    });
    return hid;
  }

  it("is the creator at setup", async () => {
    const hid = await withKit();
    const h = await kitAuthor(hid);
    expect(h.by).toBe("o");
    expect(h.at).toBeInstanceOf(Date);
  });

  it("is whoever regenerated it", async () => {
    const hid = await withKit();
    await replaceRecovery(hid, "m", { wrappedKey: "R2", iv: "I2", kdf });
    expect((await kitAuthor(hid)).by).toBe("m");
  });

  it("is a member who recovered with the code", async () => {
    const hid = await withKit();
    await recoverHousehold(hid, "m", { member: member("m"), wrappedKey: "WM", recovery });
    expect((await kitAuthor(hid)).by).toBe("m");
  });

  it("is the owner who created a household key", async () => {
    const hid = await makeHousehold("o");
    await db.insert(memberKeys).values({
      userId: "o", publicKey: "PUBo", wrappedPrivateKey: "PRIVo", privateKeyIv: "IVIV",
      kdfSalt: "AAAA", kdfMemoryKib: 65536, kdfIterations: 3, kdfParallelism: 1, kdfVersion: 1,
    });
    await createHouseholdKey({ householdId: hid, userId: "o", role: "owner", wrappedKey: "WRAP", recovery });
    expect((await kitAuthor(hid)).by).toBe("o");
  });

  it("is the owner who rotated", async () => {
    const hid = await rotatableHousehold();
    await db
      .update(householdMembers)
      .set({ role: "owner" })
      .where(eq(householdMembers.userId, "m"));
    await rotateHouseholdKey(hid, "m", request());
    expect((await kitAuthor(hid)).by).toBe("m");
  });
});
