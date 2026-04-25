import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { calculateDistance } from "@/lib/distance";

export async function POST() {
  try {
    const all = await db
      .select({ id: apartments.id, address: apartments.address })
      .from(apartments);

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const apt of all) {
      if (!apt.address) {
        skipped++;
        continue;
      }
      try {
        const { bikeMinutes, transitMinutes } = await calculateDistance(
          apt.address
        );
        if (bikeMinutes === null && transitMinutes === null) {
          failed++;
          continue;
        }
        await db
          .update(apartments)
          .set({
            distanceBikeMin: bikeMinutes,
            distanceTransitMin: transitMinutes,
          })
          .where(eq(apartments.id, apt.id));
        updated++;
      } catch (err) {
        console.error(`[recompute] apartment ${apt.id} failed:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      total: all.length,
      updated,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("[settings/recompute:POST] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to recompute",
      },
      { status: 500 }
    );
  }
}
