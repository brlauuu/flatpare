"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
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
import { uploadAndParsePdf } from "@/lib/upload-pdf";
import { UploadStep } from "./_components/upload-step";
import { ReviewStep } from "./_components/review-step";
import { SingleEntryStep } from "./_components/single-entry-step";
import { StatusBadge } from "./_components/status-badge";
import type { UploadItem } from "./_components/types";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

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

  function updateItemWashingMachine(id: string, value: boolean | null) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, form: { ...it.form, hasWashingMachine: value } } : it
      )
    );
  }

  function discardItem(id: string) {
    fileMapRef.current.delete(id);
    updateItem(id, { discarded: true });
  }

  async function parseOne(itemId: string, file: File) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status: "uploading" } : item
      )
    );

    try {
      const res = await uploadAndParsePdf(file);

      if (!res.ok) {
        let parsed: {
          error?: string;
          reason?: "quota" | "invalid_pdf" | "unknown";
          retryAfterSeconds?: number;
        } = {};
        try {
          parsed = await res.clone().json();
        } catch {
          // Non-JSON error (e.g. platform-level 413 HTML page). Fall through to
          // the shared parser so the user sees status + body excerpt.
        }
        const fallback = await fetchErrorFromResponse(res, "/api/parse-pdf");
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: "error",
                  error: parsed.error ?? fallback.message ?? "Parsing failed",
                  errorReason: parsed.reason ?? "unknown",
                  errorRetryAfterSeconds: parsed.retryAfterSeconds,
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
      processFiles(Array.from(fileList));
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

  if (step === "upload") {
    return (
      <UploadStep
        onFiles={handleFiles}
        onManualEntry={() => {
          setSingleForm(emptyApartmentForm);
          setStep("single");
        }}
        error={error}
      />
    );
  }

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

  if (step === "review") {
    return (
      <ReviewStep
        items={items}
        saving={saving}
        error={error}
        onSaveAll={handleSaveAll}
        onUploadMore={() => {
          setItems([]);
          setStep("upload");
        }}
        onRetry={retryItem}
        onUpdateItem={updateItem}
        onUpdateForm={updateItemForm}
        onUpdateWashingMachine={updateItemWashingMachine}
        onDiscard={discardItem}
      />
    );
  }

  return (
    <SingleEntryStep
      form={singleForm}
      saving={saving}
      error={error}
      onSubmit={handleSaveSingle}
      onChange={(field, value) =>
        setSingleForm((prev) => ({ ...prev, [field]: value }))
      }
      onWashingMachineChange={(v) =>
        setSingleForm((prev) => ({ ...prev, hasWashingMachine: v }))
      }
      onCancel={() => {
        setSingleForm(emptyApartmentForm);
        setStep("upload");
      }}
    />
  );
}
