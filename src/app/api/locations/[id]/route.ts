import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { locationRow } from "@/lib/data-rows";
import { deleteLocation, updateLocation } from "@/lib/locations";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({ envelope: envelopeSchema });

async function rowId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError("Not found", 404);
  return id;
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const id = await rowId(ctx);
    const body = await parseBody(req, updateSchema);
    requireEnvelopeMode(body.envelope);
    const updated = await updateLocation(householdId, id, JSON.stringify(body.envelope));
    if (!updated) throw new ApiError("Not found", 404);
    return NextResponse.json(locationRow(updated));
  } catch (e) {
    return apiErrorResponse(e, "locations:update");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const id = await rowId(ctx);
    if (!(await deleteLocation(householdId, id))) throw new ApiError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return apiErrorResponse(e, "locations:delete");
  }
}
