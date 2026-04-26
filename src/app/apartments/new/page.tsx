"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ErrorDisplay } from "@/components/error-display";
import {
  ApartmentFormFields,
  emptyApartmentForm,
  formFromExtracted,
  formToPayload,
  type ApartmentForm,
} from "@/components/apartment-form-fields";
import {
  type ErrorDetails,
  fetchErrorFromResponse,
  fetchErrorFromException,
} from "@/lib/fetch-error";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

type UploadItem = {
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

export default function UploadPage() {
  const router = useRouter();
  // "upload" = drop zone, "processing" = batch in progress, "review" = edit & save, "single" = manual entry
  const [step, setStep] = useState<
    "upload" | "processing" | "review" | "single"
  >("upload");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [singleForm, setSingleForm] = useState<ApartmentForm>(emptyApartmentForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const processingRef = useRef(false);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function updateItemForm(id: string, field: keyof ApartmentForm, value: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, form: { ...item.form, [field]: value } }
          : item
      )
    );
  }

  async function parseOne(itemId: string, file: File) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status: "uploading" } : item
      )
    );

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json()) as {
          error?: string;
          reason?: "quota" | "invalid_pdf" | "unknown";
          retryAfterSeconds?: number;
        };
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: "error",
                  error: data.error ?? "Parsing failed",
                  errorReason: data.reason ?? "unknown",
                  errorRetryAfterSeconds: data.retryAfterSeconds,
                }
              : i
          )
        );
        return;
      }

      const { pdfUrl, extracted } = await res.json();
      const form = formFromExtracted(extracted, pdfUrl);

      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, status: "done", form } : item
        )
      );
    } catch (err) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: "error",
                error: err instanceof Error ? err.message : "Failed",
                errorReason: "unknown",
              }
            : item
        )
      );
    }
  }

  async function retryItem(itemId: string) {
    const file = fileMapRef.current.get(itemId);
    if (!file) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                status: "error",
                error: "File reference lost — please re-upload",
                errorReason: "unknown",
                errorRetryAfterSeconds: undefined,
              }
            : i
        )
      );
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              error: undefined,
              errorReason: undefined,
              errorRetryAfterSeconds: undefined,
            }
          : i
      )
    );
    await parseOne(itemId, file);
  }

  const processFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      setError({ headline: "No PDF files selected" });
      return;
    }

    const newItems: UploadItem[] = pdfFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      status: "queued" as const,
      form: emptyApartmentForm,
      expanded: false,
      saved: false,
      discarded: false,
    }));

    pdfFiles.forEach((file, i) => {
      fileMapRef.current.set(newItems[i].id, file);
    });

    setItems(newItems);
    setStep("processing");
    setError(null);
    processingRef.current = true;

    // Process sequentially to avoid overwhelming the API
    for (let i = 0; i < pdfFiles.length; i++) {
      if (!processingRef.current) break;
      const file = pdfFiles[i];
      const itemId = newItems[i].id;
      await parseOne(itemId, file);
    }

    setStep("review");
  }, []);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length === 1) {
        // Single file — same flow as before but through the batch system
        processFiles(files);
      } else {
        processFiles(files);
      }
    },
    [processFiles]
  );

  async function handleSaveAll() {
    const toSave = items.filter(
      (item) =>
        item.status === "done" &&
        !item.saved &&
        !item.discarded &&
        item.form.name.trim()
    );

    if (toSave.length === 0) {
      setError({ headline: "No apartments to save" });
      return;
    }

    setSaving(true);
    setError(null);

    for (const item of toSave) {
      try {
        const res = await fetch("/api/apartments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formToPayload(item.form)),
        });

        if (res.ok) {
          fileMapRef.current.delete(item.id);
          updateItem(item.id, { saved: true });
        } else {
          updateItem(item.id, {
            status: "error",
            error: "Failed to save",
          });
        }
      } catch {
        updateItem(item.id, { status: "error", error: "Failed to save" });
      }
    }

    setSaving(false);

    // If all saved, redirect to list
    setItems((prev) => {
      const allDone = prev.every(
        (i) => i.saved || i.discarded || i.status === "error"
      );
      if (allDone) {
        setTimeout(() => router.push("/apartments"), 500);
      }
      return prev;
    });
  }

  async function handleSaveSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!singleForm.name.trim()) {
      setError({ headline: "Name is required" });
      return;
    }

    setSaving(true);
    setError(null);

    const url = "/api/apartments";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(singleForm)),
      });

      if (!res.ok) {
        setError({
          headline: "Failed to save apartment",
          details: await fetchErrorFromResponse(res, url),
        });
        setSaving(false);
        return;
      }

      const apartment = await res.json();
      router.push(`/apartments/${apartment.id}`);
    } catch (err) {
      setError({
        headline: "Failed to save apartment",
        details: fetchErrorFromException(err, url),
      });
      setSaving(false);
    }
  }

  // --- Upload step ---
  if (step === "upload") {
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
            handleFiles(e.dataTransfer.files);
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
              if (e.target.files) handleFiles(e.target.files);
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

        {error && (
          <ErrorDisplay headline={error.headline} details={error.details} />
        )}

        <div className="text-center">
          <Button
            variant="link"
            onClick={() => {
              setSingleForm(emptyApartmentForm);
              setStep("single");
            }}
          >
            Or add manually without PDF
          </Button>
        </div>
      </div>
    );
  }

  // --- Processing step ---
  if (step === "processing") {
    const doneCount = items.filter(
      (i) => i.status === "done" || i.status === "error"
    ).length;
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">
          Processing ({doneCount}/{items.length})
        </h1>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <span className="truncate text-sm">{item.fileName}</span>
              <StatusBadge status={item.status} error={item.error} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Review step (batch) ---
  if (step === "review") {
    const saveable = items.filter(
      (i) => i.status === "done" && !i.saved && !i.discarded && i.form.name.trim()
    );
    const savedCount = items.filter((i) => i.saved).length;
    const allDone = items.every(
      (i) => i.saved || i.discarded || i.status === "error"
    );

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Review Apartments</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setItems([]);
                setStep("upload");
              }}
            >
              Upload more
            </Button>
            {saveable.length > 0 && (
              <Button onClick={handleSaveAll} disabled={saving}>
                {saving
                  ? "Saving..."
                  : `Save ${saveable.length === 1 ? "apartment" : `all ${saveable.length}`}`}
              </Button>
            )}
          </div>
        </div>

        {allDone && savedCount > 0 && (
          <p className="text-sm text-muted-foreground">
            All apartments saved. Redirecting...
          </p>
        )}

        {error && (
          <ErrorDisplay headline={error.headline} details={error.details} />
        )}

        <div className="space-y-3">
          {items.map((item) => {
            if (item.discarded) return null;

            return (
              <Card
                key={item.id}
                className={cn(item.saved && "opacity-60")}
              >
                <CardHeader
                  className="cursor-pointer"
                  onClick={() =>
                    !item.saved &&
                    updateItem(item.id, { expanded: !item.expanded })
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm text-muted-foreground">
                        {item.expanded ? "▼" : "▶"}
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">
                          {item.form.name || item.fileName}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground truncate">
                          {[
                            item.form.address,
                            item.form.rentChf &&
                              `CHF ${item.form.rentChf}`,
                            item.form.sizeM2 && `${item.form.sizeM2} m²`,
                            item.form.numRooms &&
                              `${item.form.numRooms} rooms`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || item.fileName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge
                        status={item.status}
                        error={item.error}
                        saved={item.saved}
                      />
                      {!item.saved && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileMapRef.current.delete(item.id);
                            updateItem(item.id, { discarded: true });
                          }}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {item.status === "error" && item.error && (
                  <CardContent>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-destructive">{item.error}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => retryItem(item.id)}
                      >
                        Retry
                      </Button>
                    </div>
                  </CardContent>
                )}

                {item.expanded && !item.saved && item.status !== "error" && (
                  <CardContent>
                    <ApartmentFormFields
                      form={item.form}
                      onChange={(field, value) =>
                        updateItemForm(item.id, field, value)
                      }
                      onWashingMachineChange={(v) =>
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === item.id
                              ? { ...it, form: { ...it.form, hasWashingMachine: v } }
                              : it
                          )
                        )
                      }
                    />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Manual single entry ---
  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Add Apartment Manually</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill in the apartment details
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSingle} className="space-y-4">
            <ApartmentFormFields
              form={singleForm}
              onChange={(field, value) =>
                setSingleForm((prev) => ({ ...prev, [field]: value }))
              }
              onWashingMachineChange={(v) =>
                setSingleForm((prev) => ({ ...prev, hasWashingMachine: v }))
              }
            />

            {error && (
          <ErrorDisplay headline={error.headline} details={error.details} />
        )}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? "Saving..." : "Save Apartment"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSingleForm(emptyApartmentForm);
                  setStep("upload");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Status badge ---

function StatusBadge({
  status,
  error,
  saved,
}: {
  status: UploadItem["status"];
  error?: string;
  saved?: boolean;
}) {
  if (saved) {
    return <Badge className="bg-green-100 text-green-700">Saved</Badge>;
  }

  switch (status) {
    case "queued":
      return <Badge variant="secondary">Queued</Badge>;
    case "uploading":
      return <Badge variant="secondary">Uploading...</Badge>;
    case "done":
      return <Badge className="bg-blue-100 text-blue-700">Parsed</Badge>;
    case "error":
      return (
        <Badge variant="destructive" title={error}>
          Error
        </Badge>
      );
  }
}
