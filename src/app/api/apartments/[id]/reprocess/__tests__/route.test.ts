import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIsAuthenticated,
  selectMock,
  updateMock,
  insertMock,
  deleteMock,
  readStoredFileMock,
  extractMock,
  classifyMock,
  listLocationsMock,
  calcDistanceMock,
  geocodeMock,
} = vi.hoisted(() => ({
  mockIsAuthenticated: vi.fn(async () => true),
  selectMock: vi.fn(),
  updateMock: vi.fn(),
  insertMock: vi.fn(),
  deleteMock: vi.fn(),
  readStoredFileMock: vi.fn(),
  extractMock: vi.fn(),
  classifyMock: vi.fn(),
  listLocationsMock: vi.fn(),
  calcDistanceMock: vi.fn(),
  geocodeMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticated: mockIsAuthenticated,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apartments: { id: "id", address: "address" },
  apartmentDistances: { apartmentId: "apartment_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/parse-pdf", () => ({
  extractApartmentData: extractMock,
}));

vi.mock("@/lib/parse-pdf-error", () => ({
  classifyParsePdfError: classifyMock,
}));

vi.mock("@/lib/edited-fields", () => ({
  INFERABLE_FIELDS: ["name", "address", "rentChf", "sizeM2"],
}));

vi.mock("@/lib/storage", () => ({
  readStoredFile: readStoredFileMock,
}));

vi.mock("@/lib/locations", () => ({
  listLocations: listLocationsMock,
}));

vi.mock("@/lib/distance", () => ({
  calculateDistance: calcDistanceMock,
}));

vi.mock("@/lib/geocode", () => ({
  geocodeLatLng: geocodeMock,
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.mockResolvedValue(true);
});

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function selectReturns(rows: unknown[]) {
  selectMock.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function updateReturning(returnRow: unknown) {
  updateMock.mockReturnValueOnce({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([returnRow]),
      }),
    }),
  });
}

function updateNoReturn() {
  updateMock.mockReturnValueOnce({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

function deleteOk() {
  deleteMock.mockReturnValueOnce({
    where: vi.fn().mockResolvedValue(undefined),
  });
}

function insertOk() {
  insertMock.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
}

describe("POST /api/apartments/[id]/reprocess", () => {
  it("returns 404 when the apartment is missing", async () => {
    selectReturns([]);
    const req = new Request("http://x/api/apartments/999/reprocess", {
      method: "POST",
    });
    const res = await POST(req, withParams("999"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when the apartment has no PDF on file", async () => {
    selectReturns([{ id: 1, pdfUrl: null }]);
    const req = new Request("http://x/api/apartments/1/reprocess", {
      method: "POST",
    });
    const res = await POST(req, withParams("1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/No PDF/i);
  });

  it("returns 500 when the PDF cannot be read from storage", async () => {
    selectReturns([{ id: 1, pdfUrl: "stored.pdf" }]);
    readStoredFileMock.mockRejectedValue(new Error("missing"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("http://x/api/apartments/1/reprocess", {
      method: "POST",
    });
    const res = await POST(req, withParams("1"));
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });

  it("propagates a classified error from the AI extractor with its status", async () => {
    selectReturns([{ id: 1, pdfUrl: "stored.pdf" }]);
    readStoredFileMock.mockResolvedValue(Buffer.from("pdf"));
    extractMock.mockRejectedValue(new Error("rate limit"));
    classifyMock.mockReturnValue({
      message: "AI quota exceeded",
      reason: "quota",
      retryAfterSeconds: 30,
      status: 429,
    });

    const req = new Request("http://x/api/apartments/1/reprocess", {
      method: "POST",
    });
    const res = await POST(req, withParams("1"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "AI quota exceeded",
      reason: "quota",
      retryAfterSeconds: 30,
    });
  });

  it("returns the existing row unchanged when every inferable field has been edited", async () => {
    const apt = {
      id: 1,
      pdfUrl: "stored.pdf",
      address: "Old St",
      userEditedFields: JSON.stringify(["name", "address", "rentChf", "sizeM2"]),
    };
    selectReturns([apt]);
    readStoredFileMock.mockResolvedValue(Buffer.from("pdf"));
    extractMock.mockResolvedValue({
      name: "Whatever",
      address: "Different St",
      rentChf: 9999,
      sizeM2: 9999,
    });

    const res = await POST(
      new Request("http://x/api/apartments/1/reprocess", { method: "POST" }),
      withParams("1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("merges only non-edited inferable fields and returns the updated row", async () => {
    const apt = {
      id: 1,
      pdfUrl: "stored.pdf",
      address: "Same St",
      userEditedFields: JSON.stringify(["name"]),
    };
    selectReturns([apt]);
    readStoredFileMock.mockResolvedValue(Buffer.from("pdf"));
    extractMock.mockResolvedValue({
      name: "Should be ignored",
      address: "Same St",
      rentChf: 1234,
      sizeM2: 50,
    });
    let captured: Record<string, unknown> | null = null;
    updateMock.mockReturnValueOnce({
      set: vi.fn((v: Record<string, unknown>) => {
        captured = v;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: 1, address: "Same St", rentChf: 1234 }]),
          }),
        };
      }),
    });

    const res = await POST(
      new Request("http://x/api/apartments/1/reprocess", { method: "POST" }),
      withParams("1")
    );
    expect(res.status).toBe(200);
    // `name` is in edited set → must NOT be in update payload.
    expect(captured).not.toBeNull();
    expect(Object.keys(captured!)).not.toContain("name");
    expect(captured!.rentChf).toBe(1234);
    expect(captured!.address).toBe("Same St");
  });

  it("re-geocodes and rebuilds distances when the address changes", async () => {
    const apt = { id: 1, pdfUrl: "stored.pdf", address: "Old St", userEditedFields: null };
    selectReturns([apt]);
    readStoredFileMock.mockResolvedValue(Buffer.from("pdf"));
    extractMock.mockResolvedValue({
      name: "X",
      address: "New St",
      rentChf: null,
      sizeM2: null,
    });
    // First update — applies the field merge, returns the new row.
    updateReturning({ id: 1, address: "New St" });
    geocodeMock.mockResolvedValue({ lat: 47.5, lng: 8.5 });
    // Second update — sets coords (no returning).
    updateNoReturn();
    deleteOk();
    listLocationsMock.mockResolvedValue([
      { id: 7, label: "Train", icon: "Train", address: "Basel SBB" },
    ]);
    calcDistanceMock.mockResolvedValue({ bikeMinutes: 12, transitMinutes: 25 });
    insertOk();

    const res = await POST(
      new Request("http://x/api/apartments/1/reprocess", { method: "POST" }),
      withParams("1")
    );
    expect(res.status).toBe(200);
    expect(geocodeMock).toHaveBeenCalledWith("New St");
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("does not fail the request when geocoding throws after an address change", async () => {
    const apt = { id: 1, pdfUrl: "stored.pdf", address: "Old St", userEditedFields: null };
    selectReturns([apt]);
    readStoredFileMock.mockResolvedValue(Buffer.from("pdf"));
    extractMock.mockResolvedValue({
      name: null,
      address: "New St",
      rentChf: null,
      sizeM2: null,
    });
    updateReturning({ id: 1, address: "New St" });
    geocodeMock.mockRejectedValue(new Error("rate limit"));
    deleteOk();
    listLocationsMock.mockResolvedValue([]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      new Request("http://x/api/apartments/1/reprocess", { method: "POST" }),
      withParams("1")
    );
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
  });

  it("logs and continues when distance calculation fails for one location", async () => {
    const apt = { id: 1, pdfUrl: "stored.pdf", address: "Old St", userEditedFields: null };
    selectReturns([apt]);
    readStoredFileMock.mockResolvedValue(Buffer.from("pdf"));
    extractMock.mockResolvedValue({
      name: null,
      address: "New St",
      rentChf: null,
      sizeM2: null,
    });
    updateReturning({ id: 1, address: "New St" });
    geocodeMock.mockResolvedValue(null);
    updateNoReturn();
    deleteOk();
    listLocationsMock.mockResolvedValue([
      { id: 7, address: "x" },
      { id: 8, address: "y" },
    ]);
    calcDistanceMock
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce({ bikeMinutes: 9, transitMinutes: 18 });
    insertOk();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      new Request("http://x/api/apartments/1/reprocess", { method: "POST" }),
      withParams("1")
    );
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it("falls back to 500 on an unexpected outer error", async () => {
    selectMock.mockImplementationOnce(() => {
      throw new Error("synchronous boom");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      new Request("http://x/api/apartments/1/reprocess", { method: "POST" }),
      withParams("1")
    );
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
  });

  it("recovers from malformed userEditedFields JSON (treats as empty)", async () => {
    const apt = { id: 1, pdfUrl: "stored.pdf", address: "Same St", userEditedFields: "{not json" };
    selectReturns([apt]);
    readStoredFileMock.mockResolvedValue(Buffer.from("pdf"));
    extractMock.mockResolvedValue({
      name: "New",
      address: "Same St",
      rentChf: 1500,
      sizeM2: 60,
    });
    updateReturning({ id: 1, name: "New" });

    const res = await POST(
      new Request("http://x/api/apartments/1/reprocess", { method: "POST" }),
      withParams("1")
    );
    expect(res.status).toBe(200);
  });
});
