// The stored file name of an apartment's encrypted PDF. Zero imports: shared
// by the browser upload path (src/lib/upload-pdf.ts) and the multipart
// fallback route (src/app/api/files/route.ts), so the two can never name the
// same upload differently.
//
// Data-key rotation (#219) re-encrypts every PDF under the new key and
// uploads it BEFORE the rotation commits. A versioned name keeps the old
// file intact until then: a failed rotation leaves an orphan at worst, never
// a row pointing at bytes sealed under a key nobody holds. Version 1 keeps
// the unversioned name every existing row already carries.
//
// A PDF attached or replaced on the apartment page (#413) also carries a
// revision, so the new file never overwrites the old one: Blob refuses to,
// and the row must keep pointing at readable bytes until it is updated.
export const PDF_REVISION_PATTERN = /^[0-9a-f]{12}$/;

export function pdfFileName(apartmentId: string, keyVersion = 1, revision?: string): string {
  const version = keyVersion === 1 ? "" : `.k${keyVersion}`;
  const rev = revision ? `.r${revision}` : "";
  return `${apartmentId}${version}${rev}.pdf.enc`;
}
