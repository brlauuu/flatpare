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

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn(() => "ollama-model")),
}));

import { extractApartmentData, apartmentExtractionSchema } from "../parse-pdf";
import { generateText } from "ai";

const mockedGenerateText = vi.mocked(generateText);

beforeEach(() => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
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
      rentChf: 1800,
      listingUrl: "https://www.immobilienscout24.ch/listing/123",
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
      rentChf: null,
      listingUrl: null,
    };
    const result = apartmentExtractionSchema.parse(data);
    expect(result).toEqual(data);
  });

  it("rejects missing name", () => {
    expect(() =>
      apartmentExtractionSchema.parse({ address: null })
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
      rentChf: 1500,
    };

    mockedGenerateText.mockResolvedValue({
      output: mockOutput,
      usage: { inputTokens: 100, outputTokens: 50 },
    } as never);

    const result = await extractApartmentData(["base64pdf"]);
    expect(result).toEqual(mockOutput);
    expect(mockedGenerateText).toHaveBeenCalledOnce();
  });

  it("uses Ollama when OLLAMA_BASE_URL is set", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";

    mockedGenerateText.mockResolvedValue({
      output: {
        name: "Ollama Apt",
        address: null,
        sizeM2: null,
        numRooms: null,
        numBathrooms: null,
        numBalconies: null,
        rentChf: null,
      },
      usage: { inputTokens: 50, outputTokens: 25 },
    } as never);

    const result = await extractApartmentData(["base64pdf"]);
    expect(result.name).toBe("Ollama Apt");
  });

  it("throws when no AI provider is configured", async () => {
    await expect(extractApartmentData(["base64pdf"])).rejects.toThrow(
      "No AI provider configured"
    );
  });

  it("throws when extraction returns no output", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    mockedGenerateText.mockResolvedValue({
      output: null,
      usage: { inputTokens: 100, outputTokens: 0 },
    } as never);

    await expect(extractApartmentData(["base64pdf"])).rejects.toThrow(
      "Failed to extract apartment data from PDF"
    );
  });
});
