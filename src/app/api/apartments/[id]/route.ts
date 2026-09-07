import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import {
  apiErrorResponse,
  parseBody,
  requireEnvelopeMode,
  requireMember,
} from "@/lib/api-route";
import { envelopeSchema } from "@/lib/crypto-schemas";
import { apartmentRow } from "@/lib/data-rows";
import { deleteStoredFile, storedPathHousehold } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  version: z.number().int().min(1),
  envelope: envelopeSchema,
});
const deleteSchema = z.object({ pdfPath: z.string().min(1).optional() });

// A malformed id is a 404 like an unknown one: the id space is opaque and
// there is nothing to validate against.
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

    // Optimistic concurrency: the UPDATE only lands when the version the
    // client read is still current. Zero rows means stale or not ours.
    const updated = await db
      .update(apartments)
      .set({
        envelope: JSON.stringify(body.envelope),
        version: sql`${apartments.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(apartments.id, id),
          eq(apartments.householdId, householdId),
          eq(apartments.version, body.version)
        )
      )
      .returning();
    if (updated.length === 1) return NextResponse.json(apartmentRow(updated[0]));

    const [current] = await db
      .select({ version: apartments.version })
      .from(apartments)
      .where(and(eq(apartments.id, id), eq(apartments.householdId, householdId)));
    if (!current) throw new ApiError("Not found", 404);
    return NextResponse.json(
      { error: "Stale version", version: current.version },
      { status: 409 }
    );
  } catch (e) {
    return apiErrorResponse(e, "apartments:update");
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { householdId } = await requireMember();
    const id = await rowId(ctx);
    // The body is optional: a plain DELETE has no pdf to remove.
    const text = await req.text();
    const body = text ? deleteSchema.parse(JSON.parse(text)) : {};
    let pdfPath: string | null = null;
    if (body.pdfPath) {
      const resolved = storedPathHousehold(body.pdfPath);
      if (!resolved || resolved.householdId !== householdId) {
        throw new ApiError("pdfPath does not belong to this household", 400);
      }
      pdfPath = resolved.canonicalUrl;
    }

    const deleted = await db
      .delete(apartments)
      .where(and(eq(apartments.id, id), eq(apartments.householdId, householdId)))
      .returning({ id: apartments.id });
    if (deleted.length === 0) throw new ApiError("Not found", 404);

    if (pdfPath) await deleteStoredFile(pdfPath, householdId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
    }
    return apiErrorResponse(e, "apartments:delete");
  }
}
