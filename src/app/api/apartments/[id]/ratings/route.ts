import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments, ratings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  assertMembership,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/household";
import { requireHousehold } from "@/lib/session";

const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let householdId: number;
  let userId: string;
  try {
    ({ householdId, userId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }

  try {
    await assertMembership(householdId, userId);
  } catch (e) {
    if (e instanceof ForbiddenError) return notFound();
    throw e;
  }

  try {
    const { id } = await params;
    const apartmentId = parseInt(id);
    if (!Number.isInteger(apartmentId)) return notFound();

    // Rating an apartment writes a row keyed to it, so the apartment itself
    // must belong to the caller's household — otherwise a rating (and its
    // comment) lands in someone else's data.
    const owned = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(
        and(
          eq(apartments.id, apartmentId),
          eq(apartments.householdId, householdId)
        )
      )
      .limit(1);
    if (owned.length === 0) return notFound();

    const body = await request.json();

    // Upsert: update if exists, insert if not
    const existing = await db
      .select()
      .from(ratings)
      .where(
        and(
          eq(ratings.apartmentId, apartmentId),
          eq(ratings.userId, userId),
          eq(ratings.householdId, householdId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const result = await db
        .update(ratings)
        .set({
          kitchen: body.kitchen,
          balconies: body.balconies,
          location: body.location,
          floorplan: body.floorplan,
          overallFeeling: body.overallFeeling,
          comment: body.comment,
        })
        .where(
          and(
            eq(ratings.id, existing[0].id),
            eq(ratings.householdId, householdId)
          )
        )
        .returning();

      return NextResponse.json(result[0]);
    }

    const result = await db
      .insert(ratings)
      .values({
        householdId,
        apartmentId,
        userId,
        kitchen: body.kitchen,
        balconies: body.balconies,
        location: body.location,
        floorplan: body.floorplan,
        overallFeeling: body.overallFeeling,
        comment: body.comment,
      })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("[ratings:POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save rating" },
      { status: 500 }
    );
  }
}
