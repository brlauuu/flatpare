import { NextResponse } from "next/server";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, locationsOfInterest } from "@/lib/db/schema";
import { geocodeLatLngWithReason } from "@/lib/geocode";

const CONCURRENCY = 5;

interface Pending {
  table: "apartments" | "locations_of_interest";
  id: number;
  address: string;
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let cursor = 0;
  async function loop() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        await worker(items[i]);
      } catch (err) {
        console.error("[geocode/backfill] worker error:", err);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => loop())
  );
}

export async function POST() {
  try {
    const aptRows = await db
      .select({ id: apartments.id, address: apartments.address })
      .from(apartments)
      .where(and(isNull(apartments.latitude), isNotNull(apartments.address)));

    const locRows = await db
      .select({
        id: locationsOfInterest.id,
        address: locationsOfInterest.address,
      })
      .from(locationsOfInterest)
      .where(isNull(locationsOfInterest.latitude));

    const pending: Pending[] = [
      ...aptRows
        .filter((r): r is { id: number; address: string } =>
          typeof r.address === "string" && r.address.trim().length > 0
        )
        .map((r) => ({
          table: "apartments" as const,
          id: r.id,
          address: r.address,
        })),
      ...locRows
        .filter((r) => r.address && r.address.trim().length > 0)
        .map((r) => ({
          table: "locations_of_interest" as const,
          id: r.id,
          address: r.address,
        })),
    ];

    let updated = 0;
    const failures: Array<{
      table: Pending["table"];
      id: number;
      address: string;
      googleReason?: string;
      orsReason?: string;
    }> = [];

    await runWithConcurrency(
      pending,
      async (item) => {
        const attempt = await geocodeLatLngWithReason(item.address);
        if (!attempt.result) {
          failures.push({
            table: item.table,
            id: item.id,
            address: item.address,
            googleReason: attempt.googleReason,
            orsReason: attempt.orsReason,
          });
          return;
        }
        const { lat, lng } = attempt.result;
        if (item.table === "apartments") {
          await db
            .update(apartments)
            .set({ latitude: lat, longitude: lng })
            .where(eq(apartments.id, item.id));
        } else {
          await db
            .update(locationsOfInterest)
            .set({ latitude: lat, longitude: lng })
            .where(eq(locationsOfInterest.id, item.id));
        }
        updated++;
      },
      CONCURRENCY
    );

    return NextResponse.json({
      pending: pending.length,
      updated,
      failures,
    });
  } catch (error) {
    console.error("[geocode/backfill:POST] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Backfill failed",
      },
      { status: 500 }
    );
  }
}
