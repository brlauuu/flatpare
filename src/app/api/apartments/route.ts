import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments, ratings } from "@/lib/db/schema";
import { desc, avg, eq } from "drizzle-orm";

export async function GET() {
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
}

export async function POST(request: Request) {
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
      rawExtractedData: body.rawExtractedData
        ? JSON.stringify(body.rawExtractedData)
        : null,
    })
    .returning();

  return NextResponse.json(result[0], { status: 201 });
}
