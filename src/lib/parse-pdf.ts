import { generateText, Output } from "ai";
import { aiAvailable, aiModel, aiProviderOptions, readAiConfig } from "@/lib/ai-provider";
import { DEFAULT_LOCALE, type Locale } from "@/locales/locales";
import type { ListingHints } from "@/lib/find-listing";
import { z } from "zod";

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
        "true if explicitly mentioned as in-unit / private (e.g. 'Waschmaschine in der Wohnung', 'eigene Waschmaschine', 'Waschturm', 'lave-linge privatif', 'colonne de lavage', 'lavatrice propria', 'lavadora propia', 'own washing machine'). " +
        "false if the listing describes shared / communal laundry — including phrases like 'zur Mitbenutzung', 'zur Mitnutzung', 'Gemeinschaftswaschküche', 'Gemeinschaftswaschraum', 'buanderie commune', 'lavanderia in comune', 'lavandería comunitaria', 'shared laundry', or 'communal laundry'. " +
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
      "A 1-2 sentence summary of the apartment (~25-40 words), in the language the instructions name. " +
        "Translate from the listing's language if needed. Highlight the most distinctive features: " +
        "neighborhood, layout style, view, condition, or notable amenities. " +
        "null only if the listing has no descriptive content beyond the bare facts."
    ),
  availableFrom: z
    .string()
    .nullable()
    .describe(
      "Move-in / availability date in ISO format YYYY-MM-DD if a specific date is given " +
        "(e.g. 'Bezugstermin: 01.05.2026' → '2026-05-01', '1. Mai 2026' → '2026-05-01', 'disponible dès le 1er mai 2026' → '2026-05-01'). " +
        "null if not mentioned, or if the listing says 'ab sofort' / 'per sofort' / 'de suite' / 'subito' / 'inmediata' / 'immediately'."
    ),
});

type ApartmentExtraction = z.infer<typeof apartmentExtractionSchema>;

const internalApartmentExtractionSchema = apartmentExtractionSchema.extend({
  laundryEvidence: z
    .string()
    .nullable()
    .describe(
      "If laundry information was found, the exact short snippet from the listing " +
        "that supports the hasWashingMachine value (max ~120 chars). null if not mentioned. " +
        "Examples: 'Waschküche und Trockenraum zur Mitbenutzung', 'eigene Waschmaschine in der Wohnung'."
    ),
  listingSite: z
    .string()
    .nullable()
    .describe(
      "The website the listing was published on, as its domain (e.g. homegate.ch, immoscout24.ch, flatfox.ch), " +
        "from the document's header, footer, logo or any link. null if the document does not show it."
    ),
  listingLanguage: z
    .string()
    .nullable()
    .describe("The language the listing itself is written in, as an ISO 639-1 code (e.g. de, fr, it). null if unclear."),
});

type InternalApartmentExtraction = z.infer<typeof internalApartmentExtractionSchema>;

// German first (the original patterns, which must stay), then French,
// Italian and Spanish (#288).
const SHARED_LAUNDRY_PATTERN =
  /zur\s+(mit)?nutzung|zur\s+mitbenutzung|gemeinschafts(wasch|wäsche)|shared\s+laundry|communal\s+laundry|buanderie\s+commune|en\s+commun|à\s+usage\s+commun|lavanderia\s+(comune|condominiale|in\s+comune)|lavatrice\s+(in\s+comune|condivisa)|lavander[ií]a\s+(comunitaria|compartida)|lavadora\s+(comunitaria|compartida)/i;

// The language the summary is written in: the uploader's interface language
// (#288). Named in English because the rest of the prompt is. The summary is
// stored in the uploader's envelope, so a mixed-language household sees it in
// whichever language its author used; accepted on the issue.
const SUMMARY_LANGUAGE: Record<Locale, string> = {
  en: "English",
  de: "German, as written in Switzerland (always \"ss\", never \"ß\")",
  fr: "French",
  it: "Italian",
  es: "Spanish",
};

export function extractionPrompt(locale: Locale): string {
  const language = SUMMARY_LANGUAGE[locale];
  return `You are an apartment listing data extractor. Extract structured data from this apartment listing PDF.
The listing may be in German, French, Italian, Spanish or English. Extract all available information.
For rent, prefer the gross rent if both net and gross are shown (German "Bruttomiete", French "loyer brut" / "charges comprises", Italian "pigione lorda" / "affitto lordo" / "spese incluse", Spanish "alquiler bruto" / "gastos incluidos").
For rooms, use the Swiss convention, in which half rooms count (e.g. "3.5 Zimmer", "3.5 pièces", "3.5 locali", "3.5 habitaciones" = 3.5 rooms).
For hasWashingMachine: true if the listing says the apartment has its own washing machine ("Waschmaschine in der Wohnung", "eigene Waschmaschine", "Waschturm", "lave-linge privatif", "lave-linge dans l'appartement", "colonne de lavage", "lavatrice propria", "lavatrice nell'appartamento", "colonna lavatrice", "lavadora propia", "lavadora en el piso", "own washing machine"). false if the listing describes shared / communal laundry — especially phrases like "zur Mitbenutzung", "zur Mitnutzung", "Gemeinschaftswaschküche", "Gemeinschaftswaschraum", "buanderie commune", "buanderie à usage commun", "lavanderia in comune", "lavanderia condominiale", "lavandería comunitaria", "lavandería compartida", "shared laundry", or "communal laundry". null if not mentioned.
For listingSite and listingLanguage: name the website the listing was published on (its domain) and the language the listing is written in; these are used to find the listing online when its link no longer works.
Always populate laundryEvidence with the exact short snippet (max ~120 characters) you used to decide, in the listing's own words, or null if no laundry information was found.
For availableFrom: parse availability phrases like "Bezugstermin: 01.05.2026", "verfügbar ab 1. Mai 2026", "disponible dès le 1er mai 2026", "entrée le 01.05.2026", "disponibile dal 1° maggio 2026", "entrata: 01.05.2026", "disponible a partir del 1 de mayo de 2026", "available from May 1, 2026" into ISO format YYYY-MM-DD. If the listing says "ab sofort", "per sofort", "de suite", "tout de suite", "immédiatement", "subito", "da subito", "inmediata", "de inmediato", "immediately", or similar (meaning available now without a specific date), return null. If no availability info is mentioned, return null.
For summary: write a 1-2 sentence summary (~25-40 words) in ${language} of what the apartment is like, whatever language the listing is in; translate if needed. Pick out distinctive features — neighborhood character, layout, views, condition, or notable amenities — rather than just restating the metric fields. Return null only if the listing has no descriptive content.
Return null for any field you cannot determine from the document.`;
}

function overrideLaundryFromEvidence(
  result: InternalApartmentExtraction
): InternalApartmentExtraction {
  if (!result.laundryEvidence) return result;
  if (SHARED_LAUNDRY_PATTERN.test(result.laundryEvidence)) {
    return { ...result, hasWashingMachine: false };
  }
  return result;
}


export interface ExtractionResult {
  extracted: ApartmentExtraction;
  // What the search for the listing needs (#409); never sent to the browser.
  hints: ListingHints;
}

export async function extractApartmentData(
  pdfBase64: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<ExtractionResult> {
  // Which backend, and whether it must keep nothing, is decided in one place
  // (#333): src/lib/ai-provider.ts.
  const config = readAiConfig();
  if (!aiAvailable(config)) throw new Error("No AI provider configured");

  const result = await generateText({
    model: aiModel(config),
    providerOptions: aiProviderOptions(config),
    output: Output.object({
      schema: internalApartmentExtractionSchema,
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: extractionPrompt(locale),
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

  if (!result.output) {
    throw new Error("Failed to extract apartment data from PDF");
  }

  const internal = result.output as InternalApartmentExtraction;
  const withOverride = overrideLaundryFromEvidence(internal);
  // Strip the internal-only fields before returning to public callers.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { laundryEvidence: _evidence, listingSite, listingLanguage, ...publicResult } = withOverride;
  return {
    extracted: publicResult as ApartmentExtraction,
    hints: {
      name: publicResult.name,
      address: publicResult.address,
      site: listingSite ?? null,
      language: listingLanguage ?? null,
    },
  };
}
