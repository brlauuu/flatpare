import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { checkListings } from "@/lib/listing-status";

export async function POST() {
  try {
    const rows = await db
      .select({ id: apartments.id, listingUrl: apartments.listingUrl })
      .from(apartments)
      .where(isNotNull(apartments.listingUrl));

    const checkable = rows.filter(
      (r): r is { id: number; listingUrl: string } =>
        typeof r.listingUrl === "string" && r.listingUrl.trim().length > 0
    );

    const results = await checkListings(checkable);
    const checkedAt = new Date();

    let updated = 0;
    for (const r of results) {
      if (r.gone === null) continue;
      await db
        .update(apartments)
        .set({ listingGone: r.gone, listingCheckedAt: checkedAt })
        .where(eq(apartments.id, r.apartmentId));
      updated++;
    }

    return NextResponse.json({
      checked: results.length,
      updated,
      results,
    });
  } catch (error) {
    console.error("[apartments/check-listings:POST] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to check listings",
      },
      { status: 500 }
    );
  }
}
