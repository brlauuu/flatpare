import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "@/lib/api-error";
import { readEncryptionMode } from "@/lib/encryption-mode";
import { ForbiddenError, UnauthorizedError } from "@/lib/household";

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
  console.error(`[${tag}]`, err);
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
