import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
}));

import { GET } from "../../api/costs/route";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/costs", () => {
  it("returns cost data structure", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveProperty("gemini");
    expect(data).toHaveProperty("googleMaps");
    expect(data).toHaveProperty("totalEstimatedCost30d");
    expect(data.gemini).toHaveProperty("allTime");
    expect(data.gemini).toHaveProperty("last30Days");
    expect(typeof data.totalEstimatedCost30d).toBe("number");
  });
});
