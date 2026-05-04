import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Default mock: every query returns 5 calls / 1000 input / 500 output tokens.
// Tests can override with vi.mocked(db.select)... before invoking GET.
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            totalCalls: 5,
            totalInputTokens: "1000",
            totalOutputTokens: "500",
          },
        ]),
      }),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apiUsage: {
    service: "service",
    operation: "operation",
    createdAt: "created_at",
    inputTokens: "input_tokens",
    outputTokens: "output_tokens",
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn(),
  eq: vi.fn(),
  sum: vi.fn(),
  count: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
}));

import { GET } from "../../api/costs/route";
import { db } from "@/lib/db";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/costs", () => {
  it("returns the new cost data shape with per-Maps-service breakdown", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveProperty("gemini");
    expect(data).toHaveProperty("googleMaps");
    expect(data).toHaveProperty("totalEstimatedCost30d");
    expect(data.gemini).toHaveProperty("allTime");
    expect(data.gemini).toHaveProperty("last30Days");
    expect(data.googleMaps).toHaveProperty("freeCreditUsd", 200);
    expect(data.googleMaps).toHaveProperty("distanceMatrix");
    expect(data.googleMaps).toHaveProperty("geocoding");
    expect(data.googleMaps.last30Days).toHaveProperty(
      "freeCreditRemainingUsd"
    );
    expect(data.googleMaps.last30Days).toHaveProperty("overageUsd");
    expect(data).toHaveProperty("effectiveTotalAfterCreditsUsd");
  });

  it("prices distance and geocode rows differently", async () => {
    // 10 calls per query, no token data (Maps queries don't read tokens).
    vi.mocked(db.select).mockImplementation(
      () =>
        ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                totalCalls: 10,
                totalInputTokens: "0",
                totalOutputTokens: "0",
              },
            ]),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );

    const res = await GET();
    const data = await res.json();

    // Distance Matrix per call = 1 bike Basic element ($0.005) + 1 transit
    // Advanced element ($0.010) = $0.015. 10 calls = $0.15.
    expect(data.googleMaps.distanceMatrix.last30Days.estimatedCostUsd).toBe(
      0.15
    );
    // Geocoding API: 10 calls × $5/1000 = $0.05
    expect(data.googleMaps.geocoding.last30Days.estimatedCostUsd).toBe(0.05);
  });

  it("reports the $200 free credit and what remains after Maps usage", async () => {
    vi.mocked(db.select).mockImplementation(
      () =>
        ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                totalCalls: 100,
                totalInputTokens: "0",
                totalOutputTokens: "0",
              },
            ]),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );

    const res = await GET();
    const data = await res.json();

    // Distance: 100 × $0.015 = $1.50; Geocoding: 100 × $0.005 = $0.50.
    // Total Maps cost: $2.00; remaining of $200 credit: $198.00.
    expect(data.googleMaps.last30Days.totalCost).toBe(2);
    expect(data.googleMaps.last30Days.freeCreditRemainingUsd).toBe(198);
    expect(data.googleMaps.last30Days.overageUsd).toBe(0);
    // Maps usage is fully covered, so post-credit total equals Gemini cost
    // alone (which is 0 since input/output tokens are "0" in this mock).
    expect(data.effectiveTotalAfterCreditsUsd).toBe(0);
  });

  it("exposes overage and post-credit total when Maps usage exceeds the credit", async () => {
    // 30,000 distance calls × $0.015 = $450, well over the $200 credit.
    vi.mocked(db.select).mockImplementation(
      () =>
        ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                totalCalls: 30000,
                totalInputTokens: "0",
                totalOutputTokens: "0",
              },
            ]),
          }),
        }) as unknown as ReturnType<typeof db.select>
    );

    const res = await GET();
    const data = await res.json();

    // Distance: 30000 × $0.015 = $450; Geocoding: 30000 × $0.005 = $150.
    // Maps total = $600; over the $200 credit by $400.
    expect(data.googleMaps.last30Days.freeCreditRemainingUsd).toBe(0);
    expect(data.googleMaps.last30Days.overageUsd).toBe(400);
    // Post-credit total = Gemini ($0) + Maps overage ($400).
    expect(data.effectiveTotalAfterCreditsUsd).toBe(400);
  });
});
