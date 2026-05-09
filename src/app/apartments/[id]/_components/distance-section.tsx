import { iconComponentFor } from "@/lib/location-icons";
import type { LocationLite } from "./types";

interface DistanceSectionProps {
  locations: LocationLite[];
  distances: {
    locationId: number;
    bikeMin: number | null;
    transitMin: number | null;
  }[];
  apartmentAddress: string | null;
}

export function DistanceSection({
  locations,
  distances,
  apartmentAddress,
}: DistanceSectionProps) {
  const distancesByLoc = new Map(distances.map((d) => [d.locationId, d]));
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Distance to locations
      </h2>
      <div className="space-y-1.5">
        {locations.map((loc) => {
          const Icon = iconComponentFor(loc.icon);
          const d = distancesByLoc.get(loc.id);
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
                  aria-label={`Bike directions to ${loc.label}`}
                  className="text-muted-foreground hover:text-foreground"
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
                {bike != null ? `${bike} min bike` : "— bike"}
                {" · "}
                {transit != null ? `${transit} min transit` : "— transit"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
