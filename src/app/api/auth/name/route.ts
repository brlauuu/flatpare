import { NextResponse } from "next/server";
import { setDisplayName } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

// Legacy display-name endpoint (Task 6 deletes it). It no longer creates a
// `users` row: identities come from Auth.js now, and inserting one here would
// mint an account with no email and no household membership. All that remains
// is the client-readable cookie the current UI still renders from.
export async function POST(request: Request) {
  try {
    await requireHousehold();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }

  const { displayName } = await request.json();

  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  await setDisplayName(displayName.trim());

  return NextResponse.json({ success: true });
}
