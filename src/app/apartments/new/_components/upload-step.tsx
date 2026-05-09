import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorDisplay } from "@/components/error-display";
import type { ErrorDetails } from "@/lib/fetch-error";

interface UploadStepProps {
  onFiles: (files: FileList) => void;
  onManualEntry: () => void;
  error: { headline: string; details?: ErrorDetails } | null;
}

export function UploadStep({ onFiles, onManualEntry, error }: UploadStepProps) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Upload Listings</h1>

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
        <p className="text-muted-foreground">
          Drag and drop one or more PDFs here, or
        </p>
        <input
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          id="pdf-file-input"
          onChange={(e) => {
            if (e.target.files) onFiles(e.target.files);
          }}
        />
        <Button
          variant="outline"
          onClick={() => {
            document.getElementById("pdf-file-input")?.click();
          }}
        >
          Choose files
        </Button>
      </div>

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <div className="text-center">
        <Button variant="link" onClick={onManualEntry}>
          Or add manually without PDF
        </Button>
      </div>
    </div>
  );
}
