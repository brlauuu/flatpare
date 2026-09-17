import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { betaPasses, betaPassRedemptions } from "@/lib/db/schema";
import {
  BETA_PASS_COOKIE,
  BETA_PASS_COOKIE_MAX_AGE_SECONDS,
  createBetaPass,
  revokeBetaPass,
} from "@/lib/beta-pass";
import { GET } from "../[code]/route";

beforeEach(async () => {
  await db.delete(betaPassRedemptions);
  await db.delete(betaPasses);
});

function open(code: string, origin = "http://localhost:3002") {
  const req = new NextRequest(`${origin}/beta/${code}`);
  return GET(req, { params: Promise.resolve({ code }) });
}

async function usesOf(code: string): Promise<number> {
  const rows = await db.select().from(betaPasses);
  return rows.find((r) => r.code === code)!.uses;
}

describe("GET /beta/[code]", () => {
  it("sets the pass cookie and sends a live link to the landing page", async () => {
    const pass = await createBetaPass();
    const res = await open(pass.code);

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).search).toBe("?beta=ready");

    const cookie = res.cookies.get(BETA_PASS_COOKIE);
    expect(cookie?.value).toBe(pass.code);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(BETA_PASS_COOKIE_MAX_AGE_SECONDS);
  });

  // Like Auth.js's own session cookie: Secure only over https, so a
  // plain-http self-host (docker compose up, no AUTH_URL) still works.
  it("marks the cookie Secure exactly when the request is https", async () => {
    const pass = await createBetaPass();
    const plain = await open(pass.code, "http://localhost:3002");
    expect(plain.cookies.get(BETA_PASS_COOKIE)?.secure).toBeFalsy();
    const tls = await open(pass.code, "https://flatpare.example");
    expect(tls.cookies.get(BETA_PASS_COOKIE)?.secure).toBe(true);
  });

  // The pass is spent when it admits an account, not when the link is
  // opened: a tester who opens it twice, or never signs up, does not burn it.
  it("does not consume a use", async () => {
    const pass = await createBetaPass({ maxUses: 1 });
    await open(pass.code);
    await open(pass.code);
    expect(await usesOf(pass.code)).toBe(0);
  });

  it.each([
    ["unknown", async () => "0000000000000000000000000000dead"],
    ["revoked", async () => {
      const p = await createBetaPass();
      await revokeBetaPass(p.code);
      return p.code;
    }],
    ["expired", async () =>
      (await createBetaPass({ expiresAt: new Date(Date.now() - 1000) })).code],
    ["used up", async () => (await createBetaPass({ maxUses: 0 })).code],
  ])("sends a(n) %s link to the landing page with no cookie, and never echoes the code", async (_label, makeCode) => {
    const code = await makeCode();
    const res = await open(code);

    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    expect(new URL(location).search).toBe("?beta=invalid");
    expect(location).not.toContain(code);
    expect(res.cookies.get(BETA_PASS_COOKIE)).toBeUndefined();
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
