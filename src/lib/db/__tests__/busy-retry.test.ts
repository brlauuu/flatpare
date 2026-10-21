import { describe, it, expect, vi, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { isBusyError, retryOnBusy } from "../busy-retry";

const busy = () => Object.assign(new Error("SQLITE_BUSY: database is locked"), { code: "SQLITE_BUSY" });

afterEach(() => {
  vi.useRealTimers();
});

describe("isBusyError", () => {
  it("recognises the code, the message and a wrapped cause", () => {
    expect(isBusyError(busy())).toBe(true);
    expect(isBusyError(new Error("SQLITE_BUSY: cannot commit transaction"))).toBe(true);
    expect(isBusyError(new Error("Failed query", { cause: busy() }))).toBe(true);
    expect(isBusyError({ code: "SQLITE_LOCKED" })).toBe(true);
  });

  it("does not treat other failures as busy", () => {
    expect(isBusyError(new Error("UNIQUE constraint failed"))).toBe(false);
    expect(isBusyError({ code: "SQLITE_CONSTRAINT" })).toBe(false);
    expect(isBusyError(null)).toBe(false);
    expect(isBusyError("SQLITE_BUSY")).toBe(false);
  });
});

describe("retryOnBusy", () => {
  it("retries a busy failure until it succeeds", async () => {
    const run = vi.fn().mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValue("ok");
    await expect(retryOnBusy(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("rethrows anything else at once", async () => {
    const err = new Error("UNIQUE constraint failed");
    const run = vi.fn().mockRejectedValue(err);
    await expect(retryOnBusy(run)).rejects.toBe(err);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives up after the deadline with the busy error", async () => {
    const err = busy();
    const run = vi.fn().mockRejectedValue(err);
    await expect(retryOnBusy(run, 30)).rejects.toBe(err);
    expect(run.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("db.transaction", () => {
  // The wrap in src/lib/db/index.ts. Without it, 1 of 10 of these succeeded
  // and the rest failed with SQLITE_BUSY (#225).
  it("queues concurrent write transactions instead of failing them", async () => {
    await db.run(sql`CREATE TABLE IF NOT EXISTS busy_probe (n INTEGER NOT NULL)`);
    await db.run(sql`DELETE FROM busy_probe`);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        db.transaction(async (tx) => {
          await tx.run(sql`INSERT INTO busy_probe (n) VALUES (${i})`);
          await tx.run(sql`SELECT COUNT(*) FROM busy_probe`);
        })
      )
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const { rows } = await db.run(sql`SELECT COUNT(*) AS c FROM busy_probe`);
    expect(Number(rows[0].c)).toBe(10);
  });
});
