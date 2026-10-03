import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { betaRequests } from "@/lib/db/schema";
import { BETA_REQUESTS_PER_DAY } from "@/lib/beta-requests";
import { POST } from "../route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/beta-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

async function storedEmails(): Promise<string[]> {
  const rows = await db.select({ email: betaRequests.email }).from(betaRequests);
  return rows.map((r) => r.email).sort();
}

const fetchMock = vi.fn();
const sentBodies = () =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

let logged: string[];

beforeEach(async () => {
  await db.delete(betaRequests);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "e_1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_EMAIL_DOMAIN", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("BETA_REQUEST_NOTIFY_EMAIL", "");
  logged = [];
  for (const channel of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" "));
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function emailOn() {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Flatpare <hello@flatpare.com>");
  vi.stubEnv("BETA_REQUEST_NOTIFY_EMAIL", "owner@example.com");
}

describe("POST /api/beta-requests", () => {
  it("stores a new address, normalised, and answers ok", async () => {
    const res = await post({ email: "  Ana@Example.COM " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await storedEmails()).toEqual(["ana@example.com"]);
  });

  it("answers a repeat address exactly like a new one and stores it once", async () => {
    const first = await post({ email: "ana@example.com" });
    const second = await post({ email: "ANA@example.com" });
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(await first.json());
    expect(await storedEmails()).toEqual(["ana@example.com"]);
  });

  it("silently drops a request that filled the honeypot", async () => {
    const res = await post({ email: "bot@example.com", website: "http://spam" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await storedEmails()).toEqual([]);
  });

  it("refuses something that is not an email address, without echoing it", async () => {
    const res = await post({ email: "not-an-address" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Enter a valid email address" });
    expect(JSON.stringify(body)).not.toContain("not-an-address");
  });

  it("refuses a body that is not JSON", async () => {
    const res = await post("{nope");
    expect(res.status).toBe(400);
  });

  describe("the daily cap", () => {
    async function fillToCap() {
      await db.insert(betaRequests).values(
        Array.from({ length: BETA_REQUESTS_PER_DAY }, (_, i) => ({ email: `p${i}@example.com` }))
      );
    }

    it("refuses new addresses once the cap is reached", async () => {
      await fillToCap();
      const res = await post({ email: "late@example.com" });
      expect(res.status).toBe(429);
      expect(await storedEmails()).not.toContain("late@example.com");
    });

    // While capped, a known address gets the same 429 as a new one, so the
    // answer still says nothing about who has asked.
    it("refuses a known address too while capped", async () => {
      await fillToCap();
      const res = await post({ email: "p0@example.com" });
      expect(res.status).toBe(429);
    });

    it("counts only the last 24 hours", async () => {
      await fillToCap();
      await db.run(sql`UPDATE beta_requests SET created_at = unixepoch() - 2 * 24 * 60 * 60`);
      const res = await post({ email: "next-day@example.com" });
      expect(res.status).toBe(200);
      expect(await storedEmails()).toContain("next-day@example.com");
    });

    // One atomic statement: concurrent requests at the edge cannot overshoot.
    it("does not overshoot under concurrent requests", async () => {
      await db.insert(betaRequests).values(
        Array.from({ length: BETA_REQUESTS_PER_DAY - 3 }, (_, i) => ({ email: `p${i}@example.com` }))
      );
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => post({ email: `race${i}@example.com` }))
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(3);
      expect(results.filter((r) => r.status === 429)).toHaveLength(5);
      expect(await storedEmails()).toHaveLength(BETA_REQUESTS_PER_DAY);
    });
  });

  describe("telling the owner", () => {
    it("sends nothing while email is off", async () => {
      vi.stubEnv("BETA_REQUEST_NOTIFY_EMAIL", "owner@example.com");
      await post({ email: "ana@example.com" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends nothing when no notification address is set", async () => {
      emailOn();
      vi.stubEnv("BETA_REQUEST_NOTIFY_EMAIL", "");
      await post({ email: "ana@example.com" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await storedEmails()).toEqual(["ana@example.com"]);
    });

    it("emails the owner about a new address, once", async () => {
      emailOn();
      await post({ email: "ana@example.com" });
      await post({ email: "ana@example.com" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [sent] = sentBodies();
      expect(sent.to).toEqual(["owner@example.com"]);
      expect(sent.text).toContain("ana@example.com");
      expect(sent.subject).not.toContain("ana@example.com");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)["idempotency-key"]).toMatch(/^beta-request\/\d+$/);
    });

    it("escapes the address in the HTML body", async () => {
      emailOn();
      // Valid per the schema, and hostile in HTML.
      await post({ email: "a'b@example.com" });
      const [sent] = sentBodies();
      expect(sent.html).toContain("a&#39;b@example.com");
      expect(sent.html).not.toContain("a'b@example.com");
    });

    it("keeps the request when the notification fails", async () => {
      emailOn();
      fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
      const res = await post({ email: "ana@example.com" });
      expect(res.status).toBe(200);
      expect(await storedEmails()).toEqual(["ana@example.com"]);
    });
  });

  describe("logging", () => {
    it("never logs the address, on success or failure", async () => {
      emailOn();
      fetchMock.mockRejectedValue(new TypeError("fetch failed for secret@example.com"));
      await post({ email: "secret@example.com" });
      await post({ email: "nope" });
      expect(logged.join("\n")).not.toContain("secret@example.com");
    });

    it("logs an unexpected error by class only", async () => {
      const spy = vi
        .spyOn(db, "all")
        .mockRejectedValueOnce(new Error("SQLITE_ERROR near 'secret@example.com'"));
      const res = await post({ email: "secret@example.com" });
      expect(res.status).toBe(500);
      expect(logged.join("\n")).toContain("[beta-requests] Error");
      expect(logged.join("\n")).not.toContain("secret@example.com");
      spy.mockRestore();
    });
  });
});
