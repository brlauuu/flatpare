import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, ratings } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { ratingRow } from "@/lib/data-rows";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ envelope: envelopeSchema });

// Ratings hang off an apartment the caller's household owns; anything else
// is 404 so the id space stays opaque across households.
async function ownedApartmentId(ctx: Ctx, householdId: number): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
  const [row] = await db
    .select({ id: apartments.id })
    .from(apartments)
    .where(and(eq(apartments.id, id), eq(apartments.householdId, householdId)));
  if (!row) throw new ApiError("Not found", 404);
  return row.id;
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { householdId, userId } = await requireMember();
    const apartmentId = await ownedApartmentId(ctx, householdId);
    const body = await parseBody(req, bodySchema);
    requireEnvelopeMode(body.envelope);

    const envelope = JSON.stringify(body.envelope);
    const [saved] = await db
      .insert(ratings)
      .values({ householdId, apartmentId, userId, envelope })
      .onConflictDoUpdate({
        target: [ratings.apartmentId, ratings.userId],
        set: { envelope, updatedAt: new Date() },
      })
      .returning();
    const [user] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId));
    return NextResponse.json(ratingRow({ ...saved, userName: user?.name ?? null }));
  } catch (e) {
    return apiErrorResponse(e, "ratings:upsert");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { householdId, userId } = await requireMember();
    const apartmentId = await ownedApartmentId(ctx, householdId);
    await db
      .delete(ratings)
      .where(and(eq(ratings.apartmentId, apartmentId), eq(ratings.userId, userId)));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "ratings:delete");
  }
}
