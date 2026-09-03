import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments, apartmentDistances } from "@/lib/db/schema";
import { calculateDistance } from "@/lib/distance";
import { listLocations } from "@/lib/locations";
import { eq } from "drizzle-orm";
import {
  assertMembership,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/household";
import { requireHousehold } from "@/lib/session";

export async function POST() {
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

  // This rewrites the household's apartment_distances rows, so the
  // 24h-valid JWT is not trusted on its own.
  try {
    await assertMembership(householdId, userId);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }

  try {
    const allApartments = await db
      .select({ id: apartments.id, address: apartments.address })
      .from(apartments)
      .where(eq(apartments.householdId, householdId));
    const locations = await listLocations(householdId);

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const apt of allApartments) {
      if (!apt.address) {
        skipped += locations.length;
        continue;
      }
      for (const loc of locations) {
        try {
          const { bikeMinutes, transitMinutes } = await calculateDistance(
            loc.address,
            apt.address
          );
          if (bikeMinutes === null && transitMinutes === null) {
            failed++;
            continue;
          }
          await db
            .insert(apartmentDistances)
            .values({
              householdId,
              apartmentId: apt.id,
              locationId: loc.id,
              bikeMin: bikeMinutes,
              transitMin: transitMinutes,
            })
            .onConflictDoUpdate({
              target: [
                apartmentDistances.apartmentId,
                apartmentDistances.locationId,
              ],
              set: {
                bikeMin: bikeMinutes,
                transitMin: transitMinutes,
                updatedAt: new Date(),
              },
            });
          updated++;
        } catch (err) {
          console.error(
            `[recompute] apartment ${apt.id} location ${loc.id} failed:`,
            err
          );
          failed++;
        }
      }
    }

    return NextResponse.json({
      totalApartments: allApartments.length,
      totalLocations: locations.length,
      updated,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("[settings/recompute:POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to recompute" },
      { status: 500 }
    );
  }
}
