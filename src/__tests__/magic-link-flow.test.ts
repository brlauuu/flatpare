/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema-auth";
import { households, householdMembers, invitations } from "@/lib/db/schema";

// The magic link (#310), end to end through Auth.js's real handlers: ask for
// a link, read it out of the (stubbed) mail call, click it, get a session.
// Every piece in between — CSRF, the token row, the gate's two calls, user
// creation, the cookie — is the real code; only the network is faked.

const VARS = [
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
  "RESEND_API_KEY", "RESEND_EMAIL_DOMAIN", "EMAIL_FROM", "FLATPARE_PUBLIC_ACCESS", "APP_PASSWORD",
] as const;

const fetchMock = vi.fn();
let jar: Record<string, string> = {};

function cookieHeader(): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}
function absorb(res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const [name, ...rest] = pair.split("=");
    const value = rest.join("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired || value === "") delete jar[name.trim()];
    else jar[name.trim()] = value;
  }
}
async function call(path: string, init?: { method?: string; body?: URLSearchParams }) {
  const { handlers } = await import("@/auth");
  const req = new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    headers: {
      cookie: cookieHeader(),
      ...(init?.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init?.body?.toString(),
  });
  const res = await (init?.method === "POST" ? handlers.POST(req) : handlers.GET(req));
  absorb(res);
  return res;
}
async function requestLink(email: string) {
  const csrf = (await (await call("/api/auth/csrf")).json()) as { csrfToken: string };
  return call("/api/auth/signin/resend", {
    method: "POST",
    body: new URLSearchParams({ email, csrfToken: csrf.csrfToken, callbackUrl: "http://localhost/apartments" }),
  });
}
function sentLink(): string | null {
  const call = fetchMock.mock.calls[0];
  if (!call) return null;
  const body = JSON.parse(String((call[1] as RequestInit).body));
  return body.text.match(/https?:\S+/)?.[0] ?? null;
}

beforeEach(async () => {
  vi.resetModules();
  for (const v of VARS) delete process.env[v];
  process.env.AUTH_SECRET = "test-secret-not-for-real-use-000000000000";
  process.env.AUTH_TRUST_HOST = "true";
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Flatpare <hello@flatpare.com>";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "e" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  jar = {};
  await db.delete(verificationTokens);
  await db.delete(invitations);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
});

afterEach(() => {
  for (const v of VARS) delete process.env[v];
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_TRUST_HOST;
  vi.unstubAllGlobals();
});

describe("magic-link sign-in (#310)", () => {
  it("sends one link, and clicking it creates the account and a session", async () => {
    const res = await requestLink("Ana@Example.com");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/api/auth/verify-request");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Lower-cased by Auth.js before anything else sees it, so the account
    // matches an invitation stored lower-case.
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).to).toEqual(["ana@example.com"]);
    expect(await db.select().from(users)).toHaveLength(0); // nothing until the click
    const link = sentLink()!;
    expect(link).toContain("/api/auth/callback/resend?");

    const clicked = await call(new URL(link).pathname + new URL(link).search);
    expect(clicked.status).toBe(302);
    expect(clicked.headers.get("location")).toBe("http://localhost/apartments");
    expect(Object.keys(jar).some((k) => k.includes("session-token"))).toBe(true);
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("ana@example.com");

    const session = (await (await call("/api/auth/session")).json()) as { user?: { email?: string }; householdId?: number };
    expect(session.user?.email).toBe("ana@example.com");
    expect(typeof session.householdId).toBe("number");
  });

  it("a link works once", async () => {
    await requestLink("ana@example.com");
    const link = sentLink()!;
    const path = new URL(link).pathname + new URL(link).search;
    await call(path);
    jar = {};
    const again = await call(path);
    expect(again.status).toBe(302);
    expect(again.headers.get("location")).toContain("error=Verification");
    expect(Object.keys(jar).some((k) => k.includes("session-token"))).toBe(false);
  });

  it("signs into an existing account made by another provider, since the link proves the address", async () => {
    await db.insert(users).values({ id: "u-google", email: "ana@example.com", name: "Ana" });
    await requestLink("ana@example.com");
    const link = sentLink()!;
    await call(new URL(link).pathname + new URL(link).search);
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("u-google");
    const session = (await (await call("/api/auth/session")).json()) as { user?: { name?: string } };
    expect(session.user?.name).toBe("Ana");
  });

  describe("when sign-ups are closed", () => {
    beforeEach(() => {
      process.env.FLATPARE_PUBLIC_ACCESS = "closed";
    });

    it("sends no link to a new address and explains on the landing page", async () => {
      const res = await requestLink("new@example.com");
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost/?signin=closed");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await db.select().from(verificationTokens)).toHaveLength(0);
    });

    it("still sends a link to an existing account", async () => {
      await db.insert(users).values({ id: "u1", email: "old@example.com" });
      const res = await requestLink("old@example.com");
      expect(res.headers.get("location")).toContain("/api/auth/verify-request");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("sends a link to an address with a pending invitation, and the click gets in", async () => {
      await db.insert(users).values({ id: "owner", email: "owner@example.com" });
      const [h] = await db.insert(households).values({ name: "H", ownerId: "owner" }).returning();
      await db.insert(householdMembers).values({ householdId: h.id, userId: "owner", role: "owner" });
      await db.insert(invitations).values({
        householdId: h.id, email: "invited@example.com", invitedBy: "owner",
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await requestLink("invited@example.com");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const link = sentLink()!;
      const clicked = await call(new URL(link).pathname + new URL(link).search);
      expect(clicked.headers.get("location")).toBe("http://localhost/apartments");
      expect(await db.select().from(users).where(eq(users.email, "invited@example.com"))).toHaveLength(1);
    });
  });

  it("the shared password is gone while email is on", async () => {
    process.env.APP_PASSWORD = "secret123";
    const ids = Object.keys((await (await call("/api/auth/providers")).json()) as object);
    expect(ids).toEqual(["resend"]);
  });
});
