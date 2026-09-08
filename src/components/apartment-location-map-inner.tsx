"use client";

import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const PIN_ICON = L.divIcon({
  className: "flatpare-pin",
  html: `<svg viewBox="0 0 24 24" width="28" height="28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8z" fill="#2563eb" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="10" r="3" fill="white"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  tooltipAnchor: [0, -28],
});

export default function ApartmentLocationMapInner({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  return (
    <div className="h-[260px] w-full">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]} icon={PIN_ICON}>
          <Tooltip direction="top" offset={[0, -4]} permanent className="flatpare-marker-label">
            {label}
          </Tooltip>
        </Marker>
      </MapContainer>
    </div>
  );
}
