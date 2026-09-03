import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apartments } from "@/lib/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { checkListings } from "@/lib/listing-status";
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

  // This rewrites listing_gone / listing_checked_at on existing rows, so
  // the 24h-valid JWT is not trusted on its own.
  try {
    await assertMembership(householdId, userId);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }

  try {
    const rows = await db
      .select({ id: apartments.id, listingUrl: apartments.listingUrl })
      .from(apartments)
      .where(
        and(
          eq(apartments.householdId, householdId),
          isNotNull(apartments.listingUrl)
        )
      );

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
        .where(
          and(
            eq(apartments.id, r.apartmentId),
            eq(apartments.householdId, householdId)
          )
        );
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
