import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { extractApartmentData } from "@/lib/parse-pdf";
import { classifyParsePdfError } from "@/lib/parse-pdf-error";
import { emptyExtraction, parsePdfMaxBytes } from "@/lib/process-schemas";

// Privacy exception: the client decrypts the PDF and posts the plaintext
// bytes here for one extraction call. The bytes are held in memory for the
// request only — never stored, never logged. The encrypted copy the client
// keeps is the only one on disk.
export async function POST(req: Request) {
  let phase: "input" | "extract" = "input";
  try {
    await requireMember();
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf") {
      throw new ApiError("Please upload a PDF file", 400);
    }
    if (file.size > parsePdfMaxBytes()) {
      throw new ApiError("PDF too large to extract", 413);
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json({ extracted: emptyExtraction(file.name), aiAvailable: false });
    }

    phase = "extract";
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const extracted = await extractApartmentData(base64);
    return NextResponse.json({ extracted, aiAvailable: true });
  } catch (error) {
    if (phase === "input") return apiErrorResponse(error, "process:parse-pdf");
    console.error("[process:parse-pdf] extraction failed:", error instanceof Error ? error.message : error);
    const classified = classifyParsePdfError(error);
    return NextResponse.json(
      { error: classified.message, reason: classified.reason, retryAfterSeconds: classified.retryAfterSeconds },
      { status: classified.status }
    );
  }
}
