import { envelopeAad, openBytes, sealBytes } from "@/lib/crypto";
import type { ApartmentPdf } from "@/lib/household-data/types";
import { newRowId } from "@/lib/household-data/ids";
import { uploadEncryptedFile } from "@/lib/upload-pdf";
import { sendJson } from "./api-client";

// The PDF's AAD binds the ciphertext to its apartment row, exactly as the
// envelope AAD binds a row's JSON. A file swapped between apartments (or
// households) fails to open.
function pdfAad(householdId: number, apartmentId: string): string {
  return envelopeAad(householdId, "pdf", apartmentId);
}

export async function encryptAndUploadPdf(
  dataKey: CryptoKey | null,
  householdId: number,
  apartmentId: string,
  bytes: Uint8Array<ArrayBuffer>,
  keyVersion = 1,
  // A PDF attached or replaced on the apartment page (#413) is stored under
  // a name of its own, so it never collides with the file it replaces.
  revision?: string
): Promise<ApartmentPdf> {
  const sealed = await sealBytes(dataKey, bytes, pdfAad(householdId, apartmentId));
  const path = await uploadEncryptedFile(sealed.ct, apartmentId, keyVersion, revision);
  return { path, iv: sealed.iv };
}

// Twelve hex characters, fresh for every attach or replace.
export function pdfRevision(): string {
  return newRowId().replaceAll("-", "").slice(0, 12);
}

// Best-effort removal of a stored file the apartment no longer points at
// (a replaced PDF, or one uploaded for a write that then failed). A failure
// leaves an orphan, never a broken row.
export async function deletePdfFile(path: string): Promise<void> {
  try {
    await sendJson<void>("DELETE", "/api/files", { path });
  } catch {
    // swallowed on purpose
  }
}

export async function downloadPdf(
  dataKey: CryptoKey | null,
  householdId: number,
  apartmentId: string,
  pdf: ApartmentPdf
): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(pdf.path);
  if (!res.ok) throw new Error("PDF not found");
  const ct = new Uint8Array(await res.arrayBuffer());
  return openBytes(dataKey, { iv: pdf.iv, ct }, pdfAad(householdId, apartmentId));
}
