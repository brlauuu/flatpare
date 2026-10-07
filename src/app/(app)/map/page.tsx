"use client";

import { useEffect, useRef } from "react";
import { ErrorDisplay } from "@/components/error-display";
import { HouseholdMap } from "@/components/map/household-map";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { mapFontVariables } from "./map-fonts";

// Every apartment and place of the household on one map (#330). Full width,
// like /compare, so there is no section layout here.
export default function MapPage() {
  const { status, error, apartments, locations, runMaintenance } = useHouseholdData();

  // Apartments added before they had coordinates get them now, once per
  // visit — what opening the old overview map on /apartments used to do.
  const geocodedRef = useRef(false);
  useEffect(() => {
    if (status !== "ready" || geocodedRef.current) return;
    geocodedRef.current = true;
    void runMaintenance("geocode").catch(() => {
      // best-effort; per-row failures surface through enrichment errors
    });
  }, [status, runMaintenance]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8">
        <ErrorDisplay headline={error ?? "Couldn't load the map"} />
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${mapFontVariables}`}>
      <h1 className="title-page">Map</h1>
      <HouseholdMap apartments={apartments} locations={locations} />
    </div>
  );
}
