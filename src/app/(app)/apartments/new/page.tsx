"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  type ApartmentForm,
  apartmentFromForm,
  emptyApartmentForm,
  formFromExtracted,
} from "@/components/apartment-form-fields";
import type { ErrorDetails } from "@/lib/fetch-error";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { languageOf } from "@/locales/locales";
import { parsePdf, ParsePdfError } from "@/components/household-data/process-client";
import { encryptAndUploadPdf } from "@/components/household-data/pdf-files";
import { useStoreErrorDetails } from "@/components/household-data/use-store-error-details";
import { newRowId } from "@/lib/household-data/ids";
import { useDraftCompletion } from "./_components/use-draft-completion";
import { useShareIntake } from "./_components/use-share-intake";
import { isPdfFile } from "./_components/pdf-file";
import { ShareNotice, UploadStep } from "./_components/upload-step";
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
  const locale = languageOf(useLocale());
  const t = useTranslations("apartments.new");
  const errorDetails = useStoreErrorDetails();
  const { createApartment, dataKey, identity } = useHouseholdData();
  const { prefillUrl, prefillTitle, draftHost, finishDraft } = useDraftCompletion();
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
  // Awaiting the draft's deletion happens before navigating, so the page can
  // be gone by then; the cleanup above only clears a timer that already exists.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (redirectTimer.current !== null) clearTimeout(redirectTimer.current);
    };
  }, []);

  // The extracted link wins; the draft's (or the share's) fills only a form
  // that has none. Read through a ref: processFiles is memoised, and the
  // shared link arrives after it was created.
  const linkRef = useRef<string | null>(null);
  function withDraftUrl(form: ApartmentForm): ApartmentForm {
    const url = linkRef.current;
    return url && !form.listingUrl ? { ...form, listingUrl: url } : form;
  }

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
        error: err instanceof Error ? err.message : t("readFailed"),
        errorReason: "unknown",
      });
      return;
    }

    const [parsed, uploaded] = await Promise.allSettled([
      parsePdf(bytes, file.name, locale),
      encryptAndUploadPdf(dataKey, identity.householdId, itemId, bytes),
    ]);

    if (parsed.status === "rejected") {
      const err: unknown = parsed.reason;
      const known = err instanceof ParsePdfError ? err : null;
      updateItem(itemId, {
        status: "error",
        error: err instanceof Error ? err.message : t("parseFailed"),
        errorReason: known?.reason ?? "unknown",
        errorRetryAfterSeconds: known?.retryAfterSeconds,
      });
      return;
    }

    updateItem(itemId, {
      status: "done",
      form: withDraftUrl(formFromExtracted(parsed.value.extracted)),
      pdf: uploaded.status === "fulfilled" ? uploaded.value : null,
      pdfWarning: uploaded.status === "rejected" ? t("pdfStoreWarning") : undefined,
    });
  }

  async function retryItem(itemId: string) {
    const file = fileMapRef.current.get(itemId);
    if (!file) {
      updateItem(itemId, {
        status: "error",
        error: t("fileLost"),
        errorReason: "unknown",
        errorRetryAfterSeconds: undefined,
      });
      return;
    }
    await parseOne(itemId, file);
  }

  const processFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter(isPdfFile);
    if (pdfFiles.length === 0) {
      setError({ headline: t("noPdfs") });
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
    // the life of the provider. The locale is not: the language menu can
    // change it without a remount, and the summary follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const { sharedUrl, finishShare, notice } = useShareIntake({
    onFiles: processFiles,
    onError: (headline) => setError({ headline }),
  });
  const link = prefillUrl ?? sharedUrl;
  // Runs every commit. useShareIntake hands its files to processFiles from an
  // effect in the same commit that set sharedUrl, and withDraftUrl reads the
  // ref only after parsing awaits, so the link is in place by then. Do not
  // move the hand-over out of an effect (see use-share-intake.ts).
  useEffect(() => {
    linkRef.current = link;
  });

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
      setError({ headline: t("nothingToSave") });
      return;
    }

    setSaving(true);
    setError(null);

    const savedNow = new Set<string>();
    for (const item of toSave) {
      try {
        await createApartment(item.id, apartmentFromForm(item.form, item.pdf));
        savedNow.add(item.id);
        fileMapRef.current.delete(item.id);
        updateItem(item.id, { saved: true });
      } catch {
        updateItem(item.id, { status: "error", error: t("itemSaveFailed") });
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
    const allSaved = items.every((i) => i.saved || i.discarded || savedNow.has(i.id));
    if (allSaved) {
      await Promise.all([finishDraft(), finishShare()]);
      if (!mounted.current) return;
      redirectTimer.current = setTimeout(() => router.push("/apartments"), 500);
    }
  }

  async function handleSaveSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!singleForm.name.trim()) {
      setError({ headline: t("nameRequired") });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createApartment(newRowId(), apartmentFromForm(singleForm, null));
      await Promise.all([finishDraft(), finishShare()]);
      if (!mounted.current) return;
      router.push(`/apartments/${created.id}`);
    } catch (err) {
      setError({
        headline: t("saveFailed"),
        details: errorDetails(err),
      });
      setSaving(false);
    }
  }

  if (step === "upload") {
    return (
      <UploadStep
        onFiles={handleFiles}
        onManualEntry={() => {
          setSingleForm({
            ...emptyApartmentForm,
            name: prefillTitle ?? "",
            listingUrl: link ?? "",
          });
          setStep("single");
        }}
        draftHost={draftHost}
        notice={notice}
        error={error}
      />
    );
  }

  if (step === "processing") {
    const doneCount = items.filter((i) => i.status === "done" || i.status === "error").length;
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="title-page">
          {t("processing", { done: doneCount, total: items.length })}
        </h1>
        <ShareNotice text={notice} />
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
        notice={notice}
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
