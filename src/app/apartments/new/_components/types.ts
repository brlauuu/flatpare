import type { ApartmentForm } from "@/components/apartment-form-fields";

export type UploadItem = {
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  errorReason?: "quota" | "invalid_pdf" | "unknown";
  errorRetryAfterSeconds?: number;
  form: ApartmentForm;
  expanded: boolean;
  saved: boolean;
  discarded: boolean;
};
