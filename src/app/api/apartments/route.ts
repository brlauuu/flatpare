import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments, ratings } from "@/lib/db/schema";
import { desc, avg, eq } from "drizzle-orm";
import {
  buildShortCode,
  computeShortCodeParts,
  pickLetters,
} from "@/lib/short-code";

const MAX_SHORT_CODE_ATTEMPTS = 5;

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /unique constraint|UNIQUE constraint/i.test(err.message)
  );
}

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
        hasWashingMachine: apartments.hasWashingMachine,
        rentChf: apartments.rentChf,
        distanceBikeMin: apartments.distanceBikeMin,
        distanceTransitMin: apartments.distanceTransitMin,
        pdfUrl: apartments.pdfUrl,
        listingUrl: apartments.listingUrl,
        shortCode: apartments.shortCode,
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

    // Compute derived parts once (postcode extraction can hit an API);
    // only the random letters change on unique-constraint retries.
    const parts = await computeShortCodeParts({
      numRooms: body.numRooms ?? null,
      numBathrooms: body.numBathrooms ?? null,
      hasWashingMachine: body.hasWashingMachine ?? null,
      address: body.address ?? null,
    });

    for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt++) {
      const shortCode = buildShortCode(parts, pickLetters());
      try {
        const result = await db
          .insert(apartments)
          .values({
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
            pdfUrl: body.pdfUrl,
            listingUrl: body.listingUrl || null,
            shortCode,
            rawExtractedData: body.rawExtractedData
              ? JSON.stringify(body.rawExtractedData)
              : null,
          })
          .returning();
        return NextResponse.json(result[0], { status: 201 });
      } catch (err) {
        if (
          isUniqueConstraintError(err) &&
          attempt < MAX_SHORT_CODE_ATTEMPTS - 1
        ) {
          continue;
        }
        throw err;
      }
    }

    throw new Error("Failed to generate a unique short code after retries");
  } catch (error) {
    console.error("[apartments:POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create apartment" },
      { status: 500 }
    );
  }
}
