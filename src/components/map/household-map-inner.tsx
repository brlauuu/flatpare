"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Map as MapLibreMap, Marker, NavigationControl, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, type MapTheme } from "@/lib/map/style";
import { seedFromId } from "@/lib/map/marks";
import { describeApartment, type MapPoints } from "@/lib/map/points";
import { cardPosition, initialView } from "@/lib/map/view";
import { MapMark } from "./map-mark";
import { APARTMENT_CARD_HEIGHT, ApartmentCard, LOCATION_CARD_HEIGHT, LocationCard } from "./map-card";
import { useCardState, type ActiveMark } from "./use-card-state";

// The only file that touches MapLibre (#330). Deliberately thin: what to
// draw comes from src/lib/map, the marks and cards are ordinary React
// components rendered into MapLibre's marker elements through portals.
// jsdom has no WebGL, so this file is not unit tested — same posture as
// the Leaflet *-map-inner.tsx components (see vitest.config.mts).

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

const key = (kind: ActiveMark["kind"], id: string) => `${kind}:${id}`;

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
  const nodes = useMemo(() => {
    const map = new Map<string, HTMLDivElement>();
    for (const a of points.apartments) map.set(key("apartment", a.id), document.createElement("div"));
    for (const l of points.locations) map.set(key("location", l.id), document.createElement("div"));
    return map;
  }, [points]);

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
    // Before the first load an error means the map cannot be drawn at all
    // (tiles or style unreachable); afterwards it is one tile, ignored.
    map.on("error", () => {
      if (!loaded) onErrorRef.current();
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
    const markers: Marker[] = [];
    for (const a of points.apartments) {
      const element = nodes.get(key("apartment", a.id));
      if (element) markers.push(new Marker({ element }).setLngLat([a.longitude, a.latitude]).addTo(map));
    }
    for (const l of points.locations) {
      const element = nodes.get(key("location", l.id));
      if (element) markers.push(new Marker({ element }).setLngLat([l.longitude, l.latitude]).addTo(map));
    }
    return () => markers.forEach((m) => m.remove());
  }, [points, nodes]);

  // Follow the theme toggle. Markers are DOM and survive a style change.
  useEffect(() => {
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    mapRef.current?.setStyle(mapStyle(theme));
  }, [theme]);

  function showAt(mark: ActiveMark, lngLat: [number, number]) {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;
    const p = map.project(lngLat);
    setAnchor({ x: p.x, y: p.y, width: container.clientWidth, height: container.clientHeight });
    card.show(mark);
  }

  const activeApartment = card.active?.kind === "apartment" ? points.apartments.find((a) => a.id === card.active?.id) : undefined;
  const activeLocation = card.active?.kind === "location" ? points.locations.find((l) => l.id === card.active?.id) : undefined;
  const position =
    anchor && (activeApartment || activeLocation)
      ? cardPosition(anchor, anchor, activeApartment ? APARTMENT_CARD_HEIGHT : LOCATION_CARD_HEIGHT)
      : null;

  return (
    <div className="map-grid-bg relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {points.apartments.map((a) => {
        const node = nodes.get(key("apartment", a.id));
        return node
          ? createPortal(
              <MapMark
                kind="apartment"
                label={a.label}
                seed={seedFromId(a.id)}
                ariaLabel={describeApartment(a)}
                hoverCapable={hoverCapable}
                onShow={() => showAt({ kind: "apartment", id: a.id }, [a.longitude, a.latitude])}
                onHide={card.hideSoon}
                onDismiss={card.hide}
                onOpen={() => router.push(`/apartments/${a.id}`)}
              />,
              node,
              key("apartment", a.id)
            )
          : null;
      })}
      {points.locations.map((l) => {
        const node = nodes.get(key("location", l.id));
        return node
          ? createPortal(
              <MapMark
                kind="location"
                label={l.label}
                seed={seedFromId(l.id)}
                ariaLabel={l.label}
                hoverCapable={hoverCapable}
                onShow={() => showAt({ kind: "location", id: l.id }, [l.longitude, l.latitude])}
                onHide={card.hideSoon}
                onDismiss={card.hide}
              />,
              node,
              key("location", l.id)
            )
          : null;
      })}
      {position && (
        <div
          className="absolute z-10"
          style={{ left: position.left, top: position.top }}
          onMouseEnter={card.cancelHide}
          onMouseLeave={card.hideSoon}
        >
          {activeApartment ? <ApartmentCard apartment={activeApartment} /> : activeLocation && <LocationCard location={activeLocation} />}
        </div>
      )}
    </div>
  );
}
