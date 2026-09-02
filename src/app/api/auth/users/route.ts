import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { householdMembers, users } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { UnauthorizedError } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

// Legacy display-name endpoint. Task 6 deletes it along with the rest of the
// shared-password model; until then it must not be a cross-tenant leak. It
// used to list EVERY name in the `users` table, which under multi-tenancy is
// every user of the deployment. It is also reachable without the proxy gate:
// `/api/auth/*` is allow-listed wholesale (ruling R3), so this route's own
// check is the only thing standing in front of it.
export async function GET() {
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }

  try {
    const rows = await db
      .select({ name: users.name })
      .from(users)
      .innerJoin(householdMembers, eq(householdMembers.userId, users.id))
      .where(eq(householdMembers.householdId, householdId))
      .orderBy(asc(users.name));
    // A member who has no display name yet has nothing to show in the
    // switcher; drop rather than emit null into a string[] response.
    return NextResponse.json(
      rows.map((r) => r.name).filter((n): n is string => typeof n === "string")
    );
  } catch (error) {
    console.error("[auth/users:GET] Error:", error);
    return NextResponse.json([], { status: 200 });
  }
}
