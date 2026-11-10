"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  emptyApartment,
  type Apartment,
  type ApartmentPdf,
} from "@/lib/household-data/types";
import {
  DEFAULT_RENT_CURRENCY,
  RENT_CURRENCIES,
  normalizeCurrency,
  rentCurrencyOf,
} from "@/lib/household-data/rent";
import {
  APARTMENT_FEATURES,
  type ApartmentFeature,
  type ApartmentFeatures,
} from "@/lib/household-data/features";

// A feature (#471) in the form: "yes", "no", or "" for unknown. Strings, so
// it goes through the form's one onChange like every other field.
export type FeatureAnswer = "yes" | "no" | "";

function answerOf(value: unknown): FeatureAnswer {
  return value === true ? "yes" : value === false ? "no" : "";
}

function valueOf(answer: FeatureAnswer): boolean | null {
  return answer === "yes" ? true : answer === "no" ? false : null;
}

function featureAnswers(source: Partial<Record<ApartmentFeature, unknown>>): Record<ApartmentFeature, FeatureAnswer> {
  return Object.fromEntries(APARTMENT_FEATURES.map((f) => [f, answerOf(source[f])])) as Record<
    ApartmentFeature,
    FeatureAnswer
  >;
}

function featureValues(form: Record<ApartmentFeature, FeatureAnswer>): ApartmentFeatures {
  return Object.fromEntries(APARTMENT_FEATURES.map((f) => [f, valueOf(form[f])])) as ApartmentFeatures;
}

export type ApartmentForm = {
  name: string;
  address: string;
  sizeM2: string;
  numRooms: string;
  numBathrooms: string;
  numBalconies: string;
  hasWashingMachine: boolean | null;
  rentChf: string;
  // ISO 4217 (#427); what the rent is in, whether or not one is typed.
  rentCurrency: string;
  listingUrl: string;
  summary: string;
  availableFrom: string;
  rawExtractedData: Record<string, unknown> | null;
} & Record<ApartmentFeature, FeatureAnswer>;

export const emptyApartmentForm: ApartmentForm = {
  name: "",
  address: "",
  sizeM2: "",
  numRooms: "",
  numBathrooms: "",
  numBalconies: "",
  hasWashingMachine: null,
  rentChf: "",
  rentCurrency: DEFAULT_RENT_CURRENCY,
  listingUrl: "",
  summary: "",
  availableFrom: "",
  rawExtractedData: null,
  ...featureAnswers({}),
};

export function formFromExtracted(extracted: Record<string, unknown>): ApartmentForm {
  return {
    name: (extracted.name as string) || "",
    address: (extracted.address as string) || "",
    sizeM2: extracted.sizeM2 != null ? String(extracted.sizeM2) : "",
    numRooms: extracted.numRooms != null ? String(extracted.numRooms) : "",
    numBathrooms: extracted.numBathrooms != null ? String(extracted.numBathrooms) : "",
    numBalconies: extracted.numBalconies != null ? String(extracted.numBalconies) : "",
    hasWashingMachine:
      typeof extracted.hasWashingMachine === "boolean" ? extracted.hasWashingMachine : null,
    rentChf: extracted.rentChf != null ? String(extracted.rentChf) : "",
    rentCurrency: normalizeCurrency(extracted.rentCurrency) ?? DEFAULT_RENT_CURRENCY,
    listingUrl: (extracted.listingUrl as string) || "",
    summary: typeof extracted.summary === "string" ? extracted.summary : "",
    availableFrom: typeof extracted.availableFrom === "string" ? extracted.availableFrom : "",
    rawExtractedData: extracted,
    ...featureAnswers(extracted),
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
  rentCurrency?: string | null;
  listingUrl: string | null;
  summary: string | null;
  availableFrom: string | null;
} & Partial<ApartmentFeatures>;

export function formFromApartment(apt: ApartmentLike): ApartmentForm {
  const numOrEmpty = (v: number | null | undefined) => (v != null ? String(v) : "");
  return {
    name: apt.name,
    address: apt.address ?? "",
    sizeM2: numOrEmpty(apt.sizeM2),
    numRooms: numOrEmpty(apt.numRooms),
    numBathrooms: numOrEmpty(apt.numBathrooms),
    numBalconies: numOrEmpty(apt.numBalconies),
    hasWashingMachine: apt.hasWashingMachine,
    rentChf: numOrEmpty(apt.rentChf),
    rentCurrency: rentCurrencyOf({ rentCurrency: apt.rentCurrency ?? null }),
    listingUrl: apt.listingUrl ?? "",
    summary: apt.summary ?? "",
    availableFrom: apt.availableFrom ?? "",
    rawExtractedData: null,
    ...featureAnswers(apt),
  };
}

export type ApartmentFieldValues = Pick<
  Apartment,
  | "name"
  | "address"
  | "sizeM2"
  | "numRooms"
  | "numBathrooms"
  | "numBalconies"
  | "hasWashingMachine"
  | "rentChf"
  | "rentCurrency"
  | "listingUrl"
  | "summary"
  | "availableFrom"
  | ApartmentFeature
>;

// The user-editable fields, coerced from form strings. Callers merge this
// into an existing Apartment (edit) or into emptyApartment (create).
export function formToFields(form: ApartmentForm): ApartmentFieldValues {
  return {
    name: form.name,
    address: form.address || null,
    sizeM2: form.sizeM2 ? parseFloat(form.sizeM2) : null,
    numRooms: form.numRooms ? parseFloat(form.numRooms) : null,
    numBathrooms: form.numBathrooms ? parseInt(form.numBathrooms) : null,
    numBalconies: form.numBalconies ? parseInt(form.numBalconies) : null,
    hasWashingMachine: form.hasWashingMachine,
    rentChf: form.rentChf ? parseFloat(form.rentChf) : null,
    rentCurrency: form.rentChf ? form.rentCurrency || DEFAULT_RENT_CURRENCY : null,
    listingUrl: form.listingUrl || null,
    summary: form.summary || null,
    availableFrom: form.availableFrom || null,
    ...featureValues(form),
  };
}

// `processed`: the form was filled from a PDF that was read, which spent the
// apartment's credit (#413). An apartment entered by hand starts unprocessed.
export function apartmentFromForm(
  form: ApartmentForm,
  pdf: ApartmentPdf | null,
  processed = false
): Apartment {
  return {
    ...emptyApartment(form.name),
    ...formToFields(form),
    rawExtractedData: form.rawExtractedData,
    pdf,
    processed,
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
  const t = useTranslations("apartments.form");
  const id = (field: string) => `${idPrefix}-${field}`;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-summary`}>{t("summary")}</Label>
        <Textarea
          id={`${idPrefix}-summary`}
          value={form.summary}
          onChange={(e) => onChange("summary", e.target.value)}
          rows={3}
          placeholder={t("summaryPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("name")}>{t("name")}</Label>
        <Input
          id={id("name")}
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder={t("namePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("address")}>{t("address")}</Label>
        <Input
          id={id("address")}
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
          placeholder={t("addressPlaceholder")}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={id("rent")}>{t("rent")}</Label>
          <div className="flex gap-2">
            <Input
              id={id("rent")}
              type="number"
              value={form.rentChf}
              onChange={(e) => onChange("rentChf", e.target.value)}
            />
            <RentCurrencySelect
              value={form.rentCurrency}
              onChange={(value) => onChange("rentCurrency", value)}
              label={t("rentCurrency")}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("size")}>{t("size")}</Label>
          <Input
            id={id("size")}
            type="number"
            value={form.sizeM2}
            onChange={(e) => onChange("sizeM2", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-availableFrom`}>{t("availableFrom")}</Label>
        <Input
          id={`${idPrefix}-availableFrom`}
          type="date"
          value={form.availableFrom}
          onChange={(e) => onChange("availableFrom", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor={id("rooms")}>{t("rooms")}</Label>
          <Input
            id={id("rooms")}
            type="number"
            step="0.5"
            value={form.numRooms}
            onChange={(e) => onChange("numRooms", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("baths")}>{t("baths")}</Label>
          <Input
            id={id("baths")}
            type="number"
            value={form.numBathrooms}
            onChange={(e) => onChange("numBathrooms", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("balconies")}>{t("balconies")}</Label>
          <Input
            id={id("balconies")}
            type="number"
            value={form.numBalconies}
            onChange={(e) => onChange("numBalconies", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("washingMachine")}</Label>
        <WashingMachineToggle
          value={form.hasWashingMachine}
          onChange={onWashingMachineChange}
          label={t("washingMachine")}
        />
      </div>
      <FeatureFields form={form} onChange={onChange} />
      <div className="space-y-2">
        <Label htmlFor={id("listing-url")}>{t("listingUrl")}</Label>
        <Input
          id={id("listing-url")}
          value={form.listingUrl}
          onChange={(e) => onChange("listingUrl", e.target.value)}
          placeholder="https://..."
        />
      </div>
    </div>
  );
}

// The features (#471), each yes / no / unknown, two to a row from sm up.
function FeatureFields({
  form,
  onChange,
}: {
  form: ApartmentForm;
  onChange: (field: keyof ApartmentForm, value: string) => void;
}) {
  const t = useTranslations("apartments.features");
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("heading")}</legend>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {APARTMENT_FEATURES.map((feature) => (
          <div key={feature} data-feature={feature} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">{t(feature)}</span>
            <WashingMachineToggle
              value={valueOf(form[feature])}
              onChange={(v) => onChange(feature, answerOf(v))}
              label={t(feature)}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

// Yes / no / unknown. Named for its first use; the features (#471) use it too.
export function WashingMachineToggle({
  value,
  onChange,
  label,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  label?: string;
}) {
  const t = useTranslations("apartments.form");
  const options: Array<{
    key: "yes" | "no" | "unknown";
    v: boolean | null;
  }> = [
    { key: "yes", v: true },
    { key: "no", v: false },
    { key: "unknown", v: null },
  ];
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border">
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
            {t(opt.key)}
          </button>
        );
      })}
    </div>
  );
}

// The usual currencies, plus the apartment's own when a listing named
// another (#427).
function RentCurrencySelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const options: string[] = (RENT_CURRENCIES as readonly string[]).includes(value)
    ? [...RENT_CURRENCIES]
    : [...RENT_CURRENCIES, value];
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next as string)}>
      <SelectTrigger aria-label={label} className="w-[5.5rem] shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
