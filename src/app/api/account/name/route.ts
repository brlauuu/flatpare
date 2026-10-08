import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse } from "@/lib/api-route";
import { displayName, parseDisplayName } from "@/lib/display-name";
import { UnauthorizedError } from "@/lib/household";
import { scrubbedErrorLine } from "@/lib/log-scrub";
import { requireHousehold } from "@/lib/session";

// Sets the caller's own display name (#327); an empty name clears it, which
// brings back the email fallback. Only ever the caller's row: the user id
// comes from the session, never the body.
//
// The name is account data in the plaintext Auth.js `users` table, not
// household data (see src/lib/display-name.ts). Nothing here logs it: a
// validation failure answers a fixed message, and an unexpected error logs
// its class only, since a database error can quote the value it was given.
export async function PUT(req: Request) {
  try {
    const { userId } = await requireHousehold();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError("Request body must be JSON", 400);
    }
    const parsed = parseDisplayName((body as { name?: unknown } | null)?.name);
    if (!parsed.ok) throw new ApiError(parsed.error, 400);

    const [row] = await db
      .update(users)
      .set({ name: parsed.name })
      .where(eq(users.id, userId))
      .returning({ name: users.name, email: users.email });
    if (!row) throw new UnauthorizedError();
    return NextResponse.json({ name: row.name, displayName: displayName(row.name, row.email) });
  } catch (e) {
    if (e instanceof ApiError || e instanceof UnauthorizedError) return apiErrorResponse(e, "account:name");
    console.error(`[account:name] ${scrubbedErrorLine(e)}`);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
