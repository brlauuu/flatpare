import type { Apartment } from "@/lib/household-data/types";

export const INFERABLE_FIELDS = [
  "name",
  "address",
  "sizeM2",
  "numRooms",
  "numBathrooms",
  "numBalconies",
  "hasWashingMachine",
  "rentChf",
  "listingUrl",
  "summary",
  "availableFrom",
] as const;

export type InferableField = (typeof INFERABLE_FIELDS)[number];
export type InferableFields = Pick<Apartment, InferableField>;

export function diffInferableFields(
  current: Partial<InferableFields>,
  incoming: Partial<InferableFields>
): InferableField[] {
  const changed: InferableField[] = [];
  for (const field of INFERABLE_FIELDS) {
    if (current[field] !== incoming[field]) changed.push(field);
  }
  return changed;
}

// A user edit: apply the fields and remember which inferable ones changed,
// so a later reprocess leaves them alone.
export function mergeUserEdit(current: Apartment, incoming: InferableFields): Apartment {
  const next: Apartment = { ...current, ...incoming };
  const changed = diffInferableFields(current, next);
  return {
    ...next,
    userEditedFields: Array.from(new Set([...current.userEditedFields, ...changed])),
  };
}

// A reprocess: refresh every inferable field the user has not edited from a
// fresh extraction, and keep the raw extraction for reference.
export function applyExtraction(
  current: Apartment,
  incoming: InferableFields,
  raw: Record<string, unknown>
): Apartment {
  const edited = new Set(current.userEditedFields);
  const next: Apartment = { ...current, rawExtractedData: raw };
  for (const field of INFERABLE_FIELDS) {
    if (edited.has(field)) continue;
    (next as Record<InferableField, unknown>)[field] = incoming[field];
  }
  return next;
}
