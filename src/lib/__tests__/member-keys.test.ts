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
  fulfilWraps,
  getCryptoStatus,
  listPendingWraps,
  recoverHousehold,
  replaceMemberKeys,
  replaceRecovery,
  resetMemberKeys,
  setupMemberKeys,
} from "../member-keys";

const kdf = { salt: "AAAA", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const };
const member = (tag: string) => ({
  publicKey: `PUB${tag}`,
  wrappedPrivateKey: `PRIV${tag}`,
  privateKeyIv: "IVIV",
  kdf,
});
const recovery = { wrappedKey: "RECOV", iv: "RIV", kdf };

beforeEach(async () => {
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
    await replaceRecovery(hid, { wrappedKey: "R3", iv: "I3", kdf });
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
