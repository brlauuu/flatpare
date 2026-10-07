import type { ApartmentView, LocationView } from "@/lib/household-data/types";
import { seedFromId } from "./marks";

// What the map draws, derived from the store's views (#330). Pure, so the
// rules — corrupt rows never shown, rows without coordinates listed rather
// than dropped — are tested without a map.

export interface ApartmentPoint {
  id: string;
  label: string;
  name: string;
  latitude: number;
  longitude: number;
  rentChf: number | null;
  sizeM2: number | null;
  numRooms: number | null;
  avgOverall: number | null;
}

export interface LocationPoint {
  id: string;
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

export interface MissingApartment {
  id: string;
  label: string;
}

export interface MapPoints {
  apartments: ApartmentPoint[];
  locations: LocationPoint[];
  missing: MissingApartment[];
}

const MAX_LABEL = 20;

function markLabel(apt: ApartmentView): string {
  if (apt.shortCode) return apt.shortCode;
  return apt.name.length > MAX_LABEL ? `${apt.name.slice(0, MAX_LABEL - 1)}…` : apt.name;
}

export function toMapPoints(apartments: ApartmentView[], locations: LocationView[]): MapPoints {
  const result: MapPoints = { apartments: [], locations: [], missing: [] };
  for (const apt of apartments) {
    if (apt.corrupt) continue;
    const label = markLabel(apt);
    if (apt.latitude === null || apt.longitude === null) {
      result.missing.push({ id: apt.id, label });
      continue;
    }
    result.apartments.push({
      id: apt.id,
      label,
      name: apt.name,
      latitude: apt.latitude,
      longitude: apt.longitude,
      rentChf: apt.rentChf,
      sizeM2: apt.sizeM2,
      numRooms: apt.numRooms,
      avgOverall: apt.avgOverall,
    });
  }
  for (const loc of locations) {
    if (loc.latitude === null || loc.longitude === null) continue;
    result.locations.push({ id: loc.id, label: loc.label, address: loc.address || null, latitude: loc.latitude, longitude: loc.longitude });
  }
  return result;
}

export function formatRent(chf: number): string {
  return `CHF ${chf.toLocaleString("de-CH")}`;
}

export function formatRooms(n: number): string {
  return n === 1 ? "1 room" : `${n} rooms`;
}

export function describeApartment(a: ApartmentPoint): string {
  const parts = [a.label];
  if (a.rentChf !== null) parts.push(formatRent(a.rentChf));
  if (a.sizeM2 !== null) parts.push(`${a.sizeM2} m²`);
  parts.push("opens apartment");
  return parts.join(", ");
}

// One entry per mark on the map, apartments first. The map component only
// has to place these; everything about a mark is decided here.
export interface MarkSpec {
  key: string;
  kind: "apartment" | "location";
  id: string;
  label: string;
  seed: number;
  ariaLabel: string;
  lngLat: [number, number];
  // Where the mark opens; places open nothing.
  href: string | null;
}

export function toMarks(points: MapPoints): MarkSpec[] {
  return [
    ...points.apartments.map((a) => ({
      key: `apartment:${a.id}`,
      kind: "apartment" as const,
      id: a.id,
      label: a.label,
      seed: seedFromId(a.id),
      ariaLabel: describeApartment(a),
      lngLat: [a.longitude, a.latitude] as [number, number],
      href: `/apartments/${a.id}`,
    })),
    ...points.locations.map((l) => ({
      key: `location:${l.id}`,
      kind: "location" as const,
      id: l.id,
      label: l.label,
      seed: seedFromId(l.id),
      ariaLabel: l.label,
      lngLat: [l.longitude, l.latitude] as [number, number],
      href: null,
    })),
  ];
}

export type ActivePoint = { kind: "apartment"; point: ApartmentPoint } | { kind: "location"; point: LocationPoint };

// The point whose card is open, or null when none is — or when a store
// refresh removed it while its card was showing.
export function findActive(points: MapPoints, active: { kind: "apartment" | "location"; id: string } | null): ActivePoint | null {
  if (active === null) return null;
  if (active.kind === "apartment") {
    const point = points.apartments.find((a) => a.id === active.id);
    return point ? { kind: "apartment", point } : null;
  }
  const point = points.locations.find((l) => l.id === active.id);
  return point ? { kind: "location", point } : null;
}
