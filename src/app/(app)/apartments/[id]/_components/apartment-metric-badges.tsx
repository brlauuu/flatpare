import { useTranslations } from "next-intl";
import { WashingMachine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Apartment } from "@/lib/household-data/types";
import { useFormatRent } from "@/components/use-format-rent";

export function ApartmentMetricBadges({
  apartment,
}: {
  apartment: Apartment;
}) {
  const t = useTranslations("apartments.metrics");
  const tb = useTranslations("apartments.badges");
  const formatRent = useFormatRent();
  return (
    <div className="flex flex-wrap gap-2">
      {apartment.rentChf && (
        <Badge variant="secondary">{t("rentPerMonth", { amount: formatRent(apartment.rentChf, apartment.rentCurrency) })}</Badge>
      )}
      {apartment.sizeM2 && (
        <Badge variant="secondary">{tb("size", { size: apartment.sizeM2 })}</Badge>
      )}
      {apartment.numRooms && (
        <Badge variant="secondary">{tb("rooms", { count: apartment.numRooms })}</Badge>
      )}
      {apartment.numBathrooms != null && (
        <Badge variant="secondary">{t("bathrooms", { count: apartment.numBathrooms })}</Badge>
      )}
      {apartment.numBalconies != null && (
        <Badge variant="secondary">{t("balconies", { count: apartment.numBalconies })}</Badge>
      )}
      <Badge
        variant="secondary"
        title={
          apartment.hasWashingMachine === true
            ? t("washingYes")
            : apartment.hasWashingMachine === false
              ? t("washingNo")
              : t("washingUnknown")
        }
        className="gap-1"
      >
        <WashingMachine className="h-3 w-3" />
        {apartment.hasWashingMachine === true
          ? t("yes")
          : apartment.hasWashingMachine === false
            ? t("no")
            : t("unknown")}
      </Badge>
    </div>
  );
}
