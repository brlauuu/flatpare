import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  isUniqueConstraintError,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { locationRow } from "@/lib/data-rows";
import { createLocation, listLocations } from "@/lib/locations";

const createSchema = z.object({ id: z.uuid(), envelope: envelopeSchema });

export async function GET() {
  try {
    const { householdId } = await requireMember();
    return NextResponse.json((await listLocations(householdId)).map(locationRow));
  } catch (e) {
    return apiErrorResponse(e, "locations:list");
  }
}

export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    const body = await parseBody(req, createSchema);
    requireEnvelopeMode(body.envelope);
    try {
      const created = await createLocation(householdId, {
        id: body.id,
        envelope: JSON.stringify(body.envelope),
      });
      return NextResponse.json(locationRow(created), { status: 201 });
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new ApiError("Duplicate id", 409);
      throw err;
    }
  } catch (e) {
    return apiErrorResponse(e, "locations:create");
  }
}
