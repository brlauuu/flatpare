import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";

export const apartmentExtractionSchema = z.object({
  name: z.string().describe("Listing title or apartment name"),
  address: z.string().nullable().describe("Full street address with postcode"),
  sizeM2: z
    .number()
    .nullable()
    .describe("Living area in square meters"),
  numRooms: z
    .number()
    .nullable()
    .describe("Number of rooms (Swiss style, e.g. 3.5)"),
  numBathrooms: z
    .number()
    .nullable()
    .describe("Number of bathrooms"),
  numBalconies: z
    .number()
    .nullable()
    .describe("Number of balconies or terraces"),
  hasWashingMachine: z
    .boolean()
    .nullable()
    .describe(
      "Whether the apartment has its own washing machine. " +
        "true if explicitly mentioned as in-unit / private (e.g. 'Waschmaschine in der Wohnung', 'eigene Waschmaschine', 'Waschturm', 'own washing machine'). " +
        "false if the listing describes shared / communal laundry — including phrases like 'zur Mitbenutzung', 'zur Mitnutzung', 'Gemeinschaftswaschküche', 'Gemeinschaftswaschraum', 'shared laundry', or 'communal laundry'. " +
        "null if not mentioned."
    ),
  rentChf: z
    .number()
    .nullable()
    .describe("Monthly rent in CHF (gross/brutto if available)"),
  listingUrl: z
    .string()
    .nullable()
    .describe(
      "Original listing URL from the document (e.g. immobilienscout24, wg-gesucht, homegate, etc.)"
    ),
  summary: z
    .string()
    .nullable()
    .describe(
      "A 1-2 sentence English summary of the apartment (~25-40 words). " +
        "Translate from German if needed. Highlight the most distinctive features: " +
        "neighborhood, layout style, view, condition, or notable amenities. " +
        "null only if the listing has no descriptive content beyond the bare facts."
    ),
  availableFrom: z
    .string()
    .nullable()
    .describe(
      "Move-in / availability date in ISO format YYYY-MM-DD if a specific date is given " +
        "(e.g. 'Bezugstermin: 01.05.2026' → '2026-05-01', '1. Mai 2026' → '2026-05-01'). " +
        "null if not mentioned, or if the listing says 'ab sofort' / 'per sofort' / 'immediately'."
    ),
});

export type ApartmentExtraction = z.infer<typeof apartmentExtractionSchema>;

const internalApartmentExtractionSchema = apartmentExtractionSchema.extend({
  laundryEvidence: z
    .string()
    .nullable()
    .describe(
      "If laundry information was found, the exact short snippet from the listing " +
        "that supports the hasWashingMachine value (max ~120 chars). null if not mentioned. " +
        "Examples: 'Waschküche und Trockenraum zur Mitbenutzung', 'eigene Waschmaschine in der Wohnung'."
    ),
});

type InternalApartmentExtraction = z.infer<typeof internalApartmentExtractionSchema>;

const SHARED_LAUNDRY_PATTERN =
  /zur\s+(mit)?nutzung|zur\s+mitbenutzung|gemeinschafts(wasch|wäsche)|shared\s+laundry|communal\s+laundry/i;

function overrideLaundryFromEvidence(
  result: InternalApartmentExtraction
): InternalApartmentExtraction {
  if (!result.laundryEvidence) return result;
  if (SHARED_LAUNDRY_PATTERN.test(result.laundryEvidence)) {
    return { ...result, hasWashingMachine: false };
  }
  return result;
}

function getModel() {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      model: google("gemini-2.5-flash"),
      service: "gemini" as const,
    };
  }

  throw new Error("No AI provider configured");
}

export async function extractApartmentData(
  pdfBase64: string
): Promise<ApartmentExtraction> {
  const { model, service } = getModel();

  const result = await generateText({
    model,
    output: Output.object({
      schema: internalApartmentExtractionSchema,
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an apartment listing data extractor. Extract structured data from this apartment listing PDF.
The listing may be in German or English. Extract all available information.
For rent, prefer the gross/brutto rent (Bruttomiete) if both net and gross are shown.
For rooms, use the Swiss convention (e.g. 3.5 Zimmer = 3.5 rooms).
For hasWashingMachine: true if the listing says the apartment has its own washing machine ("Waschmaschine in der Wohnung", "eigene Waschmaschine", "Waschturm", "own washing machine"). false if the listing describes shared / communal laundry — especially phrases like "zur Mitbenutzung", "zur Mitnutzung", "Gemeinschaftswaschküche", "Gemeinschaftswaschraum", "shared laundry", or "communal laundry". null if not mentioned.
Always populate laundryEvidence with the exact short snippet (max ~120 characters) you used to decide, or null if no laundry information was found.
For availableFrom: parse Swiss / German / English availability phrases like "Bezugstermin: 01.05.2026", "verfügbar ab 1. Mai 2026", "available from May 1, 2026" into ISO format YYYY-MM-DD. If the listing says "ab sofort", "per sofort", "immediately", or similar (meaning available now without a specific date), return null. If no availability info is mentioned, return null.
For summary: write a 1-2 sentence English summary (~25-40 words) of what the apartment is like. Translate from German if needed. Pick out distinctive features — neighborhood character, layout, views, condition, or notable amenities — rather than just restating the metric fields. Return null only if the listing has no descriptive content.
Return null for any field you cannot determine from the document.`,
          },
          {
            type: "file",
            data: pdfBase64,
            mediaType: "application/pdf",
          },
        ],
      },
    ],
  });

  // Log token usage
  try {
    await db.insert(apiUsage).values({
      service,
      operation: "parse_pdf",
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    });
  } catch {
    // Don't fail the parse if logging fails
  }

  if (!result.output) {
    throw new Error("Failed to extract apartment data from PDF");
  }

  const internal = result.output as InternalApartmentExtraction;
  const withOverride = overrideLaundryFromEvidence(internal);
  // Strip the internal-only field before returning to public callers.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { laundryEvidence: _evidence, ...publicResult } = withOverride;
  return publicResult as ApartmentExtraction;
}
