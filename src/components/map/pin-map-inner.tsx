"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Map as MapLibreMap, Marker, NavigationControl, getVersion, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, type MapTheme } from "@/lib/map/style";
import { MARK_HEIGHT, MARK_WIDTH, pencilCirclePath, seedFromId } from "@/lib/map/marks";
import { workerUrl } from "@/lib/map/worker";
import { mapTilesFor, registerMapProtocols } from "./map-protocols";

// The apartment page's small map (#339): one pencil circle on the same
// street map as /map, from the same tiles — our own file inside
// Switzerland, OpenFreeMap elsewhere. It replaced a Leaflet map over
// OpenStreetMap's raster tiles. Not unit tested (no WebGL in jsdom), like
// household-map-inner.tsx; the wrapper decides whether it mounts.

setWorkerUrl(workerUrl(getVersion()));
registerMapProtocols();

const ZOOM = 15;

interface Props {
  latitude: number;
  longitude: number;
  label: string;
  onError: () => void;
}

export default function PinMapInner({ latitude, longitude, label, onError }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const { resolvedTheme } = useTheme();
  const theme: MapTheme = resolvedTheme === "dark" ? "dark" : "light";
  const appliedTheme = useRef(theme);
  const onErrorRef = useRef(onError);
  const tControls = useTranslations("map.controls");
  const [node] = useState(() => document.createElement("div"));
  const tiles = useMemo(() => mapTilesFor([{ latitude, longitude }]), [latitude, longitude]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: mapStyle(appliedTheme.current, tiles.tiles),
        center: [longitude, latitude],
        zoom: ZOOM,
        maxBounds: tiles.maxBounds,
        // The page scrolls past this map; a wheel over it should too.
        scrollZoom: false,
        attributionControl: { compact: true },
        locale: {
          "NavigationControl.ZoomIn": tControls("zoomIn"),
          "NavigationControl.ZoomOut": tControls("zoomOut"),
          "AttributionControl.ToggleAttribution": tControls("toggleAttribution"),
          "Map.Title": tControls("mapTitle"),
        },
      });
    } catch {
      onErrorRef.current();
      return;
    }
    let loaded = false;
    map.on("load", () => {
      loaded = true;
    });
    map.on("error", (e) => {
      if (!loaded && !(e as { tile?: unknown }).tile) onErrorRef.current();
    });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    const marker = new Marker({ element: node }).setLngLat([longitude, latitude]).addTo(map);
    mapRef.current = map;
    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
    };
    // tControls is read once, when the map is created (see household-map-inner).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, tiles, node]);

  useEffect(() => {
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    mapRef.current?.setStyle(mapStyle(theme, tiles.tiles));
  }, [theme, tiles]);

  return (
    <div className="map-grid-bg h-[260px] w-full">
      <div ref={containerRef} className="h-full w-full" />
      {createPortal(
        <div role="img" aria-label={label} className="map-mark text-primary">
          <svg viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`} width={MARK_WIDTH} height={MARK_HEIGHT} aria-hidden="true">
            <path
              d={pencilCirclePath(seedFromId(label))}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={MARK_WIDTH / 2} cy={MARK_HEIGHT / 2} r={3} fill="currentColor" />
          </svg>
          <span className="map-mark-label" aria-hidden="true">
            {label}
          </span>
        </div>,
        node
      )}
    </div>
  );
}
