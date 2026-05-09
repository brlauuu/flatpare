import { WashingMachine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ApartmentDetail } from "./types";

export function ApartmentMetricBadges({
  apartment,
}: {
  apartment: ApartmentDetail;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {apartment.rentChf && (
        <Badge variant="secondary">
          CHF {apartment.rentChf.toLocaleString()}/mo
        </Badge>
      )}
      {apartment.sizeM2 && (
        <Badge variant="secondary">{apartment.sizeM2} m²</Badge>
      )}
      {apartment.numRooms && (
        <Badge variant="secondary">{apartment.numRooms} rooms</Badge>
      )}
      {apartment.numBathrooms != null && (
        <Badge variant="secondary">{apartment.numBathrooms} bath</Badge>
      )}
      {apartment.numBalconies != null && (
        <Badge variant="secondary">
          {apartment.numBalconies} balcon
          {apartment.numBalconies !== 1 ? "ies" : "y"}
        </Badge>
      )}
      <Badge
        variant="secondary"
        title={
          apartment.hasWashingMachine === true
            ? "Washing machine: yes"
            : apartment.hasWashingMachine === false
              ? "Washing machine: no (or shared)"
              : "Washing machine: unknown"
        }
        className="gap-1"
      >
        <WashingMachine className="h-3 w-3" />
        {apartment.hasWashingMachine === true
          ? "Yes"
          : apartment.hasWashingMachine === false
            ? "No"
            : "?"}
      </Badge>
    </div>
  );
}
