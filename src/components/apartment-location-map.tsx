"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

const LeafletPin = dynamic(() => import("./apartment-location-map-inner"), {
  ssr: false,
  loading: () => <MapLoading />,
});

function MapLoading() {
  const t = useTranslations("apartments.map");
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {t("loading")}
    </div>
  );
}

// Replaces the Google Maps Embed iframe: under E3 the server never sees an
// address, so the pin is drawn from the coordinates the client geocoded.
export function ApartmentLocationMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number | null;
  longitude: number | null;
  label: string;
}) {
  if (latitude === null || longitude === null) return null;
  return (
    <div className="overflow-hidden rounded-lg border">
      <LeafletPin latitude={latitude} longitude={longitude} label={label} />
    </div>
  );
}
