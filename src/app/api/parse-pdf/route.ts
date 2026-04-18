import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { extractApartmentData } from "@/lib/parse-pdf";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Please upload a PDF file" },
      { status: 400 }
    );
  }

  // Upload PDF to Vercel Blob
  const blob = await put(`apartments/${Date.now()}-${file.name}`, file, {
    access: "public",
  });

  // Convert PDF to base64 for AI processing
  // For now, send the entire PDF as a single document URL
  // Gemini can handle PDF files directly via URL
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const extracted = await extractApartmentData([base64]);

  return NextResponse.json({
    pdfUrl: blob.url,
    extracted,
  });
}
