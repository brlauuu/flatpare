import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";
import { sql, eq, sum, count, and, gte } from "drizzle-orm";

// Pricing estimates (per token, USD). Gemini also has a free tier on AI
// Studio keys without billing enabled (~1M tokens/day on gemini-2.5-flash);
// the calc below ignores that and gives a worst-case "if you were billed"
// number. The page surfaces the free-tier caveat alongside.
// Source: https://ai.google.dev/pricing
const GEMINI_FLASH_INPUT_PER_TOKEN = 0.00000015; // $0.15 per 1M input tokens
const GEMINI_FLASH_OUTPUT_PER_TOKEN = 0.0000006; // $0.60 per 1M output tokens

// Google Maps Platform pricing (USD).
// Each calculate_distance row issues TWO requests against the Distance Matrix
// API — one bike (Basic SKU, $5/1k elements = $0.005) and one transit
// (Advanced SKU, $10/1k elements = $0.010). Combined: $0.015 per row.
// Geocoding API: $5/1k calls = $0.005 per geocode row.
// Source: https://mapsplatform.google.com/pricing
const MAPS_DISTANCE_BIKE_PER_ELEMENT = 5 / 1000;
const MAPS_DISTANCE_TRANSIT_PER_ELEMENT = 10 / 1000;
const MAPS_DISTANCE_PER_ROW =
  MAPS_DISTANCE_BIKE_PER_ELEMENT + MAPS_DISTANCE_TRANSIT_PER_ELEMENT;
const MAPS_GEOCODE_PER_ROW = 5 / 1000;

// Google Maps Platform gives a recurring $200/month credit covering all
// Maps APIs combined (Distance Matrix, Geocoding, Embed, etc.).
// Source: https://mapsplatform.google.com/pricing
const MAPS_FREE_CREDIT_USD = 200;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since = Math.floor(thirtyDaysAgo.getTime() / 1000);

    // Gemini — all time
    const [geminiAllTime] = await db
      .select({
        totalCalls: count(),
        totalInputTokens: sum(apiUsage.inputTokens),
        totalOutputTokens: sum(apiUsage.outputTokens),
      })
      .from(apiUsage)
      .where(eq(apiUsage.service, "gemini"));

    // Gemini — last 30 days
    const [gemini30d] = await db
      .select({
        totalCalls: count(),
        totalInputTokens: sum(apiUsage.inputTokens),
        totalOutputTokens: sum(apiUsage.outputTokens),
      })
      .from(apiUsage)
      .where(
        sql`${apiUsage.service} = 'gemini' AND ${apiUsage.createdAt} >= ${since}`
      );

    // Google Maps — split by operation. Distance and geocoding have
    // different per-call pricing, so we can't lump them together.
    async function mapsCount(operation: string, sinceTs?: number) {
      const filters = sinceTs
        ? and(
            eq(apiUsage.service, "google_maps"),
            eq(apiUsage.operation, operation),
            gte(apiUsage.createdAt, new Date(sinceTs * 1000))
          )
        : and(
            eq(apiUsage.service, "google_maps"),
            eq(apiUsage.operation, operation)
          );
      const [row] = await db
        .select({ totalCalls: count() })
        .from(apiUsage)
        .where(filters);
      return row.totalCalls || 0;
    }

    const distanceAllTime = await mapsCount("calculate_distance");
    const geocodeAllTime = await mapsCount("geocode");
    const distance30d = await mapsCount("calculate_distance", since);
    const geocode30d = await mapsCount("geocode", since);

    // Costs
    const geminiInputTokens30d = Number(gemini30d.totalInputTokens) || 0;
    const geminiOutputTokens30d = Number(gemini30d.totalOutputTokens) || 0;
    const geminiCost30d =
      geminiInputTokens30d * GEMINI_FLASH_INPUT_PER_TOKEN +
      geminiOutputTokens30d * GEMINI_FLASH_OUTPUT_PER_TOKEN;

    const distanceCost30d = distance30d * MAPS_DISTANCE_PER_ROW;
    const geocodeCost30d = geocode30d * MAPS_GEOCODE_PER_ROW;
    const mapsCost30d = distanceCost30d + geocodeCost30d;

    return NextResponse.json({
      gemini: {
        allTime: {
          calls: geminiAllTime.totalCalls || 0,
          inputTokens: Number(geminiAllTime.totalInputTokens) || 0,
          outputTokens: Number(geminiAllTime.totalOutputTokens) || 0,
        },
        last30Days: {
          calls: gemini30d.totalCalls || 0,
          inputTokens: geminiInputTokens30d,
          outputTokens: geminiOutputTokens30d,
          estimatedCostUsd: round4(geminiCost30d),
        },
      },
      googleMaps: {
        // $200/mo recurring credit covers all Maps APIs combined.
        freeCreditUsd: MAPS_FREE_CREDIT_USD,
        distanceMatrix: {
          allTime: { calls: distanceAllTime },
          last30Days: {
            calls: distance30d,
            estimatedCostUsd: round4(distanceCost30d),
          },
        },
        geocoding: {
          allTime: { calls: geocodeAllTime },
          last30Days: {
            calls: geocode30d,
            estimatedCostUsd: round4(geocodeCost30d),
          },
        },
        last30Days: {
          // Combined for the headline / free-credit comparison.
          totalCost: round4(mapsCost30d),
          freeCreditRemainingUsd: round4(
            Math.max(0, MAPS_FREE_CREDIT_USD - mapsCost30d)
          ),
          // > 0 means the period exceeded the credit by this amount.
          overageUsd: round4(Math.max(0, mapsCost30d - MAPS_FREE_CREDIT_USD)),
        },
      },
      // Pre-credit gross. Useful for transparency, but not the "what will I
      // be billed" number — see effectiveTotalAfterCreditsUsd.
      totalEstimatedCost30d: round4(geminiCost30d + mapsCost30d),
      // Post-credit estimate: Gemini cost (no free credit assumed) plus
      // anything above the $200/mo Maps credit.
      effectiveTotalAfterCreditsUsd: round4(
        geminiCost30d + Math.max(0, mapsCost30d - MAPS_FREE_CREDIT_USD)
      ),
    });
  } catch (error) {
    console.error("[costs:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch costs" },
      { status: 500 }
    );
  }
}
