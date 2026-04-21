import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments, ratings } from "@/lib/db/schema";
import { desc, avg, eq } from "drizzle-orm";

export async function GET() {
  try {
    const allApartments = await db
      .select({
        id: apartments.id,
        name: apartments.name,
        address: apartments.address,
        sizeM2: apartments.sizeM2,
        numRooms: apartments.numRooms,
        numBathrooms: apartments.numBathrooms,
        numBalconies: apartments.numBalconies,
        rentChf: apartments.rentChf,
        distanceBikeMin: apartments.distanceBikeMin,
        distanceTransitMin: apartments.distanceTransitMin,
        pdfUrl: apartments.pdfUrl,
        listingUrl: apartments.listingUrl,
        createdAt: apartments.createdAt,
        avgKitchen: avg(ratings.kitchen),
        avgBalconies: avg(ratings.balconies),
        avgLocation: avg(ratings.location),
        avgFloorplan: avg(ratings.floorplan),
        avgOverall: avg(ratings.overallFeeling),
      })
      .from(apartments)
      .leftJoin(ratings, eq(apartments.id, ratings.apartmentId))
      .groupBy(apartments.id)
      .orderBy(desc(apartments.createdAt));

    return NextResponse.json(allApartments);
  } catch (error) {
    console.error("[apartments:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch apartments" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = await db
      .insert(apartments)
      .values({
        name: body.name,
        address: body.address,
        sizeM2: body.sizeM2,
        numRooms: body.numRooms,
        numBathrooms: body.numBathrooms,
        numBalconies: body.numBalconies,
        rentChf: body.rentChf,
        distanceBikeMin: body.distanceBikeMin,
        distanceTransitMin: body.distanceTransitMin,
        pdfUrl: body.pdfUrl,
        listingUrl: body.listingUrl || null,
        rawExtractedData: body.rawExtractedData
          ? JSON.stringify(body.rawExtractedData)
          : null,
      })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("[apartments:POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create apartment" },
      { status: 500 }
    );
  }
}
