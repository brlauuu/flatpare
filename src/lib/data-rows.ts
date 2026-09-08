import type { Envelope } from "@/lib/crypto";
import type { ApartmentRecord, LocationRecord, RatingRecord } from "@/lib/db/schema";
import type { ApartmentRow, LocationRow, RatingRow } from "@/lib/household-data/wire";

// Drizzle gives timestamps back as Date (or null before the default fires
// on an in-memory insert); the wire always carries ISO strings.
export function isoOf(date: Date | null): string {
  return (date ?? new Date()).toISOString();
}

// The envelope column is opaque text. It was validated by envelopeSchema
// on the way in, so parsing it back is safe; the server never looks inside.
export function parseStoredEnvelope(text: string): Envelope {
  return JSON.parse(text) as Envelope;
}

export function apartmentRow(r: ApartmentRecord): ApartmentRow {
  return {
    id: r.id,
    version: r.version,
    envelope: parseStoredEnvelope(r.envelope),
    createdAt: isoOf(r.createdAt),
    updatedAt: isoOf(r.updatedAt),
  };
}

export function ratingRow(r: RatingRecord & { userName: string | null }): RatingRow {
  return {
    apartmentId: r.apartmentId,
    userId: r.userId,
    userName: r.userName ?? "Member",
    envelope: parseStoredEnvelope(r.envelope),
    updatedAt: isoOf(r.updatedAt),
  };
}

export function locationRow(r: LocationRecord): LocationRow {
  return {
    id: r.id,
    sortOrder: r.sortOrder,
    envelope: parseStoredEnvelope(r.envelope),
    createdAt: isoOf(r.createdAt),
    updatedAt: isoOf(r.updatedAt),
  };
}
