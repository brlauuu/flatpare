import type { ApartmentView, LocationView } from "@/lib/household-data/types";

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
