import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "@/lib/api-error";
import { scrubbedErrorLine } from "@/lib/log-scrub";
import { assertEnvelopeMode, type Envelope } from "@/lib/crypto";
import { readEncryptionMode } from "@/lib/encryption-mode";
import { assertMembership, ForbiddenError, UnauthorizedError, type Role } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

// Single error → response mapping for the E2 route handlers. `tag` names the
// route in the 500 log line, e.g. "crypto:setup".
export function apiErrorResponse(err: unknown, tag: string): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request body", issues: err.issues },
      { status: 400 }
    );
  }
  // E4: the /api/process/* routes are the documented privacy exception —
  // they are handed plaintext the user submitted, and an error thrown from
  // an outbound fetch carries the request URL (address + API key in the
  // query string). Log the class only for those. Data routes never see
  // plaintext, so their errors stay fully debuggable.
  if (tag.startsWith("process:")) {
    console.error(`[${tag}] ${scrubbedErrorLine(err)}`);
  } else {
    console.error(`[${tag}]`, err);
  }
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

// Parses JSON and validates it. Malformed JSON is a 400 via ApiError; a shape
// mismatch throws the ZodError so apiErrorResponse can include the issues.
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("Request body must be JSON", 400);
  }
  return schema.parse(raw);
}

// Every crypto write is meaningless in an encryption-off deployment; the
// client never calls them there, so a call is a bug or a probe.
export function requireEncryptionOn(): void {
  if (readEncryptionMode() === "off") {
    throw new ApiError("Encryption is off for this deployment", 409);
  }
}

// The session's householdId is a JWT claim that can outlive a membership by
// up to 24h. Every E3 data route re-checks the database, and a non-member
// gets 404 — the same answer as a row that never existed — so that a
// removed member's probes cannot tell "gone" from "not yours".
export async function requireMember(): Promise<{
  householdId: number;
  userId: string;
  role: Role;
}> {
  const { householdId, userId } = await requireHousehold();
  try {
    const role = await assertMembership(householdId, userId);
    return { householdId, userId, role };
  } catch (err) {
    if (err instanceof ForbiddenError) throw new ApiError("Not found", 404);
    throw err;
  }
}

// A client that sends a v0 envelope to an encrypted deployment (or v1 to an
// unencrypted one) has a bug; the row must not be written.
export function requireEnvelopeMode(envelope: Envelope): void {
  try {
    assertEnvelopeMode(envelope, readEncryptionMode());
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "Bad envelope", 400);
  }
}

// Re-exported from a leaf module so `src/auth.ts` can use the same check
// without importing this file, which reaches back to `@/auth` through
// `@/lib/session`. Kept exported here because every data route already
// imports it alongside `parseBody` / `requireMember`.
export { isUniqueConstraintError } from "@/lib/unique-constraint";
