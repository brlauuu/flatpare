import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/distance", () => ({
  calculateDistance: vi.fn(),
}));

import { POST } from "../../api/distance/route";
import { calculateDistance } from "@/lib/distance";

const mockedCalculateDistance = vi.mocked(calculateDistance);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/distance", () => {
  it("returns distance for valid address", async () => {
    mockedCalculateDistance.mockResolvedValue({
      bikeMinutes: 10,
      transitMinutes: 15,
    });

    const req = new Request("http://localhost/api/distance", {
      method: "POST",
      body: JSON.stringify({ address: "Zürich, Switzerland" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bikeMinutes).toBe(10);
    expect(data.transitMinutes).toBe(15);
  });

  it("returns 400 for missing address", async () => {
    const req = new Request("http://localhost/api/distance", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-string address", async () => {
    const req = new Request("http://localhost/api/distance", {
      method: "POST",
      body: JSON.stringify({ address: 123 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
