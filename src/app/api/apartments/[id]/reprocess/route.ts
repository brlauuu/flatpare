import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { extractApartmentData } from "@/lib/parse-pdf";
import { classifyParsePdfError } from "@/lib/parse-pdf-error";
import { INFERABLE_FIELDS } from "@/lib/edited-fields";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const apartmentId = parseInt(id);

    const rows = await db
      .select()
      .from(apartments)
      .where(eq(apartments.id, apartmentId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const apt = rows[0];

    if (!apt.pdfUrl) {
      return NextResponse.json(
        { error: "No PDF on file for this apartment" },
        { status: 400 }
      );
    }

    let pdfBase64: string;
    try {
      const pdfRes = await fetch(apt.pdfUrl);
      if (!pdfRes.ok) throw new Error(`Failed to fetch PDF (${pdfRes.status})`);
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      pdfBase64 = buf.toString("base64");
    } catch (err) {
      console.error("[reprocess] PDF fetch failed:", err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Failed to fetch PDF",
        },
        { status: 500 }
      );
    }

    let extraction: Awaited<ReturnType<typeof extractApartmentData>>;
    try {
      extraction = await extractApartmentData(pdfBase64);
    } catch (err) {
      const classified = classifyParsePdfError(err);
      return NextResponse.json(
        {
          error: classified.message,
          reason: classified.reason,
          retryAfterSeconds: classified.retryAfterSeconds,
        },
        { status: classified.status }
      );
    }

    const editedSet = new Set<string>(
      (() => {
        const raw = apt.userEditedFields;
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed)
            ? parsed.filter((v): v is string => typeof v === "string")
            : [];
        } catch {
          return [];
        }
      })()
    );

    const updates: Record<string, unknown> = {};
    for (const field of INFERABLE_FIELDS) {
      if (editedSet.has(field)) continue;
      updates[field] = (extraction as Record<string, unknown>)[field] ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(apt);
    }

    const result = await db
      .update(apartments)
      .set(updates)
      .where(eq(apartments.id, apartmentId))
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("[apartments/id/reprocess:POST] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to reprocess",
      },
      { status: 500 }
    );
  }
}
