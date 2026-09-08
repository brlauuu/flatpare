import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { uploadFile } from "@/lib/storage";

// Multipart upload of one already-encrypted PDF. Used when Blob is not
// configured (local mode); in cloud mode the client uploads directly with a
// token from ./upload-token. The server treats the bytes as opaque.
const fieldsSchema = z.object({ apartmentId: z.uuid() });

export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new ApiError("Missing file", 400);
    const { apartmentId } = fieldsSchema.parse({ apartmentId: form.get("apartmentId") });

    const path = await uploadFile(
      householdId,
      `${apartmentId}.pdf.enc`,
      new File([file], `${apartmentId}.pdf.enc`, { type: "application/octet-stream" })
    );
    return NextResponse.json({ path }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "files:POST");
  }
}
