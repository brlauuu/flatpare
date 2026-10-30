import type React from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { Apartment } from "@/lib/household-data/types";
import { useFormatRent } from "@/components/use-format-rent";

// The facts as framed tiles, the value large and its label under it (#452).
// A missing value is left out, except the washing machine, which shows "?".
function StatTile({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-stat-tile
      title={title}
      className="flex min-w-0 flex-col rounded-lg border-2 border-frame bg-card px-3 py-2"
    >
      <span className="truncate font-mono text-lg leading-tight font-semibold">{children}</span>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function ApartmentStatTiles({ apartment }: { apartment: Apartment }) {
  const t = useTranslations("apartments.metrics");
  const tb = useTranslations("apartments.badges");
  const format = useFormatter();
  const formatRent = useFormatRent();
  const washing = apartment.hasWashingMachine;
  return (
    <div
      data-stat-tiles
      className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2"
    >
      {apartment.rentChf && (
        <StatTile label={t("rentLabel")}>
          {formatRent(apartment.rentChf, apartment.rentCurrency)}
        </StatTile>
      )}
      {apartment.sizeM2 && (
        <StatTile label={t("sizeLabel")}>{tb("size", { size: apartment.sizeM2 })}</StatTile>
      )}
      {apartment.numRooms && (
        <StatTile label={t("roomsLabel")}>{format.number(apartment.numRooms)}</StatTile>
      )}
      {apartment.numBathrooms != null && (
        <StatTile label={t("bathroomsLabel")}>{format.number(apartment.numBathrooms)}</StatTile>
      )}
      {apartment.numBalconies != null && (
        <StatTile label={t("balconiesLabel")}>{format.number(apartment.numBalconies)}</StatTile>
      )}
      <StatTile
        label={t("washingLabel")}
        title={
          washing === true ? t("washingYes") : washing === false ? t("washingNo") : t("washingUnknown")
        }
      >
        {washing === true ? t("yes") : washing === false ? t("no") : t("unknown")}
      </StatTile>
    </div>
  );
}
