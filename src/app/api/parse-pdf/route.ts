import { NextResponse } from "next/server";
import { uploadFile } from "@/lib/storage";
import { extractApartmentData } from "@/lib/parse-pdf";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Please upload a PDF file" },
        { status: 400 }
      );
    }

    const filename = `${Date.now()}-${file.name}`;

    // Upload PDF (Vercel Blob in cloud, local filesystem otherwise)
    const pdfUrl = await uploadFile(filename, file);

    // Try AI extraction — if no AI provider is configured, return empty extraction
    const hasAI =
      !!process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      !!process.env.OLLAMA_BASE_URL;

    if (!hasAI) {
      return NextResponse.json({
        pdfUrl,
        extracted: {
          name: file.name.replace(/\.pdf$/i, ""),
          address: null,
          sizeM2: null,
          numRooms: null,
          numBathrooms: null,
          numBalconies: null,
          rentChf: null,
          listingUrl: null,
        },
        aiAvailable: false,
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const extracted = await extractApartmentData(base64);

    return NextResponse.json({
      pdfUrl,
      extracted,
      aiAvailable: true,
    });
  } catch (error) {
    console.error("[parse-pdf] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process PDF" },
      { status: 500 }
    );
  }
}
