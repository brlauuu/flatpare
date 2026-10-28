import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { iconComponentFor } from "@/lib/location-icons";
import type { ApartmentDistance } from "@/lib/household-data/types";
import type { LocationLite } from "./types";

interface DistanceSectionProps {
  locations: LocationLite[];
  distances: Record<string, ApartmentDistance>;
  apartmentAddress: string | null;
  // The address changed after it was processed (#413): the distances belong
  // to the old one, so none are shown until a reprocess.
  addressChanged?: boolean;
}

export function DistanceSection({
  locations,
  distances,
  apartmentAddress,
  addressChanged = false,
}: DistanceSectionProps) {
  const t = useTranslations("apartments.distance");
  if (addressChanged) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("title")}
        </h2>
        <p className="flex items-start gap-2 text-sm text-muted-foreground" title={t("addressChangedHint")}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t("addressChanged")}</span>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </h2>
      <div className="space-y-1.5">
        {locations.map((loc) => {
          const Icon = iconComponentFor(loc.icon);
          const d = distances[loc.id];
          const bike = d?.bikeMin;
          const transit = d?.transitMin;
          const mapsUrl = apartmentAddress
            ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(apartmentAddress)}&destination=${encodeURIComponent(loc.address)}&travelmode=bicycling`
            : null;
          return (
            <div key={loc.id} className="flex items-center gap-3 text-sm">
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("bikeDirections", { label: loc.label })}
                  className="tap-target text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ) : (
                <Icon
                  className="h-4 w-4 text-muted-foreground"
                  aria-label={loc.label}
                />
              )}
              <span className="font-medium">{loc.label}</span>
              <span className="text-muted-foreground">
                {bike != null ? t("bike", { minutes: bike }) : t("bikeNone")}
                {" · "}
                {transit != null ? t("transit", { minutes: transit }) : t("transitNone")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
