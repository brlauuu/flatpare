import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, apartmentDistances } from "@/lib/db/schema";
import { extractApartmentData } from "@/lib/parse-pdf";
import { classifyParsePdfError } from "@/lib/parse-pdf-error";
import { INFERABLE_FIELDS } from "@/lib/edited-fields";
import { readStoredFile } from "@/lib/storage";
import { listLocations } from "@/lib/locations";
import { calculateDistance } from "@/lib/distance";
import { geocodeLatLng } from "@/lib/geocode";

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
      const buf = await readStoredFile(apt.pdfUrl);
      pdfBase64 = buf.toString("base64");
    } catch (err) {
      console.error("[reprocess] PDF read failed:", err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Failed to read PDF",
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

    const updated = result[0];

    // Re-compute distances when the address actually changed. Delete then
    // re-insert per location, mirroring the POST /apartments flow.
    const addressChanged =
      "address" in updates && updates.address !== apt.address;
    if (addressChanged && updated.address) {
      try {
        const coords = await geocodeLatLng(updated.address);
        await db
          .update(apartments)
          .set({
            latitude: coords?.lat ?? null,
            longitude: coords?.lng ?? null,
          })
          .where(eq(apartments.id, apartmentId));
      } catch (err) {
        console.error(
          `[reprocess] geocode failed apt=${apartmentId}:`,
          err
        );
      }

      await db
        .delete(apartmentDistances)
        .where(eq(apartmentDistances.apartmentId, apartmentId));

      const locations = await listLocations();
      for (const loc of locations) {
        try {
          const { bikeMinutes, transitMinutes } = await calculateDistance(
            loc.address,
            updated.address
          );
          await db.insert(apartmentDistances).values({
            apartmentId,
            locationId: loc.id,
            bikeMin: bikeMinutes,
            transitMin: transitMinutes,
          });
        } catch (err) {
          console.error(
            `[reprocess] distance calc failed apt=${apartmentId} loc=${loc.id}:`,
            err
          );
        }
      }
    }

    return NextResponse.json(updated);
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
