import { describe, it, expect } from "vitest";
import { resolveDbTarget, dbTargetWarning } from "../target";

// Env is passed in rather than mutated: the db module is import-time
// side-effectful, so the resolution logic is what gets covered here, not the
// log call (#195).
const env = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  over as NodeJS.ProcessEnv;

const TOKEN = "eyJhbGciOiJFZERTQSJ9.SUPER-SECRET-TOKEN";

describe("resolveDbTarget", () => {
  it("chooses the local file when TURSO_DATABASE_URL is unset", () => {
    const t = resolveDbTarget(env({}));
    expect(t.kind).toBe("local");
    expect(t.url).toBe("file:./data/flatpare.db");
    expect(t.label).toBe("local file — file:./data/flatpare.db");
  });

  it("honours LOCAL_DB_URL, which is how tests point at their own file", () => {
    const t = resolveDbTarget(env({ LOCAL_DB_URL: "file:./data/test.db" }));
    expect(t.kind).toBe("local");
    expect(t.url).toBe("file:./data/test.db");
    expect(t.label).toContain("file:./data/test.db");
  });

  it("chooses cloud when TURSO_DATABASE_URL is set", () => {
    const t = resolveDbTarget(
      env({ TURSO_DATABASE_URL: "libsql://flatpare-acme.turso.io", TURSO_AUTH_TOKEN: TOKEN })
    );
    expect(t.kind).toBe("cloud");
    expect(t.url).toBe("libsql://flatpare-acme.turso.io");
    expect(t.authToken).toBe(TOKEN);
  });

  // The documented escape hatch: an explicitly empty value overrides
  // .env.local, because the check is truthiness rather than presence.
  it("treats an explicitly empty TURSO_DATABASE_URL as local", () => {
    const t = resolveDbTarget(env({ TURSO_DATABASE_URL: "" }));
    expect(t.kind).toBe("local");
  });

  describe("the label never leaks credentials", () => {
    it("prints only the host, not the full cloud URL", () => {
      const t = resolveDbTarget(
        env({
          TURSO_DATABASE_URL: "libsql://flatpare-acme.turso.io/db?authToken=INLINE-SECRET",
          TURSO_AUTH_TOKEN: TOKEN,
        })
      );
      expect(t.label).toBe("Turso (cloud) — flatpare-acme.turso.io");
      expect(t.label).not.toContain(TOKEN);
      expect(t.label).not.toContain("INLINE-SECRET");
      expect(t.label).not.toContain("authToken");
    });

    it("does not echo a URL it failed to parse", () => {
      // Echoing an unparseable value is exactly how a token reaches a log.
      const t = resolveDbTarget(
        env({ TURSO_DATABASE_URL: "not a url ?authToken=INLINE-SECRET", TURSO_AUTH_TOKEN: TOKEN })
      );
      expect(t.label).toBe("Turso (cloud) — <unparseable url>");
      expect(t.label).not.toContain("INLINE-SECRET");
    });

    it("keeps the token out of the label even in local mode", () => {
      const t = resolveDbTarget(env({ TURSO_AUTH_TOKEN: TOKEN }));
      expect(t.label).not.toContain(TOKEN);
    });
  });
});

describe("dbTargetWarning", () => {
  const cloud = (e: Record<string, string | undefined> = {}) =>
    resolveDbTarget(env({ TURSO_DATABASE_URL: "libsql://x.turso.io", ...e }));

  it("warns when a non-production process is pointed at the cloud", () => {
    const warning = dbTargetWarning(cloud(), env({ NODE_ENV: "development" }));
    expect(warning).toContain("CLOUD");
    expect(warning).toContain("land in production");
    expect(warning).toContain("TURSO_DATABASE_URL= npm run dev");
  });

  it("warns in test too — a test run against the cloud is worse, not better", () => {
    expect(dbTargetWarning(cloud(), env({ NODE_ENV: "test" }))).not.toBeNull();
  });

  it("warns when NODE_ENV is unset", () => {
    const warning = dbTargetWarning(cloud(), env({}));
    expect(warning).toContain("undefined");
  });

  it("stays quiet for a production process on the cloud — that is correct", () => {
    expect(dbTargetWarning(cloud(), env({ NODE_ENV: "production" }))).toBeNull();
  });

  it("stays quiet for a local target regardless of NODE_ENV", () => {
    const local = resolveDbTarget(env({}));
    for (const NODE_ENV of ["development", "test", "production", undefined]) {
      expect(dbTargetWarning(local, env({ NODE_ENV })), String(NODE_ENV)).toBeNull();
    }
  });

  it("never includes the auth token", () => {
    const warning = dbTargetWarning(
      cloud({ TURSO_AUTH_TOKEN: TOKEN }),
      env({ NODE_ENV: "development" })
    );
    expect(warning).not.toContain(TOKEN);
  });
});
