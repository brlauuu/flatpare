import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import {
  apiErrorResponse,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { apartmentRow } from "@/lib/data-rows";
import { createApartmentRow } from "@/lib/apartments-store";

const createSchema = z.object({ id: z.uuid(), envelope: envelopeSchema });

export async function GET() {
  try {
    const { householdId } = await requireMember();
    const rows = await db
      .select()
      .from(apartments)
      .where(eq(apartments.householdId, householdId))
      .orderBy(asc(apartments.createdAt), asc(apartments.id));
    return NextResponse.json(rows.map(apartmentRow));
  } catch (e) {
    return apiErrorResponse(e, "apartments:list");
  }
}

export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    const body = await parseBody(req, createSchema);
    requireEnvelopeMode(body.envelope);
    // Duplicate-id and MAX_APARTMENTS handling both live in the store, so
    // the cap is enforced for every caller rather than only this route.
    const created = await createApartmentRow(householdId, {
      id: body.id,
      envelope: JSON.stringify(body.envelope),
    });
    return NextResponse.json(apartmentRow(created), { status: 201 });
  } catch (e) {
    return apiErrorResponse(e, "apartments:create");
  }
}
