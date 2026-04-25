import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  apiUsage: {},
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn((opts: Record<string, unknown>) => opts),
  },
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => "gemini-model"),
}));

import { extractApartmentData, apartmentExtractionSchema } from "../parse-pdf";
import { generateText } from "ai";

const mockedGenerateText = vi.mocked(generateText);

beforeEach(() => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apartmentExtractionSchema", () => {
  it("validates a complete extraction", () => {
    const data = {
      name: "Nice Apartment",
      address: "Steinenvorstadt 10, 4051 Basel",
      sizeM2: 65,
      numRooms: 3.5,
      numBathrooms: 1,
      numBalconies: 1,
      hasWashingMachine: true,
      rentChf: 1800,
      listingUrl: "https://www.immobilienscout24.ch/listing/123",
      availableFrom: null,
    };
    const result = apartmentExtractionSchema.parse(data);
    expect(result).toEqual(data);
  });

  it("allows null for optional fields", () => {
    const data = {
      name: "Minimal",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: null,
      rentChf: null,
      listingUrl: null,
      availableFrom: null,
    };
    const result = apartmentExtractionSchema.parse(data);
    expect(result).toEqual(data);
  });

  it("accepts hasWashingMachine=false (no / shared laundry)", () => {
    const data = {
      name: "Shared Laundry Apt",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: false,
      rentChf: null,
      listingUrl: null,
      availableFrom: null,
    };
    const result = apartmentExtractionSchema.parse(data);
    expect(result.hasWashingMachine).toBe(false);
  });

  it("rejects a non-boolean, non-null hasWashingMachine", () => {
    expect(() =>
      apartmentExtractionSchema.parse({
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: "yes",
        rentChf: null,
        listingUrl: null,
      })
    ).toThrow();
  });

  it("rejects missing name", () => {
    expect(() =>
      apartmentExtractionSchema.parse({ address: null })
    ).toThrow();
  });

  it("accepts a valid ISO availableFrom", () => {
    const result = apartmentExtractionSchema.parse({
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: null,
      rentChf: null,
      listingUrl: null,
      availableFrom: "2026-05-01",
    });
    expect(result.availableFrom).toBe("2026-05-01");
  });

  it("accepts null availableFrom", () => {
    const result = apartmentExtractionSchema.parse({
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: null,
      rentChf: null,
      listingUrl: null,
      availableFrom: null,
    });
    expect(result.availableFrom).toBeNull();
  });

  it("rejects a non-string availableFrom", () => {
    expect(() =>
      apartmentExtractionSchema.parse({
        name: "X",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: null,
        rentChf: null,
        listingUrl: null,
        availableFrom: 12345,
      })
    ).toThrow();
  });
});

describe("extractApartmentData", () => {
  it("uses Gemini when GOOGLE_GENERATIVE_AI_API_KEY is set", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    const mockOutput = {
      name: "Test Apt",
      address: "Test St 1",
      sizeM2: 50,
      numRooms: 2,
      numBathrooms: 1,
      numBalconies: 0,
      hasWashingMachine: true,
      rentChf: 1500,
    };

    mockedGenerateText.mockResolvedValue({
      output: mockOutput,
      usage: { inputTokens: 100, outputTokens: 50 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result).toEqual(mockOutput);
    expect(mockedGenerateText).toHaveBeenCalledOnce();
  });

  it("sends the PDF as a file part with application/pdf mediaType", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: null,
        rentChf: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    await extractApartmentData("base64pdf");

    const call = mockedGenerateText.mock.calls[0][0] as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    const filePart = call.messages[0].content.find(
      (p) => p.type === "file"
    );
    expect(filePart).toEqual({
      type: "file",
      data: "base64pdf",
      mediaType: "application/pdf",
    });
  });

  it("throws when no AI provider is configured", async () => {
    await expect(extractApartmentData("base64pdf")).rejects.toThrow(
      "No AI provider configured"
    );
  });

  it("throws when extraction returns no output", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: null,
      usage: { inputTokens: 100, outputTokens: 0 },
    } as never);

    await expect(extractApartmentData("base64pdf")).rejects.toThrow(
      "Failed to extract apartment data from PDF"
    );
  });
});

describe("extractApartmentData — laundry evidence override", () => {
  it("overrides hasWashingMachine to false when evidence cites 'zur Mitbenutzung'", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: true,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: "Waschküche zur Mitbenutzung",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(false);
    expect("laundryEvidence" in result).toBe(false);
  });

  it("overrides null hasWashingMachine to false on shared-laundry evidence", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: null,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: "Waschküche und Trockenraum zur Mitbenutzung",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(false);
    expect("laundryEvidence" in result).toBe(false);
  });

  it("keeps hasWashingMachine=true when evidence describes in-unit laundry", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: true,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: "eigene Waschmaschine in der Wohnung",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(true);
    expect("laundryEvidence" in result).toBe(false);
  });

  it("leaves hasWashingMachine=false unchanged when evidence is shared (no-op override)", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: false,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: "Gemeinschaftswaschküche im Keller",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(false);
    expect("laundryEvidence" in result).toBe(false);
  });

  it("does not override when laundryEvidence is null", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: true,
        rentChf: null,
        listingUrl: null,
        laundryEvidence: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.hasWashingMachine).toBe(true);
    expect("laundryEvidence" in result).toBe(false);
  });
});

describe("extractApartmentData — availableFrom passthrough", () => {
  it("returns availableFrom from the AI output", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: null,
        rentChf: null,
        listingUrl: null,
        availableFrom: "2026-05-01",
        laundryEvidence: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.availableFrom).toBe("2026-05-01");
  });

  it("returns null availableFrom from the AI output", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "x",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        hasWashingMachine: null,
        rentChf: null,
        listingUrl: null,
        availableFrom: null,
        laundryEvidence: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const result = await extractApartmentData("base64pdf");
    expect(result.availableFrom).toBeNull();
  });
});
