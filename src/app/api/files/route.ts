import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { PDF_REVISION_PATTERN, pdfFileName } from "@/lib/pdf-file-name";
import { deleteStoredFile, storedPathHousehold, uploadFile } from "@/lib/storage";

// Multipart upload of one already-encrypted PDF. Used when Blob is not
// configured (local mode); in cloud mode the client uploads directly with a
// token from ./upload-token. The server treats the bytes as opaque.
const fieldsSchema = z.object({
  apartmentId: z.uuid(),
  // Data-key rotation (#219) uploads the re-encrypted file under a versioned
  // name; a first upload omits this and gets the unversioned name.
  keyVersion: z.coerce.number().int().min(1).optional(),
  // A PDF attached or replaced on the apartment page (#413).
  revision: z.string().regex(PDF_REVISION_PATTERN).optional(),
});

export async function POST(req: Request) {
  try {
    const { householdId } = await requireMember();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new ApiError("Missing file", 400);
    const { apartmentId, keyVersion, revision } = fieldsSchema.parse({
      apartmentId: form.get("apartmentId"),
      keyVersion: form.get("keyVersion") ?? undefined,
      revision: form.get("revision") ?? undefined,
    });
    const fileName = pdfFileName(apartmentId, keyVersion, revision);

    const path = await uploadFile(
      householdId,
      fileName,
      new File([file], fileName, { type: "application/octet-stream" })
    );
    return NextResponse.json({ path }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "files:POST");
  }
}

// Deletes one stored file of the caller's household: a PDF the apartment page
// replaced, or one uploaded for a write that then failed (#413). The server
// cannot see which row points at what, so this is the same trust as deleting
// an apartment with its pdfPath: any member, any file of their household,
// and a path outside it is refused.
const deleteSchema = z.object({ path: z.string().min(1) });

export async function DELETE(req: Request) {
  try {
    const { householdId } = await requireMember();
    const { path } = await parseBody(req, deleteSchema);
    const resolved = storedPathHousehold(path);
    if (!resolved || resolved.householdId !== householdId) {
      throw new ApiError("path does not belong to this household", 400);
    }
    await deleteStoredFile(resolved.canonicalUrl, householdId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "files:DELETE");
  }
}
