import { envelopeAad, open, seal, type Envelope } from "@/lib/crypto";
import type { ZodType } from "zod";
import { apartmentSchema, locationSchema, ratingSchema } from "./schemas";
import type { Apartment, Location, Rating } from "./types";

// One AAD per table so a ciphertext sealed as a rating can never be
// presented as an apartment, and per row so it can never move between rows.
const TABLE = {
  apartments: "apartments",
  ratings: "ratings",
  locations: "locations",
} as const;

function ratingRowId(apartmentId: string, userId: string): string {
  return `${apartmentId}:${userId}`;
}

// A row that fails to decrypt or to validate is "corrupt": the caller gets
// null and shows a placeholder rather than crashing the whole household.
async function openRow<T>(
  key: CryptoKey | null,
  envelope: Envelope,
  aad: string,
  schema: ZodType<T>
): Promise<T | null> {
  try {
    // A v0 (plaintext) envelope is only genuine when the caller has no key,
    // i.e. encryption is actually off. When a key is present, a v0 envelope
    // can only mean a compromised/malicious host serving unauthenticated
    // plaintext in place of a real ciphertext row — reject it the same as a
    // decrypt failure rather than rendering it as authentic. The AAD binding
    // that protects v1 rows never runs for v0, so this check is the only
    // thing standing between a forged row and the UI.
    if (key !== null && envelope.v === 0) return null;
    const value = await open(key, envelope, aad);
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function sealApartment(
  key: CryptoKey | null,
  householdId: number,
  id: string,
  data: Apartment
): Promise<Envelope> {
  return seal(key, data, envelopeAad(householdId, TABLE.apartments, id));
}

export function openApartment(
  key: CryptoKey | null,
  householdId: number,
  id: string,
  envelope: Envelope
): Promise<Apartment | null> {
  return openRow(key, envelope, envelopeAad(householdId, TABLE.apartments, id), apartmentSchema);
}

export function sealRating(
  key: CryptoKey | null,
  householdId: number,
  apartmentId: string,
  userId: string,
  data: Rating
): Promise<Envelope> {
  return seal(
    key,
    data,
    envelopeAad(householdId, TABLE.ratings, ratingRowId(apartmentId, userId))
  );
}

export function openRating(
  key: CryptoKey | null,
  householdId: number,
  apartmentId: string,
  userId: string,
  envelope: Envelope
): Promise<Rating | null> {
  return openRow(
    key,
    envelope,
    envelopeAad(householdId, TABLE.ratings, ratingRowId(apartmentId, userId)),
    ratingSchema
  );
}

export function sealLocation(
  key: CryptoKey | null,
  householdId: number,
  id: string,
  data: Location
): Promise<Envelope> {
  return seal(key, data, envelopeAad(householdId, TABLE.locations, id));
}

export function openLocation(
  key: CryptoKey | null,
  householdId: number,
  id: string,
  envelope: Envelope
): Promise<Location | null> {
  return openRow(key, envelope, envelopeAad(householdId, TABLE.locations, id), locationSchema);
}
