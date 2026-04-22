import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(async () => "/api/uploads/test.pdf"),
}));

vi.mock("@/lib/parse-pdf", () => ({
  extractApartmentData: vi.fn(async () => ({
    name: "Extracted Apt",
    address: "Test St 1",
    sizeM2: 65,
    numRooms: 3,
    numBathrooms: 1,
    numBalconies: 1,
    hasWashingMachine: true,
    rentChf: 1800,
  })),
}));

import { POST } from "../../api/parse-pdf/route";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createPdfFormData(): FormData {
  const blob = new Blob(["fake-pdf"], { type: "application/pdf" });
  const file = new File([blob], "test.pdf", { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

describe("POST /api/parse-pdf", () => {
  it("returns 400 for non-PDF file", async () => {
    const formData = new FormData();
    const file = new File(["text"], "test.txt", { type: "text/plain" });
    formData.append("file", file);

    const req = new Request("http://localhost/api/parse-pdf", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("PDF");
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();

    const req = new Request("http://localhost/api/parse-pdf", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns empty extraction when no AI provider is configured", async () => {
    const req = new Request("http://localhost/api/parse-pdf", {
      method: "POST",
      body: createPdfFormData(),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aiAvailable).toBe(false);
    expect(data.pdfUrl).toBeDefined();
    expect(data.extracted.name).toBeDefined();
  });

  it("returns AI extraction when provider is configured", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    const req = new Request("http://localhost/api/parse-pdf", {
      method: "POST",
      body: createPdfFormData(),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aiAvailable).toBe(true);
    expect(data.extracted.name).toBe("Extracted Apt");
  });
});
