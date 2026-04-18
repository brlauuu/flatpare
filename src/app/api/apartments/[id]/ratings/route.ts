import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ratings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getDisplayName } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const apartmentId = parseInt(id);
  const userName = await getDisplayName();

  if (!userName) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();

  // Upsert: update if exists, insert if not
  const existing = await db
    .select()
    .from(ratings)
    .where(
      and(eq(ratings.apartmentId, apartmentId), eq(ratings.userName, userName))
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
      .where(eq(ratings.id, existing[0].id))
      .returning();

    return NextResponse.json(result[0]);
  }

  const result = await db
    .insert(ratings)
    .values({
      apartmentId,
      userName,
      kitchen: body.kitchen,
      balconies: body.balconies,
      location: body.location,
      floorplan: body.floorplan,
      overallFeeling: body.overallFeeling,
      comment: body.comment,
    })
    .returning();

  return NextResponse.json(result[0], { status: 201 });
}
