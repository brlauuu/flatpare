import { hostOf } from "@/lib/household-data/links";
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
  "rentCurrency",
  "listingUrl",
  "summary",
  "availableFrom",
] as const;

export type InferableField = (typeof INFERABLE_FIELDS)[number];

// The rent and its currency (#427) move together: a PDF never puts its
// amount beside a currency a member chose, or the other way round. An edit
// of either keeps both, and an empty rent takes both from the PDF.
const RENT_PAIR: readonly InferableField[] = ["rentChf", "rentCurrency"];

function rentKept(current: Apartment): boolean {
  return RENT_PAIR.some((f) => current.userEditedFields.includes(f));
}
export type InferableFields = Pick<Apartment, InferableField>;

// An apartment made from a link is named after the site it is on (#413)
// until something better is known. That name is a placeholder, not a
// member's words: a PDF replaces it, and so does a reprocess, even where an
// earlier read marked it as kept (#412).
function hasPlaceholderName(current: Apartment): boolean {
  return current.listingUrl !== null && current.name === hostOf(current.listingUrl);
}

function namesBetter(current: Apartment, incoming: InferableFields): boolean {
  return hasPlaceholderName(current) && !isEmpty(incoming.name);
}

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
  const keepRent = rentKept(current);
  const renamed = namesBetter(current, incoming);
  for (const field of INFERABLE_FIELDS) {
    if (field === "name" && renamed) {
      next.name = incoming.name;
      continue;
    }
    if (RENT_PAIR.includes(field) ? keepRent : edited.has(field)) continue;
    (next as Record<InferableField, unknown>)[field] = incoming[field];
  }
  if (!renamed) return next;
  return { ...next, userEditedFields: next.userEditedFields.filter((f) => f !== "name") };
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

// A PDF read for an apartment someone already described (#413): it fills
// only the fields that are still empty and never overwrites what a member
// entered. The fields that were filled in are marked as edited, so a later
// reprocess leaves them alone too.
export function fillFromExtraction(
  current: Apartment,
  incoming: InferableFields,
  raw: Record<string, unknown>
): Apartment {
  const next: Apartment = { ...current, rawExtractedData: raw };
  const kept: InferableField[] = [];
  const rentEmpty = isEmpty(current.rentChf);
  const renamed = namesBetter(current, incoming);
  for (const field of INFERABLE_FIELDS) {
    const fill = field === "name" ? renamed || isEmpty(current.name) : isEmpty(current[field]);
    if (RENT_PAIR.includes(field) ? rentEmpty : fill) {
      (next as Record<InferableField, unknown>)[field] = incoming[field];
    } else {
      kept.push(field);
    }
  }
  const before = renamed ? current.userEditedFields.filter((f) => f !== "name") : current.userEditedFields;
  return { ...next, userEditedFields: Array.from(new Set([...before, ...kept])) };
}
