import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { APARTMENT_FEATURES } from "@/lib/household-data/features";
import type { Apartment } from "@/lib/household-data/types";

// The features (#471) the household knows about, under the stat tiles: what
// the apartment has, then what it lacks, struck through. Unknown ones are
// left out, and with none known there is nothing to show.
export function ApartmentFeatures({ apartment }: { apartment: Apartment }) {
  const t = useTranslations("apartments.features");
  const has = APARTMENT_FEATURES.filter((f) => apartment[f] === true);
  const lacks = APARTMENT_FEATURES.filter((f) => apartment[f] === false);
  if (has.length === 0 && lacks.length === 0) return null;
  return (
    <section data-apartment-features aria-label={t("heading")} className="space-y-1.5">
      <h2 className="text-xs font-medium text-muted-foreground">{t("heading")}</h2>
      <ul className="flex flex-wrap gap-1.5">
        {[...has.map((f) => ({ f, yes: true })), ...lacks.map((f) => ({ f, yes: false }))].map(({ f, yes }) => (
          <li
            key={f}
            data-feature={f}
            data-has={yes ? "true" : "false"}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm",
              yes ? "border-frame bg-card font-medium" : "text-muted-foreground line-through"
            )}
          >
            {yes ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
            <span aria-hidden>{t(f)}</span>
            <span className="sr-only">{yes ? t("has", { feature: t(f) }) : t("hasNot", { feature: t(f) })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
