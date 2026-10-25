"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { mapFontVariables } from "./map/map-fonts";

const PinMap = dynamic(() => import("./map/pin-map-inner"), {
  ssr: false,
  loading: () => <MapMessage kind="loading" />,
});

function MapMessage({ kind }: { kind: "loading" | "failed" }) {
  const t = useTranslations("apartments.map");
  return (
    <div className="map-grid-bg flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {t(kind)}
    </div>
  );
}

// Replaces the Google Maps Embed iframe: under E3 the server never sees an
// address, so the pin is drawn from the coordinates the client geocoded.
// MapLibre since #339, on the same tiles as /map.
export function ApartmentLocationMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number | null;
  longitude: number | null;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  if (latitude === null || longitude === null) return null;
  return (
    <div className={`overflow-hidden rounded-lg border ${mapFontVariables}`}>
      {failed ? (
        <MapMessage kind="failed" />
      ) : (
        <PinMap latitude={latitude} longitude={longitude} label={label} onError={() => setFailed(true)} />
      )}
    </div>
  );
}
