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

type InferableField = (typeof INFERABLE_FIELDS)[number];

export function diffInferableFields(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
): InferableField[] {
  const changed: InferableField[] = [];
  for (const field of INFERABLE_FIELDS) {
    if (current[field] !== incoming[field]) changed.push(field);
  }
  return changed;
}
