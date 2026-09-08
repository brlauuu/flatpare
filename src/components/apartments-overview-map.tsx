"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "flatpare-overview-map-open";

export interface OverviewApartment {
  id: string;
  shortCode: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface OverviewLocation {
  id: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  apartments: OverviewApartment[];
  locations: OverviewLocation[];
  // Fired once, the first time the panel is open in this mount. The list
  // page uses it to kick off the geocode maintenance pass.
  onOpen?: () => void;
}

const LeafletMap = dynamic(() => import("./apartments-overview-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export function ApartmentsOverviewMap({ apartments, locations, onOpen }: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const openedRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    }
    if (!open || openedRef.current) return;
    openedRef.current = true;
    onOpenRef.current?.();
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
        className="flex min-h-11 w-full items-center justify-between rounded-none px-4 py-3 text-left sm:min-h-0"
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
              No geocoded apartments or locations yet. Apartments and locations
              are geocoded when saved; anything still missing coordinates is
              filled in when this panel opens.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
