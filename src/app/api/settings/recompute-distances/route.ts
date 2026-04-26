import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments, apartmentDistances } from "@/lib/db/schema";
import { calculateDistance } from "@/lib/distance";
import { listLocations } from "@/lib/locations";

export async function POST() {
  try {
    const allApartments = await db
      .select({ id: apartments.id, address: apartments.address })
      .from(apartments);
    const locations = await listLocations();

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
