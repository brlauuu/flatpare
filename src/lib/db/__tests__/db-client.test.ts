/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// src/lib/db/index.ts branches on the resolved target: a cloud target must be
// given its auth token, a local one must not. Every test run resolves local,
// so the cloud arm never executed — and a dropped `authToken` there would
// fail only in production, as an auth error against Turso.
//
// resolveDbTarget's own logic is covered in target.test.ts; what is asserted
// here is purely what index.ts hands to createClient.

interface ClientOptions {
  url: string;
  authToken?: string;
}
const createClient = vi.fn<(opts: ClientOptions) => { __client: boolean }>(() => ({
  __client: true,
}));
vi.mock("@libsql/client", () => ({
  createClient: (opts: ClientOptions) => createClient(opts),
}));
vi.mock("drizzle-orm/libsql", () => ({ drizzle: (c: unknown) => ({ __db: c }) }));

const resolveDbTarget = vi.fn();
vi.mock("@/lib/db/target", () => ({ resolveDbTarget: () => resolveDbTarget() }));

beforeEach(() => {
  vi.resetModules();
  createClient.mockClear();
  resolveDbTarget.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

describe("src/lib/db client construction", () => {
  it("passes the auth token for a cloud target", async () => {
    resolveDbTarget.mockReturnValue({
      kind: "cloud",
      url: "libsql://flatpare-test.turso.io",
      authToken: "token-abc",
      label: "Turso (cloud) — flatpare-test.turso.io",
    });

    await import("@/lib/db");

    expect(createClient).toHaveBeenCalledWith({
      url: "libsql://flatpare-test.turso.io",
      authToken: "token-abc",
    });
  });

  it("omits authToken entirely for a local target", async () => {
    // Not `authToken: undefined` — the local arm builds a different object, and
    // passing the key at all invites a future refactor to read it.
    resolveDbTarget.mockReturnValue({
      kind: "local",
      url: "file:./data/test.db",
      label: "local file — file:./data/test.db",
    });

    await import("@/lib/db");

    expect(createClient).toHaveBeenCalledWith({ url: "file:./data/test.db" });
    expect(createClient.mock.calls[0][0]).not.toHaveProperty("authToken");
  });

  it("builds the client from resolveDbTarget, not from process.env directly", async () => {
    // The point of #195: the connection opened here and the line logged at
    // boot come from one value, so they cannot disagree about which database
    // is live.
    resolveDbTarget.mockReturnValue({
      kind: "local",
      url: "file:./data/whatever.db",
      label: "local file — file:./data/whatever.db",
    });
    process.env.TURSO_DATABASE_URL = "libsql://should-be-ignored.turso.io";

    await import("@/lib/db");

    expect(resolveDbTarget).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith({ url: "file:./data/whatever.db" });
    delete process.env.TURSO_DATABASE_URL;
  });
});
