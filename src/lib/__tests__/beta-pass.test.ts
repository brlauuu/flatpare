import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { betaPasses, betaPassRedemptions } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import {
  consumeBetaPassUse,
  createBetaPass,
  findBetaPass,
  findBetaPassRedemption,
  findUsableBetaPass,
  isBetaPassUsable,
  newBetaPassCode,
  recordBetaPassRedemption,
  revokeBetaPass,
} from "../beta-pass";

beforeEach(async () => {
  await db.delete(betaPassRedemptions);
  await db.delete(betaPasses);
  await db.delete(users);
});

async function usesOf(code: string): Promise<number> {
  const [row] = await db
    .select({ uses: betaPasses.uses })
    .from(betaPasses)
    .where(eq(betaPasses.code, code));
  return row.uses;
}

describe("newBetaPassCode", () => {
  it("is 32 URL-safe hex characters and does not repeat", () => {
    const a = newBetaPassCode();
    const b = newBetaPassCode();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe("createBetaPass", () => {
  it("defaults to unlimited uses, no expiry, 40 credits, and a fresh code", async () => {
    const pass = await createBetaPass();
    expect(pass.code).toMatch(/^[0-9a-f]{32}$/);
    expect(pass.label).toBeNull();
    expect(pass.credits).toBe(40);
    expect(pass.maxUses).toBeNull();
    expect(pass.uses).toBe(0);
    expect(pass.expiresAt).toBeNull();
    expect(pass.revokedAt).toBeNull();
  });

  it("stores what it is given", async () => {
    const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 60_000);
    const pass = await createBetaPass({
      label: "Ana",
      credits: 80,
      maxUses: 1,
      expiresAt,
    });
    expect(pass.label).toBe("Ana");
    expect(pass.credits).toBe(80);
    expect(pass.maxUses).toBe(1);
    expect(pass.expiresAt?.getTime()).toBe(expiresAt.getTime());
  });
});

describe("isBetaPassUsable", () => {
  const base = {
    id: 1,
    code: "c",
    label: null,
    credits: 40,
    maxUses: null,
    uses: 0,
    expiresAt: null,
    revokedAt: null,
    createdAt: null,
  };
  const now = new Date("2026-09-17T12:00:00Z");

  it("is usable by default", () => {
    expect(isBetaPassUsable(base, now)).toBe(true);
  });
  it("is not usable once revoked", () => {
    expect(isBetaPassUsable({ ...base, revokedAt: now }, now)).toBe(false);
  });
  it("is not usable at or after its expiry", () => {
    expect(isBetaPassUsable({ ...base, expiresAt: now }, now)).toBe(false);
    expect(
      isBetaPassUsable({ ...base, expiresAt: new Date(now.getTime() + 1000) }, now)
    ).toBe(true);
  });
  it("is not usable once its uses are spent", () => {
    expect(isBetaPassUsable({ ...base, maxUses: 2, uses: 2 }, now)).toBe(false);
    expect(isBetaPassUsable({ ...base, maxUses: 2, uses: 1 }, now)).toBe(true);
  });
});

describe("findUsableBetaPass", () => {
  it("returns the pass for a live code and null for an unknown, empty, revoked, expired or exhausted one", async () => {
    const live = await createBetaPass();
    expect((await findUsableBetaPass(live.code))?.id).toBe(live.id);

    expect(await findUsableBetaPass("")).toBeNull();
    expect(await findUsableBetaPass("nope")).toBeNull();

    const revoked = await createBetaPass();
    await revokeBetaPass(revoked.code);
    expect(await findUsableBetaPass(revoked.code)).toBeNull();

    const expired = await createBetaPass({ expiresAt: new Date(Date.now() - 60_000) });
    expect(await findUsableBetaPass(expired.code)).toBeNull();

    const spent = await createBetaPass({ maxUses: 1 });
    expect(await consumeBetaPassUse(spent.code)).not.toBeNull();
    expect(await findUsableBetaPass(spent.code)).toBeNull();
  });
});

describe("consumeBetaPassUse", () => {
  it("increments uses and returns the pass", async () => {
    const pass = await createBetaPass({ maxUses: 3 });
    const used = await consumeBetaPassUse(pass.code);
    expect(used?.id).toBe(pass.id);
    expect(used?.uses).toBe(1);
    expect(await usesOf(pass.code)).toBe(1);
  });

  it("counts uses on an unlimited pass too, so #240 can see it was used", async () => {
    const pass = await createBetaPass();
    await consumeBetaPassUse(pass.code);
    await consumeBetaPassUse(pass.code);
    expect(await usesOf(pass.code)).toBe(2);
  });

  it("refuses an unknown, empty, revoked or expired code without touching the counter", async () => {
    expect(await consumeBetaPassUse("")).toBeNull();
    expect(await consumeBetaPassUse("nope")).toBeNull();

    const revoked = await createBetaPass();
    await revokeBetaPass(revoked.code);
    expect(await consumeBetaPassUse(revoked.code)).toBeNull();
    expect(await usesOf(revoked.code)).toBe(0);

    const expired = await createBetaPass({ expiresAt: new Date(Date.now() - 60_000) });
    expect(await consumeBetaPassUse(expired.code)).toBeNull();
    expect(await usesOf(expired.code)).toBe(0);

    const future = await createBetaPass({ expiresAt: new Date(Date.now() + 60_000) });
    expect(await consumeBetaPassUse(future.code)).not.toBeNull();
  });

  // The whole reason it is one guarded UPDATE: eight people opening a
  // three-use link at once must yield exactly three accounts, not eight.
  it("never overspends max_uses under concurrency", async () => {
    const pass = await createBetaPass({ maxUses: 3 });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => consumeBetaPassUse(pass.code))
    );
    expect(results.filter((r) => r !== null)).toHaveLength(3);
    expect(await usesOf(pass.code)).toBe(3);
  });
});

describe("revokeBetaPass", () => {
  it("reports whether it revoked anything and is idempotent", async () => {
    const pass = await createBetaPass();
    expect(await revokeBetaPass(pass.code)).toBe(true);
    expect(await revokeBetaPass(pass.code)).toBe(false);
    expect(await revokeBetaPass("nope")).toBe(false);
    expect((await findBetaPass(pass.code))?.revokedAt).not.toBeNull();
  });

  // Decided on #240: revocation stops the link, never the people already in.
  it("leaves existing redemptions and the use count untouched", async () => {
    await db.insert(users).values({ id: "u1", email: "u1@example.com" });
    const pass = await createBetaPass({ maxUses: 1 });
    await consumeBetaPassUse(pass.code);
    await recordBetaPassRedemption(pass.id, "u1");

    await revokeBetaPass(pass.code);

    expect(await findBetaPassRedemption("u1")).toEqual({ passId: pass.id, userId: "u1" });
    expect(await usesOf(pass.code)).toBe(1);
  });
});

describe("recordBetaPassRedemption", () => {
  it("records one row per user and ignores a repeat for the same user", async () => {
    await db.insert(users).values({ id: "u1", email: "u1@example.com" });
    const a = await createBetaPass();
    const b = await createBetaPass();

    await recordBetaPassRedemption(a.id, "u1");
    await recordBetaPassRedemption(b.id, "u1"); // no-op: already redeemed

    expect(await findBetaPassRedemption("u1")).toEqual({ passId: a.id, userId: "u1" });
    expect(await findBetaPassRedemption("nobody")).toBeNull();
  });
});
