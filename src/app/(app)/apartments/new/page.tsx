"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ApartmentForm,
  apartmentFromForm,
  emptyApartmentForm,
  formFromExtracted,
} from "@/components/apartment-form-fields";
import { type ErrorDetails, errorDetailsFromException } from "@/lib/fetch-error";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { parsePdf, ParsePdfError } from "@/components/household-data/process-client";
import { encryptAndUploadPdf } from "@/components/household-data/pdf-files";
import { newRowId } from "@/lib/household-data/ids";
import { UploadStep } from "./_components/upload-step";
import { ReviewStep } from "./_components/review-step";
import { SingleEntryStep } from "./_components/single-entry-step";
import { StatusBadge } from "./_components/status-badge";
import type { UploadItem } from "./_components/types";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

const PDF_STORE_WARNING =
  "PDF could not be stored — the apartment will be saved without it";

export default function UploadPage() {
  const router = useRouter();
  const { createApartment, dataKey, identity } = useHouseholdData();
  // "upload" = drop zone, "processing" = batch in progress, "review" = edit & save, "single" = manual entry
  const [step, setStep] = useState<"upload" | "processing" | "review" | "single">("upload");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [singleForm, setSingleForm] = useState<ApartmentForm>(emptyApartmentForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const processingRef = useRef(false);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  // The post-save redirect is deferred so the "Saved" badges are visible for a
  // beat. Held in a ref and cleared on unmount: an uncancelled timer navigates
  // after the component is gone, and in tests it fires against the next test's
  // router mock, which is how #227's full-flow flake actually happened.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) clearTimeout(redirectTimer.current);
    };
  }, []);

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateItemForm(id: string, field: keyof ApartmentForm, value: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, form: { ...item.form, [field]: value } } : item
      )
    );
  }

  function updateItemWashingMachine(id: string, value: boolean | null) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, form: { ...item.form, hasWashingMachine: value } } : item
      )
    );
  }

  function discardItem(id: string) {
    fileMapRef.current.delete(id);
    updateItem(id, { discarded: true });
  }

  // Parse (blind proxy) and encrypt+upload run concurrently on the same
  // bytes. The item id is the future apartment id, so the file lands at its
  // final path before the row exists.
  async function parseOne(itemId: string, file: File) {
    updateItem(itemId, {
      status: "uploading",
      error: undefined,
      errorReason: undefined,
      errorRetryAfterSeconds: undefined,
      pdfWarning: undefined,
    });
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      updateItem(itemId, {
        status: "error",
        error: err instanceof Error ? err.message : "Could not read file",
        errorReason: "unknown",
      });
      return;
    }

    const [parsed, uploaded] = await Promise.allSettled([
      parsePdf(bytes, file.name),
      encryptAndUploadPdf(dataKey, identity.householdId, itemId, bytes),
    ]);

    if (parsed.status === "rejected") {
      const err: unknown = parsed.reason;
      const known = err instanceof ParsePdfError ? err : null;
      updateItem(itemId, {
        status: "error",
        error: err instanceof Error ? err.message : "Parsing failed",
        errorReason: known?.reason ?? "unknown",
        errorRetryAfterSeconds: known?.retryAfterSeconds,
      });
      return;
    }

    updateItem(itemId, {
      status: "done",
      form: formFromExtracted(parsed.value.extracted),
      pdf: uploaded.status === "fulfilled" ? uploaded.value : null,
      pdfWarning: uploaded.status === "rejected" ? PDF_STORE_WARNING : undefined,
    });
  }

  async function retryItem(itemId: string) {
    const file = fileMapRef.current.get(itemId);
    if (!file) {
      updateItem(itemId, {
        status: "error",
        error: "File reference lost — please re-upload",
        errorReason: "unknown",
        errorRetryAfterSeconds: undefined,
      });
      return;
    }
    await parseOne(itemId, file);
  }

  const processFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      setError({ headline: "No PDF files selected" });
      return;
    }

    const newItems: UploadItem[] = pdfFiles.map((file) => ({
      id: newRowId(),
      fileName: file.name,
      status: "queued" as const,
      form: emptyApartmentForm,
      pdf: null,
      expanded: false,
      saved: false,
      discarded: false,
    }));
    pdfFiles.forEach((file, i) => fileMapRef.current.set(newItems[i].id, file));

    setItems(newItems);
    setStep("processing");
    setError(null);
    processingRef.current = true;

    // Sequential across files: each file already runs two requests.
    for (let i = 0; i < pdfFiles.length; i++) {
      if (!processingRef.current) break;
      await parseOne(newItems[i].id, pdfFiles[i]);
    }

    setStep("review");
    // parseOne reads dataKey/identity from the closure; both are stable for
    // the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      void processFiles(Array.from(fileList));
    },
    [processFiles]
  );

  async function handleSaveAll() {
    const toSave = items.filter(
      (item) => item.status === "done" && !item.saved && !item.discarded && item.form.name.trim()
    );
    if (toSave.length === 0) {
      setError({ headline: "No apartments to save" });
      return;
    }

    setSaving(true);
    setError(null);

    for (const item of toSave) {
      try {
        await createApartment(item.id, apartmentFromForm(item.form, item.pdf));
        fileMapRef.current.delete(item.id);
        updateItem(item.id, { saved: true });
      } catch {
        updateItem(item.id, { status: "error", error: "Failed to save" });
      }
    }

    setSaving(false);

    // Redirect to the list only when nothing needs the user's attention.
    //
    // This used to treat `status === "error"` as "done", so a batch with a
    // failed item still navigated away after 500ms — the user was bounced to
    // the list and never saw which upload failed or why. The comment said
    // "if all saved"; the condition did not. Found via #227: the test that
    // asserts a failed save does not redirect was passing only because it ran
    // before the timer fired, and flaked whenever load put it after.
    setItems((prev) => {
      const allSaved = prev.every((i) => i.saved || i.discarded);
      if (allSaved) {
        redirectTimer.current = setTimeout(() => router.push("/apartments"), 500);
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
    try {
      const created = await createApartment(newRowId(), apartmentFromForm(singleForm, null));
      router.push(`/apartments/${created.id}`);
    } catch (err) {
      setError({
        headline: "Failed to save apartment",
        details: errorDetailsFromException(err),
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
    const doneCount = items.filter((i) => i.status === "done" || i.status === "error").length;
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
          processingRef.current = false;
          setItems([]);
          setStep("upload");
          setError(null);
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
      onChange={(field, value) => setSingleForm((f) => ({ ...f, [field]: value }))}
      onWashingMachineChange={(v) => setSingleForm((f) => ({ ...f, hasWashingMachine: v }))}
      onCancel={() => {
        setSingleForm(emptyApartmentForm);
        setStep("upload");
        setError(null);
      }}
    />
  );
}
