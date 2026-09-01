import { createHmac, timingSafeEqual } from "node:crypto";

// Shared by `src/lib/auth.ts` (route handlers, via next/headers) and
// `src/proxy.ts` (the gate, which must not import next/headers). Keep this
// module free of Next.js imports so both runtimes can use it.

export const AUTH_COOKIE = "flatpare-auth";
export const NAME_COOKIE = "flatpare-name";

// The auth cookie carries an HMAC of a fixed label keyed by APP_PASSWORD,
// not a static "true". Without the key the value can't be produced, so a
// visitor who knows the cookie name can no longer mint their own session.
// Bumping the label invalidates every issued cookie.
const AUTH_LABEL = "flatpare-auth-v1";

export function authCookieValue(): string | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update(AUTH_LABEL).digest("hex");
}

// Constant-time compare of two hex digests. Both sides are fixed-length hex
// here, but callers pass attacker-controlled cookie values, so the length is
// checked first — timingSafeEqual throws when the buffers differ in size.
export function authCookieMatches(value: string | undefined): boolean {
  const expected = authCookieValue();
  if (!expected || !value || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
