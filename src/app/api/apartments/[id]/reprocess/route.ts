import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { chargeReprocess } from "@/lib/billing";

type Ctx = { params: Promise<{ id: string }> };

// A reprocess is an explicit, charged request (#413): one credit, spent
// here before the client reads the PDF again and geocodes the address. The
// process calls that follow name the apartment and are then free. Any member
// may ask, like adding an apartment (#294).
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
    const [row] = await db
      .select({ id: apartments.id })
      .from(apartments)
      .where(and(eq(apartments.id, id), eq(apartments.householdId, householdId)))
      .limit(1);
    if (!row) throw new ApiError("Not found", 404);
    await chargeReprocess(householdId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e, "apartments:reprocess");
  }
}
