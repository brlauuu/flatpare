import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";
import { sql, eq, sum, count, and, gte } from "drizzle-orm";

// Pricing estimates (per token, USD).
// Source: https://ai.google.dev/pricing
const GEMINI_FLASH_INPUT_PER_TOKEN = 0.00000015; // $0.15 per 1M input tokens
const GEMINI_FLASH_OUTPUT_PER_TOKEN = 0.0000006; // $0.60 per 1M output tokens

// Google Maps Platform pricing (USD).
// Distance Matrix: $5 per 1000 elements; we issue 2 elements per row
// (bike + transit), so 1 calculate_distance row = $0.01.
// Geocoding API:   $5 per 1000 calls = $0.005 per geocode row.
// Source: https://mapsplatform.google.com/pricing
const MAPS_DISTANCE_PER_ROW = (5 / 1000) * 2;
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
        },
      },
      totalEstimatedCost30d: round4(geminiCost30d + mapsCost30d),
    });
  } catch (error) {
    console.error("[costs:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch costs" },
      { status: 500 }
    );
  }
}
