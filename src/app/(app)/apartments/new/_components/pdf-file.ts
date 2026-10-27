// The rule public/sw.js applies to a shared file, repeated for the page: some
// Android apps send a PDF with an empty or generic type, so the name counts too.
export function isPdfFile(file: Blob): boolean {
  const name = file instanceof File ? file.name : "";
  return file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

/**
 * A file read back from IndexedDB can come back as a plain Blob, without a
 * name. The page needs a File with one (the summary request names it).
 */
export function asNamedPdf(blob: Blob): File {
  if (blob instanceof File && blob.name) return blob;
  return new File([blob], "shared.pdf", { type: blob.type || "application/pdf" });
}
