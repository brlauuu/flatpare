import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  apartments,
  apartmentDistances,
  ratings,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildMapEmbedUrl } from "@/lib/map-embed";
import { isIsoDate } from "@/lib/iso-date";
import { diffInferableFields } from "@/lib/edited-fields";
import { geocodeLatLng } from "@/lib/geocode";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const apartmentId = parseInt(id);

    const apartment = await db
      .select()
      .from(apartments)
      .where(eq(apartments.id, apartmentId))
      .limit(1);

    if (apartment.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const apartmentRatings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.apartmentId, apartmentId));

    const distances = await db
      .select({
        locationId: apartmentDistances.locationId,
        bikeMin: apartmentDistances.bikeMin,
        transitMin: apartmentDistances.transitMin,
      })
      .from(apartmentDistances)
      .where(eq(apartmentDistances.apartmentId, apartmentId));

    return NextResponse.json({
      ...apartment[0],
      ratings: apartmentRatings,
      distances,
      mapEmbedUrl: buildMapEmbedUrl(apartment[0].address),
    });
  } catch (error) {
    console.error("[apartments/id:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch apartment" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const apartmentId = parseInt(id);
    const body = await request.json();

    const availableFrom: string | null =
      typeof body.availableFrom === "string" && isIsoDate(body.availableFrom)
        ? body.availableFrom
        : null;

    const currentRows = await db
      .select()
      .from(apartments)
      .where(eq(apartments.id, apartmentId))
      .limit(1);

    if (currentRows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const previousEdited: string[] = (() => {
      const raw = currentRows[0].userEditedFields;
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed.filter((v): v is string => typeof v === "string")
          : [];
      } catch {
        return [];
      }
    })();

    const newlyChanged = diffInferableFields(
      currentRows[0] as Record<string, unknown>,
      body as Record<string, unknown>
    );

    const merged = Array.from(new Set([...previousEdited, ...newlyChanged]));

    const result = await db
      .update(apartments)
      .set({
        name: body.name,
        address: body.address,
        sizeM2: body.sizeM2,
        numRooms: body.numRooms,
        numBathrooms: body.numBathrooms,
        numBalconies: body.numBalconies,
        hasWashingMachine: body.hasWashingMachine ?? null,
        rentChf: body.rentChf,
        listingUrl: body.listingUrl,
        summary: body.summary ?? null,
        availableFrom,
        userEditedFields: merged.length > 0 ? JSON.stringify(merged) : null,
      })
      .where(eq(apartments.id, apartmentId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let updated = result[0];
    const addressChanged = body.address !== currentRows[0].address;
    if (addressChanged) {
      try {
        const coords = updated.address
          ? await geocodeLatLng(updated.address)
          : null;
        const updatedRows = await db
          .update(apartments)
          .set({
            latitude: coords?.lat ?? null,
            longitude: coords?.lng ?? null,
          })
          .where(eq(apartments.id, apartmentId))
          .returning();
        if (updatedRows[0]) updated = updatedRows[0];
      } catch (err) {
        console.error(
          `[apartments/id:PATCH] geocode failed apt=${apartmentId}:`,
          err
        );
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[apartments/id:PATCH] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update apartment" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const apartmentId = parseInt(id);

    await db.delete(apartments).where(eq(apartments.id, apartmentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[apartments/id:DELETE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete apartment" },
      { status: 500 }
    );
  }
}
