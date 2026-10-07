"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Map as MapLibreMap, Marker, NavigationControl, getVersion, setWorkerUrl, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, type MapTheme } from "@/lib/map/style";
import { findActive, toMarks, type MapPoints, type MarkSpec } from "@/lib/map/points";
import { cardPosition, initialView } from "@/lib/map/view";
import { workerUrl } from "@/lib/map/worker";
import { isFatalMapError } from "@/lib/map/errors";
import { MapMark } from "./map-mark";
import { APARTMENT_CARD_HEIGHT, ApartmentCard, LOCATION_CARD_HEIGHT, LocationCard } from "./map-card";
import { useCardState } from "./use-card-state";

// The only file that touches MapLibre (#330). Deliberately thin: what to
// draw comes from src/lib/map, the marks and cards are ordinary React
// components rendered into MapLibre's marker elements through portals.
// jsdom has no WebGL, so this file is not unit tested — same posture as
// the Leaflet *-map-inner.tsx components (see vitest.config.mts).

// MapLibre looks for its worker beside its own script, which is a Next chunk
// here; point it at the copy next.config.ts puts in public/.
setWorkerUrl(workerUrl(getVersion()));

interface Props {
  points: MapPoints;
  onError: () => void;
}

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function HouseholdMapInner({ points, onError }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const theme: MapTheme = resolvedTheme === "dark" ? "dark" : "light";
  const appliedTheme = useRef(theme);
  const onErrorRef = useRef(onError);
  const pointsRef = useRef(points);
  const card = useCardState();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [hoverCapable] = useState(() => window.matchMedia?.("(hover: hover)").matches ?? true);

  useEffect(() => {
    onErrorRef.current = onError;
    pointsRef.current = points;
  }, [onError, points]);

  // One DOM node per mark. MapLibre positions the node; React renders the
  // mark into it through a portal.
  const marks = useMemo(() => toMarks(points), [points]);
  const nodes = useMemo(() => new Map(marks.map((m) => [m.key, document.createElement("div")])), [marks]);

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({ container, style: mapStyle(appliedTheme.current), attributionControl: { compact: true } });
    } catch {
      // No WebGL, most likely.
      onErrorRef.current();
      return;
    }
    let loaded = false;
    map.on("load", () => {
      loaded = true;
    });
    // Only an error that means nothing can be drawn swaps in the failure
    // screen; a single failed tile does not (see isFatalMapError).
    map.on("error", (e) => {
      if (isFatalMapError(e as { tile?: unknown; sourceId?: string }, loaded)) onErrorRef.current();
    });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.on("click", (e: MapMouseEvent) => {
      const target = e.originalEvent.target as Element | null;
      if (target?.closest?.(".map-mark")) return;
      card.hide();
    });
    map.on("movestart", () => card.hide());

    const all = [...pointsRef.current.apartments, ...pointsRef.current.locations];
    const view = initialView(all, container.clientWidth);
    if (view.kind === "center") map.jumpTo({ center: view.center, zoom: view.zoom });
    else map.fitBounds(view.bounds, { padding: view.padding, maxZoom: view.maxZoom, duration: 0 });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // card.hide is stable (useCardState); the map is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place the marks; re-placed when the store refreshes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = marks.map((m) => new Marker({ element: nodes.get(m.key) }).setLngLat(m.lngLat).addTo(map));
    return () => markers.forEach((m) => m.remove());
  }, [marks, nodes]);

  // Follow the theme toggle. Markers are DOM and survive a style change.
  useEffect(() => {
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    mapRef.current?.setStyle(mapStyle(theme));
  }, [theme]);

  function showAt(mark: MarkSpec) {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;
    const p = map.project(mark.lngLat);
    setAnchor({ x: p.x, y: p.y, width: container.clientWidth, height: container.clientHeight });
    card.show({ kind: mark.kind, id: mark.id });
  }

  const active = findActive(points, card.active);
  const cardHeight = active?.kind === "apartment" ? APARTMENT_CARD_HEIGHT : LOCATION_CARD_HEIGHT;
  const position = anchor && active ? cardPosition(anchor, anchor, cardHeight) : null;

  return (
    <div className="map-grid-bg relative h-full w-full">
      {/* h-full, not absolute inset-0: MapLibre's stylesheet sets
          position: relative on .maplibregl-map, which would collapse an
          absolutely positioned container to zero height. */}
      <div ref={containerRef} className="h-full w-full" />
      {marks.map((m) => {
        const node = nodes.get(m.key);
        const href = m.href;
        return node
          ? createPortal(
              <MapMark
                kind={m.kind}
                label={m.label}
                seed={m.seed}
                ariaLabel={m.ariaLabel}
                hoverCapable={hoverCapable}
                onShow={() => showAt(m)}
                onHide={card.hideSoon}
                onDismiss={card.hide}
                onOpen={href ? () => router.push(href) : undefined}
              />,
              node,
              m.key
            )
          : null;
      })}
      {position && (
        <div
          className="absolute z-10"
          style={{
            left: position.left,
            top: position.top,
            // view.ts: for "above", top is the card's bottom edge.
            transform: position.placement === "above" ? "translateY(-100%)" : undefined,
          }}
          onMouseEnter={card.cancelHide}
          onMouseLeave={card.hideSoon}
        >
          {active?.kind === "apartment" ? <ApartmentCard apartment={active.point} /> : active && <LocationCard location={active.point} />}
        </div>
      )}
    </div>
  );
}
