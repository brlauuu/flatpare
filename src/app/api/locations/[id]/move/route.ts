import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { locations } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { locationRow } from "@/lib/data-rows";
import { listLocations, moveLocation } from "@/lib/locations";

type Ctx = { params: Promise<{ id: string }> };

const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
    const body = await parseBody(req, moveSchema);

    const moved = await moveLocation(householdId, id, body.direction);
    if (!moved) {
      // Distinguish "at the edge" (fine, return the order) from "not ours".
      const [row] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, id), eq(locations.householdId, householdId)));
      if (!row) throw new ApiError("Not found", 404);
    }
    return NextResponse.json((await listLocations(householdId)).map(locationRow));
  } catch (e) {
    return apiErrorResponse(e, "locations:move");
  }
}
