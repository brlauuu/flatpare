"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ApartmentForm = {
  name: string;
  address: string;
  sizeM2: string;
  numRooms: string;
  numBathrooms: string;
  numBalconies: string;
  hasWashingMachine: boolean | null;
  rentChf: string;
  distanceBikeMin: string;
  distanceTransitMin: string;
  pdfUrl: string;
  listingUrl: string;
  rawExtractedData: Record<string, unknown> | null;
};

export const emptyApartmentForm: ApartmentForm = {
  name: "",
  address: "",
  sizeM2: "",
  numRooms: "",
  numBathrooms: "",
  numBalconies: "",
  hasWashingMachine: null,
  rentChf: "",
  distanceBikeMin: "",
  distanceTransitMin: "",
  pdfUrl: "",
  listingUrl: "",
  rawExtractedData: null,
};

export function formFromExtracted(
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
    hasWashingMachine:
      typeof extracted.hasWashingMachine === "boolean"
        ? extracted.hasWashingMachine
        : null,
    rentChf: extracted.rentChf != null ? String(extracted.rentChf) : "",
    distanceBikeMin: "",
    distanceTransitMin: "",
    pdfUrl,
    listingUrl: (extracted.listingUrl as string) || "",
    rawExtractedData: extracted,
  };
}

export type ApartmentLike = {
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  distanceBikeMin: number | null;
  distanceTransitMin: number | null;
  pdfUrl: string | null;
  listingUrl: string | null;
};

export function formFromApartment(apt: ApartmentLike): ApartmentForm {
  const numOrEmpty = (v: number | null | undefined) =>
    v != null ? String(v) : "";
  return {
    name: apt.name,
    address: apt.address ?? "",
    sizeM2: numOrEmpty(apt.sizeM2),
    numRooms: numOrEmpty(apt.numRooms),
    numBathrooms: numOrEmpty(apt.numBathrooms),
    numBalconies: numOrEmpty(apt.numBalconies),
    hasWashingMachine: apt.hasWashingMachine,
    rentChf: numOrEmpty(apt.rentChf),
    distanceBikeMin: numOrEmpty(apt.distanceBikeMin),
    distanceTransitMin: numOrEmpty(apt.distanceTransitMin),
    pdfUrl: apt.pdfUrl ?? "",
    listingUrl: apt.listingUrl ?? "",
    rawExtractedData: null,
  };
}

export function formToPayload(form: ApartmentForm) {
  return {
    name: form.name,
    address: form.address || null,
    sizeM2: form.sizeM2 ? parseFloat(form.sizeM2) : null,
    numRooms: form.numRooms ? parseFloat(form.numRooms) : null,
    numBathrooms: form.numBathrooms ? parseInt(form.numBathrooms) : null,
    numBalconies: form.numBalconies ? parseInt(form.numBalconies) : null,
    hasWashingMachine: form.hasWashingMachine,
    rentChf: form.rentChf ? parseFloat(form.rentChf) : null,
    distanceBikeMin: form.distanceBikeMin
      ? parseInt(form.distanceBikeMin)
      : null,
    distanceTransitMin: form.distanceTransitMin
      ? parseInt(form.distanceTransitMin)
      : null,
    pdfUrl: form.pdfUrl || null,
    listingUrl: form.listingUrl || null,
    rawExtractedData: form.rawExtractedData,
  };
}

export function ApartmentFormFields({
  form,
  onChange,
  onWashingMachineChange,
  idPrefix = "apt",
}: {
  form: ApartmentForm;
  onChange: (field: keyof ApartmentForm, value: string) => void;
  onWashingMachineChange: (value: boolean | null) => void;
  idPrefix?: string;
}) {
  const id = (field: string) => `${idPrefix}-${field}`;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={id("name")}>Name *</Label>
        <Input
          id={id("name")}
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Apartment name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("address")}>Address</Label>
        <Input
          id={id("address")}
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
          placeholder="Street, postcode, city"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={id("rent")}>Rent (CHF/mo)</Label>
          <Input
            id={id("rent")}
            type="number"
            value={form.rentChf}
            onChange={(e) => onChange("rentChf", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("size")}>Size (m²)</Label>
          <Input
            id={id("size")}
            type="number"
            value={form.sizeM2}
            onChange={(e) => onChange("sizeM2", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor={id("rooms")}>Rooms</Label>
          <Input
            id={id("rooms")}
            type="number"
            step="0.5"
            value={form.numRooms}
            onChange={(e) => onChange("numRooms", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("baths")}>Baths</Label>
          <Input
            id={id("baths")}
            type="number"
            value={form.numBathrooms}
            onChange={(e) => onChange("numBathrooms", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("balconies")}>Balconies</Label>
          <Input
            id={id("balconies")}
            type="number"
            value={form.numBalconies}
            onChange={(e) => onChange("numBalconies", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Washing machine</Label>
        <WashingMachineToggle
          value={form.hasWashingMachine}
          onChange={onWashingMachineChange}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("listing-url")}>Listing URL</Label>
        <Input
          id={id("listing-url")}
          value={form.listingUrl}
          onChange={(e) => onChange("listingUrl", e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={id("bike")}>Bike to SBB (min)</Label>
          <Input
            id={id("bike")}
            type="number"
            value={form.distanceBikeMin}
            onChange={(e) => onChange("distanceBikeMin", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("transit")}>Transit to SBB (min)</Label>
          <Input
            id={id("transit")}
            type="number"
            value={form.distanceTransitMin}
            onChange={(e) => onChange("distanceTransitMin", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export function WashingMachineToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const options: Array<{
    key: "yes" | "no" | "unknown";
    label: string;
    v: boolean | null;
  }> = [
    { key: "yes", label: "Yes", v: true },
    { key: "no", label: "No", v: false },
    { key: "unknown", label: "Unknown", v: null },
  ];
  return (
    <div className="inline-flex rounded-md border">
      {options.map((opt, i) => {
        const selected = value === opt.v;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.v)}
            className={cn(
              "px-3 py-1.5 text-sm transition-colors",
              i > 0 && "border-l",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            aria-pressed={selected}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
