import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { deleteDraft } from "@/lib/drafts";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
    if (!(await deleteDraft(householdId, id))) throw new ApiError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "drafts:delete");
  }
}
