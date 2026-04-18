"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ApartmentForm = {
  name: string;
  address: string;
  sizeM2: string;
  numRooms: string;
  numBathrooms: string;
  numBalconies: string;
  rentChf: string;
  distanceBikeMin: string;
  distanceTransitMin: string;
  pdfUrl: string;
  rawExtractedData: Record<string, unknown> | null;
};

const emptyForm: ApartmentForm = {
  name: "",
  address: "",
  sizeM2: "",
  numRooms: "",
  numBathrooms: "",
  numBalconies: "",
  rentChf: "",
  distanceBikeMin: "",
  distanceTransitMin: "",
  pdfUrl: "",
  rawExtractedData: null,
};

type UploadItem = {
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "parsing_distance" | "done" | "error";
  error?: string;
  form: ApartmentForm;
  expanded: boolean;
  saved: boolean;
  discarded: boolean;
};

function formFromExtracted(
  extracted: Record<string, unknown>,
  pdfUrl: string
): ApartmentForm {
  return {
    name: (extracted.name as string) || "",
    address: (extracted.address as string) || "",
    sizeM2: extracted.sizeM2 != null ? String(extracted.sizeM2) : "",
    numRooms: extracted.numRooms != null ? String(extracted.numRooms) : "",
    numBathrooms:
      extracted.numBathrooms != null ? String(extracted.numBathrooms) : "",
    numBalconies:
      extracted.numBalconies != null ? String(extracted.numBalconies) : "",
    rentChf: extracted.rentChf != null ? String(extracted.rentChf) : "",
    distanceBikeMin: "",
    distanceTransitMin: "",
    pdfUrl,
    rawExtractedData: extracted,
  };
}

function formToPayload(form: ApartmentForm) {
  return {
    name: form.name,
    address: form.address || null,
    sizeM2: form.sizeM2 ? parseFloat(form.sizeM2) : null,
    numRooms: form.numRooms ? parseFloat(form.numRooms) : null,
    numBathrooms: form.numBathrooms ? parseInt(form.numBathrooms) : null,
    numBalconies: form.numBalconies ? parseInt(form.numBalconies) : null,
    rentChf: form.rentChf ? parseFloat(form.rentChf) : null,
    distanceBikeMin: form.distanceBikeMin
      ? parseInt(form.distanceBikeMin)
      : null,
    distanceTransitMin: form.distanceTransitMin
      ? parseInt(form.distanceTransitMin)
      : null,
    pdfUrl: form.pdfUrl || null,
    rawExtractedData: form.rawExtractedData,
  };
}

export default function UploadPage() {
  const router = useRouter();
  // "upload" = drop zone, "processing" = batch in progress, "review" = edit & save, "single" = manual entry
  const [step, setStep] = useState<
    "upload" | "processing" | "review" | "single"
  >("upload");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [singleForm, setSingleForm] = useState<ApartmentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const processingRef = useRef(false);

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

  const processFiles = useCallback(async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      setError("No PDF files selected");
      return;
    }

    const newItems: UploadItem[] = pdfFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      status: "queued" as const,
      form: emptyForm,
      expanded: false,
      saved: false,
      discarded: false,
    }));

    setItems(newItems);
    setStep("processing");
    setError("");
    processingRef.current = true;

    // Process sequentially to avoid overwhelming the API
    for (let i = 0; i < pdfFiles.length; i++) {
      if (!processingRef.current) break;

      const file = pdfFiles[i];
      const itemId = newItems[i].id;

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
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const { pdfUrl, extracted } = await res.json();
        const form = formFromExtracted(extracted, pdfUrl);

        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, status: "parsing_distance", form }
              : item
          )
        );

        // Try distance calculation in background
        if (extracted.address) {
          try {
            const distRes = await fetch("/api/distance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address: extracted.address }),
            });
            const dist = await distRes.json();
            setItems((prev) =>
              prev.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      status: "done",
                      form: {
                        ...item.form,
                        distanceBikeMin:
                          dist.bikeMinutes?.toString() || "",
                        distanceTransitMin:
                          dist.transitMinutes?.toString() || "",
                      },
                    }
                  : item
              )
            );
          } catch {
            setItems((prev) =>
              prev.map((item) =>
                item.id === itemId ? { ...item, status: "done" } : item
              )
            );
          }
        } else {
          setItems((prev) =>
            prev.map((item) =>
              item.id === itemId ? { ...item, status: "done" } : item
            )
          );
        }
      } catch (err) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: "error",
                  error: err instanceof Error ? err.message : "Failed",
                }
              : item
          )
        );
      }
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
      setError("No apartments to save");
      return;
    }

    setSaving(true);
    setError("");

    for (const item of toSave) {
      try {
        const res = await fetch("/api/apartments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formToPayload(item.form)),
        });

        if (res.ok) {
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
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError("");

    const res = await fetch("/api/apartments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToPayload(singleForm)),
    });

    if (!res.ok) {
      setError("Failed to save apartment");
      setSaving(false);
      return;
    }

    const apartment = await res.json();
    router.push(`/apartments/${apartment.id}`);
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
          <Button
            variant="outline"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf";
              input.multiple = true;
              input.onchange = () => {
                if (input.files) handleFiles(input.files);
              };
              input.click();
            }}
          >
            Choose files
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="text-center">
          <Button
            variant="link"
            onClick={() => {
              setSingleForm(emptyForm);
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

        {error && <p className="text-sm text-destructive">{error}</p>}

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
                            updateItem(item.id, { discarded: true });
                          }}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {item.expanded && !item.saved && (
                  <CardContent>
                    <ApartmentFormFields
                      form={item.form}
                      onChange={(field, value) =>
                        updateItemForm(item.id, field, value)
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
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? "Saving..." : "Save Apartment"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSingleForm(emptyForm);
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

// --- Shared form fields component ---

function ApartmentFormFields({
  form,
  onChange,
}: {
  form: ApartmentForm;
  onChange: (field: keyof ApartmentForm, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Apartment name"
        />
      </div>
      <div className="space-y-2">
        <Label>Address</Label>
        <Input
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
          placeholder="Street, postcode, city"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Rent (CHF/mo)</Label>
          <Input
            type="number"
            value={form.rentChf}
            onChange={(e) => onChange("rentChf", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Size (m²)</Label>
          <Input
            type="number"
            value={form.sizeM2}
            onChange={(e) => onChange("sizeM2", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Rooms</Label>
          <Input
            type="number"
            step="0.5"
            value={form.numRooms}
            onChange={(e) => onChange("numRooms", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Baths</Label>
          <Input
            type="number"
            value={form.numBathrooms}
            onChange={(e) => onChange("numBathrooms", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Balconies</Label>
          <Input
            type="number"
            value={form.numBalconies}
            onChange={(e) => onChange("numBalconies", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Bike to SBB (min)</Label>
          <Input
            type="number"
            value={form.distanceBikeMin}
            onChange={(e) => onChange("distanceBikeMin", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Transit to SBB (min)</Label>
          <Input
            type="number"
            value={form.distanceTransitMin}
            onChange={(e) => onChange("distanceTransitMin", e.target.value)}
          />
        </div>
      </div>
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
    case "parsing_distance":
      return <Badge variant="secondary">Calculating distance...</Badge>;
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
