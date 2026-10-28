"use client";

import Link from "next/link";
import { Info, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ApartmentView } from "@/lib/household-data/types";
import type { Credits } from "@/components/household-data/household-data-provider";

interface ProcessingNoticeProps {
  apartment: Pick<ApartmentView, "processed" | "address" | "pdf" | "rawExtractedData" | "processedAddress">;
  // The last attempt to place the address on the map failed.
  failed: boolean;
  // null when billing is off: nothing is said about credits then.
  credits: Credits | null;
  processing: boolean;
  onProcess: () => void;
}

// An apartment that is not processed yet (#413): it can be rated and
// described for free, and adding an address or a PDF processes it for one
// credit. When it has one but was not processed — no credit was left, or the
// call failed — the notice says so and offers to process it now. A processed
// apartment whose address could not be placed (a reprocess or a first
// processing whose geocode failed) is offered a retry, which is free: its
// credit is spent.
export function ProcessingNotice({ apartment, credits, failed, processing, onProcess }: ProcessingNoticeProps) {
  const t = useTranslations("apartments.processing");
  if (apartment.processed) {
    const unplaced =
      failed && apartment.address !== null && apartment.address.trim() !== "" && apartment.processedAddress === null;
    if (!unplaced) return null;
    return (
      <div
        className="flex flex-col gap-3 rounded-md border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        data-testid="processing-notice"
      >
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">{t("unplacedTitle")}</p>
            <p className="text-muted-foreground">{t("unplaced", { billing: credits ? "on" : "off" })}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={processing} onClick={onProcess} className="shrink-0">
          <RefreshCw className={processing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
          {processing ? t("processing") : t("retry")}
        </Button>
      </div>
    );
  }

  const billing = credits ? "on" : "off";
  const pending =
    (apartment.address !== null && apartment.address.trim() !== "") ||
    (apartment.pdf !== null && apartment.rawExtractedData === null);
  const noneLeft = credits !== null && credits.remaining === 0;

  return (
    <div
      className="flex flex-col gap-3 rounded-md border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="processing-notice"
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{t("title")}</p>
          <p className="text-muted-foreground">
            {pending ? t("pending", { billing }) : t("empty", { billing })}
          </p>
          {pending && noneLeft && (
            <p className="text-warning">
              {t("noneLeft")}{" "}
              <Link href="/billing" className="underline underline-offset-2">
                {t("buyMore")}
              </Link>
            </p>
          )}
        </div>
      </div>
      {pending && (
        <Button
          variant="outline"
          size="sm"
          disabled={processing || noneLeft}
          onClick={onProcess}
          className="shrink-0"
        >
          <RefreshCw className={processing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
          {processing ? t("processing") : t("process", { billing })}
        </Button>
      )}
    </div>
  );
}
