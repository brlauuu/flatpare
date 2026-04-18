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
  rentChf: z
    .number()
    .nullable()
    .describe("Monthly rent in CHF (gross/brutto if available)"),
});

export type ApartmentExtraction = z.infer<typeof apartmentExtractionSchema>;

export async function extractApartmentData(
  pdfBase64Pages: string[]
): Promise<ApartmentExtraction> {
  const result = await generateText({
    model: google("gemini-2.5-flash-preview-05-20"),
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
Return null for any field you cannot determine from the document.`,
          },
          ...pdfBase64Pages.map(
            (page) =>
              ({
                type: "image" as const,
                image: page,
              })
          ),
        ],
      },
    ],
  });

  // Log token usage
  try {
    await db.insert(apiUsage).values({
      service: "gemini",
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
