import { NextResponse } from "next/server";
import { uploadFile, readStoredFile } from "@/lib/storage";
import { extractApartmentData } from "@/lib/parse-pdf";
import { classifyParsePdfError } from "@/lib/parse-pdf-error";
import { isAuthenticated, unauthorized } from "@/lib/auth";
import { requireHousehold } from "@/lib/session";

interface BlobUploadBody {
  pathname?: unknown;
  filename?: unknown;
}

function emptyExtraction(filename: string) {
  return {
    name: filename.replace(/\.pdf$/i, ""),
    address: null,
    sizeM2: null,
    numRooms: null,
    numBathrooms: null,
    numBalconies: null,
    hasWashingMachine: null,
    rentChf: null,
    listingUrl: null,
  };
}

export async function POST(request: Request) {
  // Legacy shared-password gate, kept as the repo-wide defense-in-depth
  // convention (see AGENTS.md and the other ~15 routes that still check
  // this alongside the proxy). requireHousehold() below is the real
  // tenant-scoping check this route needs for readStoredFile/uploadFile;
  // removing this one would make this route the odd one out among routes
  // that haven't migrated off the shared-password model yet, which is a
  // broader decision than this fix.
  if (!(await isAuthenticated())) return unauthorized();

  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    let pdfUrl: string;
    let pdfBuffer: Buffer;
    let originalFilename: string;

    if (contentType.includes("application/json")) {
      // Cloud path: client uploaded straight to Blob and is now telling us where.
      const body = (await request.json()) as BlobUploadBody;
      if (typeof body.pathname !== "string" || typeof body.filename !== "string") {
        return NextResponse.json(
          { error: "pathname and filename are required" },
          { status: 400 }
        );
      }
      originalFilename = body.filename;
      pdfUrl = `/api/pdf/${body.pathname}`;
      // readStoredFile rejects if body.pathname (client-supplied) doesn't
      // belong to the caller's own household — this is the actual fix for
      // the cross-household read the JSON branch used to allow.
      pdfBuffer = await readStoredFile(pdfUrl, householdId);
    } else {
      // Local/dev path: traditional multipart upload, server writes to disk.
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file || file.type !== "application/pdf") {
        return NextResponse.json(
          { error: "Please upload a PDF file" },
          { status: 400 }
        );
      }

      originalFilename = file.name;
      const filename = `${Date.now()}-${file.name}`;
      pdfUrl = await uploadFile(householdId, filename, file);
      pdfBuffer = Buffer.from(await file.arrayBuffer());
    }

    const hasAI = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!hasAI) {
      return NextResponse.json({
        pdfUrl,
        extracted: emptyExtraction(originalFilename),
        aiAvailable: false,
      });
    }

    const base64 = pdfBuffer.toString("base64");
    const extracted = await extractApartmentData(base64);

    return NextResponse.json({ pdfUrl, extracted, aiAvailable: true });
  } catch (error) {
    console.error("[parse-pdf] Error:", error);
    const classified = classifyParsePdfError(error);
    return NextResponse.json(
      {
        error: classified.message,
        reason: classified.reason,
        retryAfterSeconds: classified.retryAfterSeconds,
      },
      { status: classified.status }
    );
  }
}
