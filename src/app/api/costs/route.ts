import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";
import { sql, eq, sum, count } from "drizzle-orm";

// Pricing estimates (per token, USD)
const GEMINI_FLASH_INPUT_PER_TOKEN = 0.00000015; // $0.15 per 1M input tokens
const GEMINI_FLASH_OUTPUT_PER_TOKEN = 0.0000006; // $0.60 per 1M output tokens
// Google Maps Distance Matrix: $5 per 1000 elements, 2 elements per call (bike + transit)
const MAPS_COST_PER_CALL = (5 / 1000) * 2;

export async function GET() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // All-time stats
  const [geminiAllTime] = await db
    .select({
      totalCalls: count(),
      totalInputTokens: sum(apiUsage.inputTokens),
      totalOutputTokens: sum(apiUsage.outputTokens),
    })
    .from(apiUsage)
    .where(eq(apiUsage.service, "gemini"));

  const [mapsAllTime] = await db
    .select({ totalCalls: count() })
    .from(apiUsage)
    .where(eq(apiUsage.service, "google_maps"));

  // Last 30 days stats
  const [gemini30d] = await db
    .select({
      totalCalls: count(),
      totalInputTokens: sum(apiUsage.inputTokens),
      totalOutputTokens: sum(apiUsage.outputTokens),
    })
    .from(apiUsage)
    .where(
      sql`${apiUsage.service} = 'gemini' AND ${apiUsage.createdAt} >= ${Math.floor(thirtyDaysAgo.getTime() / 1000)}`
    );

  const [maps30d] = await db
    .select({ totalCalls: count() })
    .from(apiUsage)
    .where(
      sql`${apiUsage.service} = 'google_maps' AND ${apiUsage.createdAt} >= ${Math.floor(thirtyDaysAgo.getTime() / 1000)}`
    );

  // Calculate estimated costs
  const geminiInputTokens30d = Number(gemini30d.totalInputTokens) || 0;
  const geminiOutputTokens30d = Number(gemini30d.totalOutputTokens) || 0;
  const geminiCost30d =
    geminiInputTokens30d * GEMINI_FLASH_INPUT_PER_TOKEN +
    geminiOutputTokens30d * GEMINI_FLASH_OUTPUT_PER_TOKEN;

  const mapsCalls30d = maps30d.totalCalls || 0;
  const mapsCost30d = mapsCalls30d * MAPS_COST_PER_CALL;

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
        estimatedCostUsd: Math.round(geminiCost30d * 10000) / 10000,
      },
    },
    googleMaps: {
      allTime: {
        calls: mapsAllTime.totalCalls || 0,
      },
      last30Days: {
        calls: mapsCalls30d,
        estimatedCostUsd: Math.round(mapsCost30d * 10000) / 10000,
      },
    },
    totalEstimatedCost30d:
      Math.round((geminiCost30d + mapsCost30d) * 10000) / 10000,
  });
}
