import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AUTH_COOKIE, NAME_COOKIE, authCookieMatches, authCookieValue } from "./auth-cookie";

// Defense-in-depth helper for API routes. The proxy already 401s `/api/*`
// for unauthenticated callers; routes still call this so they fail closed
// if the proxy is ever misconfigured.
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return authCookieMatches(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function setAuthenticated(): Promise<void> {
  const value = authCookieValue();
  if (!value) throw new Error("APP_PASSWORD is not set");
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !process.env.DISABLE_SECURE_COOKIES,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function getDisplayName(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(NAME_COOKIE)?.value ?? null;
}

export async function setDisplayName(name: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(NAME_COOKIE, name, {
    httpOnly: false, // readable by client JS
    secure: process.env.NODE_ENV === "production" && !process.env.DISABLE_SECURE_COOKIES,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function verifyPassword(input: string): boolean {
  const password = process.env.APP_PASSWORD;
  if (!password || !input) return false;

  // Hash both sides first: timingSafeEqual throws on a length mismatch, so
  // comparing the raw strings would both leak length and crash on input of
  // the wrong size. Equal-length digests avoid that.
  const inputHash = createHmac("sha256", password).update(input).digest();
  const expectedHash = createHmac("sha256", password).update(password).digest();

  return timingSafeEqual(inputHash, expectedHash);
}
