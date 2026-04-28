"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "flatpare-overview-map-open";

export interface OverviewApartment {
  id: number;
  shortCode: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface OverviewLocation {
  id: number;
  label: string;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  apartments: OverviewApartment[];
  locations: OverviewLocation[];
  onBackfillComplete?: () => void;
}

const LeafletMap = dynamic(() => import("./apartments-overview-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export function ApartmentsOverviewMap({
  apartments,
  locations,
  onBackfillComplete,
}: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const backfilledRef = useRef(false);
  const onBackfillCompleteRef = useRef(onBackfillComplete);
  useEffect(() => {
    onBackfillCompleteRef.current = onBackfillComplete;
  }, [onBackfillComplete]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    }
    if (!open || backfilledRef.current) return;
    backfilledRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/geocode/backfill", { method: "POST" });
        if (res.ok) onBackfillCompleteRef.current?.();
      } catch {
        // backfill is best-effort
      }
    })();
  }, [open]);

  const apartmentPins = useMemo(
    () =>
      apartments.filter(
        (a): a is OverviewApartment & { latitude: number; longitude: number } =>
          typeof a.latitude === "number" && typeof a.longitude === "number"
      ),
    [apartments]
  );
  const locationPins = useMemo(
    () =>
      locations.filter(
        (l): l is OverviewLocation & { latitude: number; longitude: number } =>
          typeof l.latitude === "number" && typeof l.longitude === "number"
      ),
    [locations]
  );

  const hasPins = apartmentPins.length > 0 || locationPins.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="apartments-overview-map-panel"
        className="flex w-full items-center justify-between rounded-none px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <MapIcon className="h-4 w-4" />
          <span className="font-medium">Map overview</span>
          <span className="text-xs text-muted-foreground">
            {apartmentPins.length} apartments · {locationPins.length} locations
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>
      {open && (
        <div id="apartments-overview-map-panel" className="border-t">
          {hasPins ? (
            <LeafletMap apartments={apartmentPins} locations={locationPins} />
          ) : (
            <div className="flex h-[200px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              No geocoded apartments or locations yet. New entries are
              geocoded on save; existing ones will appear here as soon as
              backfill finishes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
