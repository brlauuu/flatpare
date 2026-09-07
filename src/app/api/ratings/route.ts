import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ratings } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { ratingRow } from "@/lib/data-rows";

// One fetch for the whole household: ratings are small and the client
// derives every average locally.
export async function GET() {
  try {
    const { householdId } = await requireMember();
    const rows = await db
      .select({
        householdId: ratings.householdId,
        apartmentId: ratings.apartmentId,
        userId: ratings.userId,
        envelope: ratings.envelope,
        createdAt: ratings.createdAt,
        updatedAt: ratings.updatedAt,
        userName: users.name,
      })
      .from(ratings)
      .innerJoin(users, eq(users.id, ratings.userId))
      .where(eq(ratings.householdId, householdId));
    return NextResponse.json(rows.map(ratingRow));
  } catch (e) {
    return apiErrorResponse(e, "ratings:list");
  }
}
