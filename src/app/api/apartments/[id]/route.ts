import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments, ratings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildMapEmbedUrl } from "@/lib/map-embed";
import { isIsoDate } from "@/lib/iso-date";

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

    return NextResponse.json({
      ...apartment[0],
      ratings: apartmentRatings,
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
        distanceBikeMin: body.distanceBikeMin,
        distanceTransitMin: body.distanceTransitMin,
        listingUrl: body.listingUrl,
        availableFrom,
      })
      .where(eq(apartments.id, apartmentId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
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
