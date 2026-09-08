import { envelopeAad, openBytes, sealBytes } from "@/lib/crypto";
import type { ApartmentPdf } from "@/lib/household-data/types";
import { uploadEncryptedFile } from "@/lib/upload-pdf";

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
  bytes: Uint8Array<ArrayBuffer>
): Promise<ApartmentPdf> {
  const sealed = await sealBytes(dataKey, bytes, pdfAad(householdId, apartmentId));
  const path = await uploadEncryptedFile(sealed.ct, apartmentId);
  return { path, iv: sealed.iv };
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
