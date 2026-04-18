"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type FormData = {
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

const emptyForm: FormData = {
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

export default function UploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [form, setForm] = useState<FormData>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file");
      return;
    }

    setUploading(true);
    setError("");

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

      setForm({
        name: extracted.name || "",
        address: extracted.address || "",
        sizeM2: extracted.sizeM2?.toString() || "",
        numRooms: extracted.numRooms?.toString() || "",
        numBathrooms: extracted.numBathrooms?.toString() || "",
        numBalconies: extracted.numBalconies?.toString() || "",
        rentChf: extracted.rentChf?.toString() || "",
        distanceBikeMin: "",
        distanceTransitMin: "",
        pdfUrl,
        rawExtractedData: extracted,
      });

      // Try to auto-calculate distance if we have an address
      if (extracted.address) {
        fetch("/api/distance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: extracted.address }),
        })
          .then((r) => r.json())
          .then((dist) => {
            setForm((prev) => ({
              ...prev,
              distanceBikeMin: dist.bikeMinutes?.toString() || "",
              distanceTransitMin: dist.transitMinutes?.toString() || "",
            }));
          })
          .catch(() => {
            // Distance calculation failed silently — user can fill manually
          });
      }

      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError("");

    const res = await fetch("/api/apartments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });

    if (!res.ok) {
      setError("Failed to save apartment");
      setSaving(false);
      return;
    }

    const apartment = await res.json();
    router.push(`/apartments/${apartment.id}`);
  }

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  if (step === "upload") {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">Upload Listing</h1>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25"
          }`}
        >
          {uploading ? (
            <p className="text-muted-foreground">
              Uploading and parsing PDF...
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Drag and drop a PDF here, or
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".pdf";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (file) handleFile(file);
                  };
                  input.click();
                }}
              >
                Choose file
              </Button>
            </>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="text-center">
          <Button variant="link" onClick={() => setStep("review")}>
            Or add manually without PDF
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Review Apartment Details</CardTitle>
          <p className="text-sm text-muted-foreground">
            {form.pdfUrl
              ? "Verify the extracted data and make corrections"
              : "Fill in the apartment details"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Apartment name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Street, postcode, city"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rentChf">Rent (CHF/mo)</Label>
                <Input
                  id="rentChf"
                  type="number"
                  value={form.rentChf}
                  onChange={(e) => updateField("rentChf", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sizeM2">Size (m²)</Label>
                <Input
                  id="sizeM2"
                  type="number"
                  value={form.sizeM2}
                  onChange={(e) => updateField("sizeM2", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numRooms">Rooms</Label>
                <Input
                  id="numRooms"
                  type="number"
                  step="0.5"
                  value={form.numRooms}
                  onChange={(e) => updateField("numRooms", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numBathrooms">Baths</Label>
                <Input
                  id="numBathrooms"
                  type="number"
                  value={form.numBathrooms}
                  onChange={(e) => updateField("numBathrooms", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numBalconies">Balconies</Label>
                <Input
                  id="numBalconies"
                  type="number"
                  value={form.numBalconies}
                  onChange={(e) => updateField("numBalconies", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="distanceBikeMin">Bike to SBB (min)</Label>
                <Input
                  id="distanceBikeMin"
                  type="number"
                  value={form.distanceBikeMin}
                  onChange={(e) =>
                    updateField("distanceBikeMin", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="distanceTransitMin">Transit to SBB (min)</Label>
                <Input
                  id="distanceTransitMin"
                  type="number"
                  value={form.distanceTransitMin}
                  onChange={(e) =>
                    updateField("distanceTransitMin", e.target.value)
                  }
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? "Saving..." : "Save Apartment"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm(emptyForm);
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
