"use client";

import { FileWarning } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// A PDF over what the deployment can be sent to read (#438). Nothing was
// sent and nothing charged; the PDF is kept with the apartment, unread, and
// this says how to make it small enough. Shown on the add page and on the
// apartment page.
export function PdfTooLargeNotice({ maxBytes, className }: { maxBytes: number | undefined; className?: string }) {
  const t = useTranslations("apartments.pdfTooLarge");
  const format = useFormatter();
  // The limit is absent only in test fixtures (Limits.pdfReadMaxBytes).
  const size = format.number((maxBytes ?? 4_500_000) / 1_000_000, { maximumFractionDigits: 1 });
  return (
    <div
      role="alert"
      className={cn("flex items-start gap-2 rounded-md border px-4 py-3 text-sm", className)}
      data-testid="pdf-too-large"
    >
      <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="space-y-2">
        <p className="font-medium">{t("title")}</p>
        <p className="text-muted-foreground">{t("body", { size })}</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t("pages")}</li>
          <li>{t("compress")}</li>
          <li>{t("byHand")}</li>
        </ul>
      </div>
    </div>
  );
}
