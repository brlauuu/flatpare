import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn((opts: Record<string, unknown>) => opts),
  },
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => "gemini-model"),
}));

import { extractApartmentData, apartmentExtractionSchema, extractionPrompt } from "../parse-pdf";
import { LOCALES } from "@/locales/locales";
import { generateText } from "ai";

const mockedGenerateText = vi.mocked(generateText);

beforeEach(() => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.AI_PROVIDER;
  delete process.env.AI_MODEL;
  delete process.env.AI_ZERO_DATA_RETENTION;
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
      summary: null,
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
      summary: null,
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
      summary: null,
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
      summary: null,
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
      summary: null,
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

  it("accepts a string summary", () => {
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
      summary: "Bright south-facing 2.5-room flat in a leafy district near transit.",
    });
    expect(result.summary).toBe(
      "Bright south-facing 2.5-room flat in a leafy district near transit."
    );
  });

  it("accepts null summary", () => {
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
      summary: null,
    });
    expect(result.summary).toBeNull();
  });

  it("rejects a non-string summary", () => {
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
        availableFrom: null,
        summary: 123,
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

    const { extracted: result } = await extractApartmentData("base64pdf");
    expect(result).toEqual(mockOutput);
    expect(mockedGenerateText).toHaveBeenCalledOnce();
  });

  // #409: where the listing was published, for the search; never in the
  // extraction the browser receives.
  it("returns the listing's site and language as hints, not as extracted fields", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    mockedGenerateText.mockResolvedValue({
      output: {
        name: "Sonnige Wohnung",
        address: "Bahnhofstrasse 1, 8001 Zürich",
        listingUrl: null,
        laundryEvidence: null,
        listingSite: "homegate.ch",
        listingLanguage: "de",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const { extracted, hints } = await extractApartmentData("base64pdf");
    expect(hints).toEqual({
      name: "Sonnige Wohnung",
      address: "Bahnhofstrasse 1, 8001 Zürich",
      site: "homegate.ch",
      language: "de",
    });
    expect(extracted).not.toHaveProperty("listingSite");
    expect(extracted).not.toHaveProperty("listingLanguage");
    expect(extracted).not.toHaveProperty("laundryEvidence");
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

    const { extracted: result } = await extractApartmentData("base64pdf");
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

    const { extracted: result } = await extractApartmentData("base64pdf");
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

    const { extracted: result } = await extractApartmentData("base64pdf");
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

    const { extracted: result } = await extractApartmentData("base64pdf");
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

    const { extracted: result } = await extractApartmentData("base64pdf");
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

    const { extracted: result } = await extractApartmentData("base64pdf");
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

    const { extracted: result } = await extractApartmentData("base64pdf");
    expect(result.availableFrom).toBeNull();
  });
});

describe("extractApartmentData — summary passthrough", () => {
  it("returns summary from the AI output", async () => {
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
        summary: "Quiet 2.5-room flat in a leafy district near transit.",
        laundryEvidence: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const { extracted: result } = await extractApartmentData("base64pdf");
    expect(result.summary).toBe(
      "Quiet 2.5-room flat in a leafy district near transit."
    );
  });

  it("returns null summary from the AI output", async () => {
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
        summary: null,
        laundryEvidence: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);

    const { extracted: result } = await extractApartmentData("base64pdf");
    expect(result.summary).toBeNull();
  });
});

// #333: the hosted deployment reads PDFs through Vercel AI Gateway, and every
// request must demand zero data retention.
describe("extractApartmentData — AI provider", () => {
  const output = { name: "A", address: null, sizeM2: null, numRooms: null, numBathrooms: null,
    numBalconies: null, hasWashingMachine: null, rentChf: null };

  it("sends the gateway model with zeroDataRetention on the gateway path", async () => {
    process.env.AI_PROVIDER = "gateway";
    mockedGenerateText.mockResolvedValue({ output } as never);
    await extractApartmentData("base64pdf");
    const call = mockedGenerateText.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(call.model).toBe("google/gemini-2.5-flash");
    expect(call.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
  });

  it("uses AI_MODEL on the gateway path", async () => {
    process.env.AI_PROVIDER = "gateway";
    process.env.AI_MODEL = "anthropic/claude-haiku-4.5";
    mockedGenerateText.mockResolvedValue({ output } as never);
    await extractApartmentData("base64pdf");
    const call = mockedGenerateText.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(call.model).toBe("anthropic/claude-haiku-4.5");
  });

  it("sends no gateway options on the Google path", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    mockedGenerateText.mockResolvedValue({ output } as never);
    await extractApartmentData("base64pdf");
    const call = mockedGenerateText.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(call.model).toBe("gemini-model");
    expect(call.providerOptions).toBeUndefined();
  });

  it("refuses to run with an invalid AI configuration", async () => {
    process.env.AI_PROVIDER = "openai";
    await expect(extractApartmentData("base64pdf")).rejects.toThrow(/AI_PROVIDER/);
  });
});

// #288, part 5: listings in four languages, the summary in the uploader's.
describe("extractionPrompt — languages", () => {
  it("asks for the summary in the uploader's language", () => {
    expect(extractionPrompt("en")).toContain("summary (~25-40 words) in English");
    expect(extractionPrompt("fr")).toContain("summary (~25-40 words) in French");
    expect(extractionPrompt("it")).toContain("summary (~25-40 words) in Italian");
    expect(extractionPrompt("es")).toContain("summary (~25-40 words) in Spanish");
    // Swiss German, like the interface: no ß.
    expect(extractionPrompt("de")).toMatch(/in German, as written in Switzerland \(always "ss", never "ß"\)/);
  });

  it("no longer asks for an English summary regardless of language", () => {
    for (const locale of LOCALES.filter((l) => l !== "en")) {
      expect(extractionPrompt(locale)).not.toMatch(/English summary/);
    }
  });

  it("keeps the German recognition patterns", () => {
    const prompt = extractionPrompt("en");
    for (const phrase of ["Bruttomiete", "3.5 Zimmer", "Waschmaschine in der Wohnung", "Waschturm", "zur Mitbenutzung", "Gemeinschaftswaschküche", "Bezugstermin: 01.05.2026", "ab sofort", "per sofort"]) {
      expect(prompt).toContain(phrase);
    }
  });

  it("recognises French, Italian and Spanish listings", () => {
    const prompt = extractionPrompt("en");
    for (const phrase of [
      // French (Romandie)
      "loyer brut", "3.5 pièces", "lave-linge privatif", "colonne de lavage", "buanderie commune", "disponible dès le 1er mai 2026", "de suite",
      // Italian (Ticino)
      "pigione lorda", "3.5 locali", "lavatrice propria", "lavanderia in comune", "disponibile dal 1° maggio 2026", "subito",
      // Spanish
      "alquiler bruto", "3.5 habitaciones", "lavadora propia", "lavandería comunitaria", "disponible a partir del 1 de mayo de 2026", "inmediata",
    ]) {
      expect(prompt).toContain(phrase);
    }
  });

  it("sends the prompt for the requested language, and English by default", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    mockedGenerateText.mockResolvedValue({ output: { name: "x", laundryEvidence: null }, usage: { inputTokens: 1, outputTokens: 1 } } as never);
    const textOf = (n: number) => {
      const call = mockedGenerateText.mock.calls[n][0] as { messages: Array<{ content: Array<Record<string, unknown>> }> };
      return call.messages[0].content.find((p) => p.type === "text")?.text;
    };

    await extractApartmentData("base64pdf", "it");
    expect(textOf(0)).toBe(extractionPrompt("it"));
    await extractApartmentData("base64pdf");
    expect(textOf(1)).toBe(extractionPrompt("en"));
  });
});

describe("extractApartmentData — shared laundry in French, Italian and Spanish", () => {
  const output = (laundryEvidence: string) => ({
    output: { name: "x", hasWashingMachine: true, laundryEvidence },
    usage: { inputTokens: 1, outputTokens: 1 },
  });

  it.each([
    "Buanderie commune au sous-sol",
    "Lave-linge et séchoir à usage commun",
    "Buanderie en commun avec les voisins",
    "Lavanderia in comune nello stabile",
    "Lavanderia condominiale",
    "Lavatrice condivisa",
    "Lavandería comunitaria en el sótano",
    "Lavadora compartida",
  ])("overrides to false on %j", async (evidence) => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    mockedGenerateText.mockResolvedValue(output(evidence) as never);
    expect((await extractApartmentData("base64pdf", "en")).extracted.hasWashingMachine).toBe(false);
  });

  it.each(["Lave-linge privatif dans l'appartement", "Colonne de lavage", "Lavatrice propria", "Lavadora propia en el piso"])(
    "keeps an in-unit machine on %j",
    async (evidence) => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
      mockedGenerateText.mockResolvedValue(output(evidence) as never);
      expect((await extractApartmentData("base64pdf", "en")).extracted.hasWashingMachine).toBe(true);
    }
  );
});
