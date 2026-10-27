import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  isUniqueConstraintError,
  parseBody,
  requireCurrentKey,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { draftRow } from "@/lib/data-rows";
import { createDraft, listDrafts } from "@/lib/drafts";

const createSchema = z.object({ id: z.uuid(), envelope: envelopeSchema });

export async function GET() {
  try {
    const { householdId } = await requireMember();
    return NextResponse.json((await listDrafts(householdId)).map(draftRow));
  } catch (e) {
    return apiErrorResponse(e, "drafts:list");
  }
}

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireMember();
    const body = await parseBody(req, createSchema);
    requireEnvelopeMode(body.envelope);
    await requireCurrentKey(householdId, body.envelope);
    try {
      await createDraft(householdId, {
        id: body.id,
        createdBy: userId,
        envelope: JSON.stringify(body.envelope),
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new ApiError("Duplicate id", 409);
      throw err;
    }
    // Re-read with the creator joined so the reply carries the display name.
    const created = (await listDrafts(householdId)).find((d) => d.id === body.id);
    if (!created) throw new ApiError("Not found", 404);
    return NextResponse.json(draftRow(created), { status: 201 });
  } catch (e) {
    return apiErrorResponse(e, "drafts:create");
  }
}
