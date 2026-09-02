import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  apartments,
  apartmentDistances,
  ratings,
} from "@/lib/db/schema";
import { desc, avg, eq, and } from "drizzle-orm";
import { UnauthorizedError } from "@/lib/household";
import { requireHousehold } from "@/lib/session";
import {
  buildShortCode,
  computeShortCodeParts,
  pickLetters,
} from "@/lib/short-code";
import { isIsoDate } from "@/lib/iso-date";
import { listLocations } from "@/lib/locations";
import { calculateDistance } from "@/lib/distance";
import { geocodeLatLng } from "@/lib/geocode";

const MAX_SHORT_CODE_ATTEMPTS = 5;

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /unique constraint|UNIQUE constraint/i.test(err.message)
  );
}

export async function GET() {
  let householdId: number;
  let userId: string;
  try {
    ({ householdId, userId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }

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
        pdfUrl: apartments.pdfUrl,
        listingUrl: apartments.listingUrl,
        summary: apartments.summary,
        availableFrom: apartments.availableFrom,
        listingGone: apartments.listingGone,
        listingCheckedAt: apartments.listingCheckedAt,
        latitude: apartments.latitude,
        longitude: apartments.longitude,
        shortCode: apartments.shortCode,
        createdAt: apartments.createdAt,
        avgKitchen: avg(ratings.kitchen),
        avgBalconies: avg(ratings.balconies),
        avgLocation: avg(ratings.location),
        avgFloorplan: avg(ratings.floorplan),
        avgOverall: avg(ratings.overallFeeling),
      })
      .from(apartments)
      // The join predicate is scoped too, not only the outer where: a rating
      // row carries its own household_id, and averages must never be computed
      // across tenants even if a stray row ever pointed the wrong way.
      .leftJoin(
        ratings,
        and(
          eq(apartments.id, ratings.apartmentId),
          eq(ratings.householdId, householdId)
        )
      )
      .where(eq(apartments.householdId, householdId))
      .groupBy(apartments.id)
      .orderBy(desc(apartments.createdAt));

    const allDistances = await db
      .select()
      .from(apartmentDistances)
      .where(eq(apartmentDistances.householdId, householdId));
    const distancesByApt = new Map<
      number,
      { locationId: number; bikeMin: number | null; transitMin: number | null }[]
    >();
    for (const d of allDistances) {
      const list = distancesByApt.get(d.apartmentId) ?? [];
      list.push({
        locationId: d.locationId,
        bikeMin: d.bikeMin,
        transitMin: d.transitMin,
      });
      distancesByApt.set(d.apartmentId, list);
    }

    const myRatingByApt = new Map<number, number>();
    const myRows = await db
      .select({
        apartmentId: ratings.apartmentId,
        overallFeeling: ratings.overallFeeling,
      })
      .from(ratings)
      .where(
        and(
          eq(ratings.userId, userId),
          eq(ratings.householdId, householdId)
        )
      );
    for (const r of myRows) {
      myRatingByApt.set(r.apartmentId, r.overallFeeling ?? 0);
    }

    const decorated = allApartments.map((a) => ({
      ...a,
      distances: distancesByApt.get(a.id) ?? [],
      myRating: myRatingByApt.has(a.id) ? myRatingByApt.get(a.id)! : null,
    }));

    return NextResponse.json(decorated);
  } catch (error) {
    console.error("[apartments:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch apartments" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }

  try {
    const body = await request.json();

    const availableFrom: string | null =
      typeof body.availableFrom === "string" && isIsoDate(body.availableFrom)
        ? body.availableFrom
        : null;

    const parts = await computeShortCodeParts({
      numRooms: body.numRooms ?? null,
      numBathrooms: body.numBathrooms ?? null,
      hasWashingMachine: body.hasWashingMachine ?? null,
      address: body.address ?? null,
    });

    let created: typeof apartments.$inferSelect | null = null;
    for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt++) {
      const shortCode = buildShortCode(parts, pickLetters());
      try {
        const result = await db
          .insert(apartments)
          .values({
            householdId,
            name: body.name,
            address: body.address,
            sizeM2: body.sizeM2,
            numRooms: body.numRooms,
            numBathrooms: body.numBathrooms,
            numBalconies: body.numBalconies,
            hasWashingMachine: body.hasWashingMachine ?? null,
            rentChf: body.rentChf,
            pdfUrl: body.pdfUrl,
            listingUrl: body.listingUrl || null,
            summary: body.summary ?? null,
            availableFrom,
            shortCode,
            rawExtractedData: body.rawExtractedData
              ? JSON.stringify(body.rawExtractedData)
              : null,
          })
          .returning();
        created = result[0];
        break;
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

    if (!created) {
      throw new Error("Failed to generate a unique short code after retries");
    }

    let geocoded: { lat: number; lng: number } | null = null;
    if (created.address) {
      const address = created.address;
      try {
        geocoded = await geocodeLatLng(address);
        if (geocoded) {
          await db
            .update(apartments)
            .set({ latitude: geocoded.lat, longitude: geocoded.lng })
            .where(
              and(
                eq(apartments.id, created.id),
                eq(apartments.householdId, householdId)
              )
            );
        }
      } catch (err) {
        console.error(
          `[apartments:POST] geocode failed apt=${created.id}:`,
          err
        );
      }

      const locations = await listLocations(householdId);
      for (const loc of locations) {
        try {
          const { bikeMinutes, transitMinutes } = await calculateDistance(
            loc.address,
            address
          );
          await db.insert(apartmentDistances).values({
            householdId,
            apartmentId: created.id,
            locationId: loc.id,
            bikeMin: bikeMinutes,
            transitMin: transitMinutes,
          });
        } catch (err) {
          console.error(
            `[apartments:POST] distance calc failed apt=${created.id} loc=${loc.id}:`,
            err
          );
        }
      }
    }

    const responseBody = geocoded
      ? { ...created, latitude: geocoded.lat, longitude: geocoded.lng }
      : created;
    return NextResponse.json(responseBody, { status: 201 });
  } catch (error) {
    console.error("[apartments:POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create apartment" },
      { status: 500 }
    );
  }
}
