import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { households, householdMembers, processUsage } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import {
  consumeRateLimit,
  processRateLimitPerHour,
  RateLimitConfigError,
} from "../rate-limit";

const ORIGINAL = process.env.PROCESS_RATE_LIMIT_PER_HOUR;

let hid: number;

beforeEach(async () => {
  await db.delete(processUsage);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "u1", email: "u1@example.com" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "u1" }).returning();
  hid = h.id;
  delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL === undefined) delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;
  else process.env.PROCESS_RATE_LIMIT_PER_HOUR = ORIGINAL;
});

describe("processRateLimitPerHour", () => {
  it("is null when unset — the self-hoster default is unlimited", () => {
    delete process.env.PROCESS_RATE_LIMIT_PER_HOUR;
    expect(processRateLimitPerHour()).toBeNull();
  });

  it("is null when set to empty, which is how an unset Vercel var arrives", () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "";
    expect(processRateLimitPerHour()).toBeNull();
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "   ";
    expect(processRateLimitPerHour()).toBeNull();
  });

  it("reads a positive integer", () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "250";
    expect(processRateLimitPerHour()).toBe(250);
  });

  it("refuses a value that is not a positive integer, rather than guessing", () => {
    for (const bad of ["-1", "0", "abc", "1.5", "1e3", "Infinity"]) {
      process.env.PROCESS_RATE_LIMIT_PER_HOUR = bad;
      expect(() => processRateLimitPerHour(), bad).toThrow(RateLimitConfigError);
    }
  });
});

describe("consumeRateLimit", () => {
  it("is a no-op when the limit is unset, touching no table", async () => {
    for (let i = 0; i < 50; i++) await consumeRateLimit(hid, "geocode");
    expect(await db.select().from(processUsage)).toHaveLength(0);
  });

  it("allows exactly the configured number of calls, then throws 429", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "3";
    for (let i = 0; i < 3; i++) {
      await expect(consumeRateLimit(hid, "geocode"), `call ${i + 1}`).resolves.toBeUndefined();
    }
    await expect(consumeRateLimit(hid, "geocode")).rejects.toMatchObject({
      status: 429,
      message: "Rate limit exceeded",
    });
  });

  it("stays refused for the rest of the window", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "1";
    await consumeRateLimit(hid, "geocode");
    await expect(consumeRateLimit(hid, "geocode")).rejects.toMatchObject({ status: 429 });
    await expect(consumeRateLimit(hid, "geocode")).rejects.toMatchObject({ status: 429 });
  });

  it("counts each endpoint separately", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "1";
    await consumeRateLimit(hid, "geocode");
    await expect(consumeRateLimit(hid, "geocode")).rejects.toMatchObject({ status: 429 });
    await expect(consumeRateLimit(hid, "distance")).resolves.toBeUndefined();
    await expect(consumeRateLimit(hid, "check-listing")).resolves.toBeUndefined();
    await expect(consumeRateLimit(hid, "parse-pdf")).resolves.toBeUndefined();
  });

  it("counts each household separately", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "1";
    const [other] = await db
      .insert(households)
      .values({ name: "Other", ownerId: "u1" })
      .returning();
    await consumeRateLimit(hid, "geocode");
    await expect(consumeRateLimit(hid, "geocode")).rejects.toMatchObject({ status: 429 });
    await expect(consumeRateLimit(other.id, "geocode")).resolves.toBeUndefined();
  });

  it("starts a fresh allowance in the next hour window", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "1";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T10:30:00Z"));
    await consumeRateLimit(hid, "geocode");
    await expect(consumeRateLimit(hid, "geocode")).rejects.toMatchObject({ status: 429 });

    vi.setSystemTime(new Date("2026-09-08T11:00:01Z"));
    await expect(consumeRateLimit(hid, "geocode")).resolves.toBeUndefined();
  });

  it("counts concurrent calls without losing any to a read-modify-write race", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "5";
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => consumeRateLimit(hid, "geocode"))
    );
    const allowed = results.filter((r) => r.status === "fulfilled").length;
    expect(allowed).toBe(5);
  });

  it("stores no request content — only ids, an endpoint name, an hour and a count", async () => {
    process.env.PROCESS_RATE_LIMIT_PER_HOUR = "5";
    await consumeRateLimit(hid, "geocode");
    const [row] = await db.select().from(processUsage);
    expect(Object.keys(row).sort()).toEqual(
      ["count", "endpoint", "householdId", "windowStart"].sort()
    );
    expect(row.endpoint).toBe("geocode");
    expect(row.count).toBe(1);
    expect(row.windowStart % 3600).toBe(0);
  });
});
