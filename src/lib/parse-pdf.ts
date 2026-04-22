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
        "false if the listing explicitly says there is none, or only a shared/communal laundry room (e.g. 'Waschküche', 'Gemeinschaftswaschküche', 'shared laundry'). " +
        "null if not mentioned."
    ),
  rentChf: z
    .number()
    .nullable()
    .describe("Monthly rent in CHF (gross/brutto if available)"),
  listingUrl: z
    .string()
    .nullable()
    .describe("Original listing URL from the document (e.g. immobilienscout24, wg-gesucht, homegate, etc.)"),
});

export type ApartmentExtraction = z.infer<typeof apartmentExtractionSchema>;

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
      schema: apartmentExtractionSchema,
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
For hasWashingMachine: true if the listing says the apartment has its own washing machine ("Waschmaschine in der Wohnung", "eigene Waschmaschine", "Waschturm", "own washing machine"). false if only a shared laundry room is mentioned ("Waschküche", "Gemeinschaftswaschküche", "shared laundry") or if explicitly none. null if not mentioned.
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

  return result.output;
}
