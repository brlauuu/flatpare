import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { consumeRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { extractApartmentData } from "@/lib/parse-pdf";
import { repairListingUrl } from "@/lib/find-listing";
import { classifyParsePdfError } from "@/lib/parse-pdf-error";
import { emptyExtraction, parsePdfMaxBytes } from "@/lib/process-schemas";
import { aiAvailable, readAiConfig } from "@/lib/ai-provider";
import { DEFAULT_LOCALE, isLocale } from "@/locales/locales";
import { chargeFirstProcessing } from "@/lib/billing";
import { z } from "zod";

// Privacy exception: the client decrypts the PDF and posts the plaintext
// bytes here for one extraction call. The bytes are held in memory for the
// request only — never stored, never logged. The encrypted copy the client
// keeps is the only one on disk. A failed extraction is logged by its
// classified reason and status only, never by the AI provider's raw error
// message, since that text is not provably free of request-derived content
// (a content-policy or validation error can echo a snippet of the input).
//
// When the PDF's listing link is missing or gone, the same request searches
// the web for the listing with its title, address, website and language
// (#409, src/lib/find-listing.ts) — the landing page's privacy section names
// it. Skipped when the person brought their own link (searchListing=0),
// which wins over anything found. Counted under the parse-pdf rate limit.
//
// Reading a PDF is its apartment's first processing (#413) unless the
// address was geocoded first: the apartment id (minted before the row
// exists) is charged one credit the first time, just before the extraction.
// Nothing is charged when no AI is configured, since nothing is called.
export async function POST(req: Request) {
  let phase: "input" | "extract" = "input";
  try {
    const { householdId } = await requireMember();
    await consumeRateLimit(householdId, "parse-pdf");
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf") {
      throw new ApiError("Please upload a PDF file", 400);
    }
    if (file.size > parsePdfMaxBytes()) {
      throw new ApiError("PDF too large to extract", 413);
    }
    const apartmentId = z.uuid().safeParse(formData.get("apartmentId"));
    if (!apartmentId.success) throw new ApiError("apartmentId is required", 400);

    if (!aiAvailable(readAiConfig())) {
      return NextResponse.json({ extracted: emptyExtraction(file.name), aiAvailable: false });
    }
    await chargeFirstProcessing(householdId, apartmentId.data);

    phase = "extract";
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    // The uploader's interface language, for the summary (#288). Anything
    // else — absent, or not one of the five — is English, not an error.
    const requested = formData.get("locale");
    const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
    const { extracted, hints } = await extractApartmentData(base64, locale);
    if (formData.get("searchListing") === "0") {
      return NextResponse.json({ extracted, aiAvailable: true, listingFound: false });
    }
    const { listingUrl, found } = await repairListingUrl(extracted.listingUrl, hints);
    return NextResponse.json({ extracted: { ...extracted, listingUrl }, aiAvailable: true, listingFound: found });
  } catch (error) {
    if (phase === "input") return apiErrorResponse(error, "process:parse-pdf");
    const classified = classifyParsePdfError(error);
    console.error(
      `[process:parse-pdf] extraction failed: reason=${classified.reason} status=${classified.status}`
    );
    return NextResponse.json(
      { error: classified.message, reason: classified.reason, retryAfterSeconds: classified.retryAfterSeconds },
      { status: classified.status }
    );
  }
}
