import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorDisplay } from "@/components/error-display";
import type { ErrorDetails } from "@/lib/fetch-error";

interface UploadStepProps {
  onFiles: (files: FileList) => void;
  onManualEntry: () => void;
  draftHost?: string | null;
  error: { headline: string; details?: ErrorDetails } | null;
}

export function UploadStep({ onFiles, onManualEntry, draftHost, error }: UploadStepProps) {
  const t = useTranslations("apartments.upload");
  const tNew = useTranslations("apartments.new");
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="title-page">{t("title")}</h1>

      {draftHost && (
        <p className="text-sm text-muted-foreground">
          {tNew("fromDraft", { host: draftHost })}
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12 transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25"
        )}
      >
        <p className="text-muted-foreground">{t("drop")}</p>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          id="pdf-file-input"
          onChange={(e) => {
            if (e.target.files) onFiles(e.target.files);
          }}
        />
        <Button
          variant="outline"
          className="h-11 sm:h-8"
          onClick={() => {
            document.getElementById("pdf-file-input")?.click();
          }}
        >
          {t("choose")}
        </Button>
      </div>

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <div className="text-center">
        <Button variant="link" className="h-11 sm:h-8" onClick={onManualEntry}>
          {t("manual")}
        </Button>
      </div>
    </div>
  );
}
