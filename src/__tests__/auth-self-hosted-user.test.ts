import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, invitations } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { eq } from "drizzle-orm";
import { findOrCreateSelfHostedUser } from "@/auth";

const EMAIL = "self-hosted@flatpare.local";

beforeEach(async () => {
  await db.delete(invitations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

async function selfHostedRows() {
  return db.select().from(users).where(eq(users.email, EMAIL));
}

describe("findOrCreateSelfHostedUser", () => {
  it("creates the shared account on the first sign-in", async () => {
    const user = await findOrCreateSelfHostedUser();

    expect(user.email).toBe(EMAIL);
    expect(user.name).toBe("Self-hosted");
    expect(await selfHostedRows()).toHaveLength(1);
  });

  it("returns the same row on a later sign-in instead of creating a second", async () => {
    const first = await findOrCreateSelfHostedUser();
    const second = await findOrCreateSelfHostedUser();

    expect(second.id).toBe(first.id);
    expect(await selfHostedRows()).toHaveLength(1);
  });

  // The bug in #200: two people typing the shared password at the same time
  // both passed the select, both inserted, and each resolved to its own
  // household — a permanent split with no merge UI. The unique index makes
  // the loser's insert throw; this asserts the loser is handed the winner's
  // row rather than an error.
  it("yields one account when concurrent sign-ins race", async () => {
    const winners = await Promise.all(
      Array.from({ length: 8 }, () => findOrCreateSelfHostedUser())
    );

    const rows = await selfHostedRows();
    expect(rows).toHaveLength(1);
    const ids = new Set(winners.map((u) => u.id));
    expect(ids).toEqual(new Set([rows[0].id]));
  });

  it("propagates a failure that is not a unique-constraint clash", async () => {
    const boom = new Error("SQLITE_FULL: database or disk is full");
    const insert = vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw boom;
    });

    await expect(findOrCreateSelfHostedUser()).rejects.toThrow(/disk is full/);
    expect(await selfHostedRows()).toHaveLength(0);
    insert.mockRestore();
  });
});
