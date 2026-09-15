/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The boot wrapper. The migration logic it calls is tested directly
// elsewhere; what is untested here is the wrapper's own behaviour, and each
// piece of it exists because something went wrong once:
//
//   - the runtime guard, so this never runs on a non-node runtime
//   - the [db] line, because `npm run dev` writes to PRODUCTION unless
//     TURSO_DATABASE_URL is explicitly cleared (#195)
//   - the rethrow, because Next logs a swallowed boot error only at debug
//     level, which is how migration 0008 was missed in prod

const resolveDbTarget = vi.fn();
const dbTargetWarning = vi.fn();
vi.mock("@/lib/db/target", () => ({
  resolveDbTarget: () => resolveDbTarget(),
  dbTargetWarning: (t: unknown) => dbTargetWarning(t),
}));

const runMigrations = vi.fn();
vi.mock("@/lib/db/migrate", () => ({ runMigrations: () => runMigrations() }));

import { register } from "@/instrumentation";

const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_RUNTIME = "nodejs";
  resolveDbTarget.mockReturnValue({ label: "local file — file:./data/flatpare.db" });
  dbTargetWarning.mockReturnValue(null);
  runMigrations.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_RUNTIME === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME;
});

describe("register (src/instrumentation.ts)", () => {
  it("logs the database target and runs migrations on the node runtime", async () => {
    await register();
    expect(console.log).toHaveBeenCalledWith("[db] local file — file:./data/flatpare.db");
    expect(runMigrations).toHaveBeenCalledTimes(1);
  });

  it("announces the target BEFORE migrating", async () => {
    // The point of the line is to say which database is about to be written
    // to. After the fact is too late.
    const order: string[] = [];
    (console.log as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push("log");
    });
    runMigrations.mockImplementation(async () => {
      order.push("migrate");
    });

    await register();
    expect(order).toEqual(["log", "migrate"]);
  });

  it("warns when pointed at the cloud outside production", async () => {
    dbTargetWarning.mockReturnValue(
      "NODE_ENV=development but the database is CLOUD."
    );
    await register();
    expect(console.warn).toHaveBeenCalledWith(
      "[db] WARNING: NODE_ENV=development but the database is CLOUD."
    );
  });

  it("stays quiet when there is nothing to warn about", async () => {
    await register();
    expect(console.warn).not.toHaveBeenCalled();
  });

  describe("on a non-node runtime", () => {
    it("does nothing at all", async () => {
      process.env.NEXT_RUNTIME = "edge";
      await register();
      expect(runMigrations).not.toHaveBeenCalled();
      expect(resolveDbTarget).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it("does nothing when NEXT_RUNTIME is unset", async () => {
      delete process.env.NEXT_RUNTIME;
      await register();
      expect(runMigrations).not.toHaveBeenCalled();
    });
  });

  describe("when migrations fail", () => {
    it("logs the error and rethrows rather than booting broken", async () => {
      // Swallowing this is how 0008 was missed in prod: Next logs a caught
      // boot error only at debug level, so the app comes up against an
      // unmigrated database and fails later, somewhere else.
      const boom = new Error("migration 0019 failed");
      runMigrations.mockRejectedValue(boom);

      await expect(register()).rejects.toThrow("migration 0019 failed");
      expect(console.error).toHaveBeenCalledWith(
        "[instrumentation] runMigrations failed:",
        boom
      );
    });

    it("still logged the target first, so the failure is attributable", async () => {
      runMigrations.mockRejectedValue(new Error("nope"));
      await expect(register()).rejects.toThrow();
      // Knowing WHICH database the failed migration ran against is most of
      // the diagnosis.
      expect(console.log).toHaveBeenCalledWith(
        "[db] local file — file:./data/flatpare.db"
      );
    });
  });
});
