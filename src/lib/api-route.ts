import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "@/lib/api-error";
import { scrubbedErrorLine } from "@/lib/log-scrub";
import { assertEnvelopeMode, type Envelope } from "@/lib/crypto";
import { readEncryptionMode } from "@/lib/encryption-mode";
import { assertMembership, ForbiddenError, UnauthorizedError, type Role } from "@/lib/household";
import { requireHousehold } from "@/lib/session";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";

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
    return NextResponse.json({ ...err.details, error: err.message }, { status: err.status });
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

// Parses a numeric path parameter that names a row. Only a canonical positive
// decimal integer passes — "1", not "01", " 1", "1.0", "1e3", "-1" or "".
// The old `Number.isInteger(Number(raw))` guard read as if it rejected empty
// input and did not: Number("") is 0 and 0 is an integer (#290). Nothing was
// reachable through that, since ids autoincrement from 1, but a guard that
// does not do what it says is a trap for the next route that copies it.
export function parseIdParam(raw: string, label = "id"): number {
  if (!/^[1-9]\d*$/.test(raw)) throw new ApiError(`Invalid ${label}`, 400);
  return Number(raw);
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

// Data-key rotation (#219): a v1 envelope must be sealed under the
// household's CURRENT data key. A device that still holds the previous key
// — a removed member, or a member whose browser has not re-keyed yet —
// would otherwise write ciphertext nobody else can open. The client treats
// `409 Stale key` as "refresh the crypto status, then retry"; the version in
// the body tells it what to expect. A v0 envelope has no key to check.
export async function requireCurrentKey(
  householdId: number,
  envelope: Envelope
): Promise<void> {
  if (envelope.v !== 1) return;
  const [row] = await db
    .select({ keyVersion: households.keyVersion })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  const current = row?.keyVersion ?? 1;
  if ((envelope.k ?? 1) !== current) {
    throw new ApiError("Stale key", 409, { keyVersion: current });
  }
}

// Re-exported from a leaf module so `src/auth.ts` can use the same check
// without importing this file, which reaches back to `@/auth` through
// `@/lib/session`. Kept exported here because every data route already
// imports it alongside `parseBody` / `requireMember`.
export { isUniqueConstraintError } from "@/lib/unique-constraint";
