import type { ApartmentForm } from "@/components/apartment-form-fields";
import type { ApartmentPdf } from "@/lib/household-data/types";

export type UploadItem = {
  // Also the apartment id the item is saved under (client-minted UUID).
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  errorReason?: "quota" | "invalid_pdf" | "unknown";
  errorRetryAfterSeconds?: number;
  form: ApartmentForm;
  // Set once the encrypted PDF is stored; null when the upload failed.
  pdf: ApartmentPdf | null;
  pdfWarning?: string;
  expanded: boolean;
  saved: boolean;
  discarded: boolean;
};
