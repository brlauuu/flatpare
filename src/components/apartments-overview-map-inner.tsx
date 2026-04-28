"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface ApartmentPin {
  id: number;
  shortCode: string | null;
  name: string;
  latitude: number;
  longitude: number;
}

interface LocationPin {
  id: number;
  label: string;
  latitude: number;
  longitude: number;
}

interface Props {
  apartments: ApartmentPin[];
  locations: LocationPin[];
}

function makeIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "flatpare-pin",
    html: `<svg viewBox="0 0 24 24" width="28" height="28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="10" r="3" fill="white"/>
    </svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    tooltipAnchor: [0, -28],
  });
}

const APT_ICON = makeIcon("#2563eb");
const LOC_ICON = makeIcon("#dc2626");

function FitBounds({
  apartments,
  locations,
}: {
  apartments: ApartmentPin[];
  locations: LocationPin[];
}) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [
      ...apartments.map((a) => [a.latitude, a.longitude] as [number, number]),
      ...locations.map((l) => [l.latitude, l.longitude] as [number, number]),
    ];
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, apartments, locations]);
  return null;
}

export default function ApartmentsOverviewMapInner({
  apartments,
  locations,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const center = useMemo<[number, number]>(() => {
    const first = apartments[0] ?? locations[0];
    return first ? [first.latitude, first.longitude] : [47.3769, 8.5417];
  }, [apartments, locations]);

  return (
    <div ref={containerRef} className="h-[400px] w-full">
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {apartments.map((a) => (
          <Marker
            key={`apt-${a.id}`}
            position={[a.latitude, a.longitude]}
            icon={APT_ICON}
          >
            <Tooltip
              direction="top"
              offset={[0, -4]}
              permanent
              className="flatpare-marker-label"
            >
              {a.shortCode ?? a.name}
            </Tooltip>
          </Marker>
        ))}
        {locations.map((l) => (
          <Marker
            key={`loc-${l.id}`}
            position={[l.latitude, l.longitude]}
            icon={LOC_ICON}
          >
            <Tooltip
              direction="top"
              offset={[0, -4]}
              permanent
              className="flatpare-marker-label flatpare-marker-label-location"
            >
              {l.label}
            </Tooltip>
          </Marker>
        ))}
        <FitBounds apartments={apartments} locations={locations} />
      </MapContainer>
    </div>
  );
}
