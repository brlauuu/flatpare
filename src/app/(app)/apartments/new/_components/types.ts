import type { ApartmentForm } from "@/components/apartment-form-fields";
import type { ApartmentPdf } from "@/lib/household-data/types";

export type UploadItem = {
  // Also the apartment id the item is saved under (client-minted UUID).
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  errorReason?: "quota" | "invalid_pdf" | "no_credits" | "too_large" | "unknown";
  errorRetryAfterSeconds?: number;
  form: ApartmentForm;
  // Set once the encrypted PDF is stored; null when the upload failed.
  pdf: ApartmentPdf | null;
  pdfWarning?: string;
  // The listing link came from a web search and may be wrong (#409).
  linkFound?: boolean;
  // The PDF was read, which spent the apartment's credit (#413).
  processed?: boolean;
  // The PDF was not read, for want of credit (#413) or because it is too
  // large to send (#438): the apartment can still be saved and rated,
  // unprocessed, with its PDF.
  notRead?: "no_credits" | "too_large";
  expanded: boolean;
  saved: boolean;
  discarded: boolean;
};
