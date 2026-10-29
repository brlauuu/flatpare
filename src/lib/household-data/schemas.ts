import { z } from "zod";
import { isHttpUrl } from "./links";
import { CURRENCY_CODE, DEFAULT_RENT_CURRENCY } from "./rent";
import type { Apartment, Draft, Location, Rating } from "./types";

const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();
const stars = z.number().int().min(0).max(5);

export const distanceSchema = z.object({
  bikeMin: z.number().int().nullable(),
  transitMin: z.number().int().nullable(),
});

// `processed` and `processedAddress` (#413) are absent from envelopes
// written before them. Such an apartment was paid for when it was created,
// and every address change then was geocoded at once, so its coordinates —
// when it has any — belong to the address it holds now. `rentCurrency`
// (#427) is absent from envelopes written before it, when every rent was in
// francs.
export const apartmentSchema: z.ZodType<Apartment> = z.object({
  name: z.string(),
  address: nullableString,
  sizeM2: nullableNumber,
  numRooms: nullableNumber,
  numBathrooms: nullableNumber,
  numBalconies: nullableNumber,
  hasWashingMachine: z.boolean().nullable(),
  rentChf: nullableNumber,
  rentCurrency: z.string().regex(CURRENCY_CODE).nullable().optional(),
  listingUrl: nullableString,
  summary: nullableString,
  availableFrom: nullableString,
  shortCode: nullableString,
  rawExtractedData: z.unknown().nullable(),
  userEditedFields: z.array(z.string()),
  latitude: nullableNumber,
  longitude: nullableNumber,
  listingGone: z.boolean(),
  listingCheckedAt: nullableString,
  distances: z.record(z.string(), distanceSchema),
  pdf: z.object({ path: z.string(), iv: nullableString }).nullable(),
  processed: z.boolean().default(true),
  processedAddress: nullableString.optional(),
}).transform((a) => ({
  ...a,
  rentCurrency:
    a.rentCurrency !== undefined ? a.rentCurrency : a.rentChf !== null ? DEFAULT_RENT_CURRENCY : null,
  processedAddress:
    a.processedAddress !== undefined
      ? a.processedAddress
      : a.latitude !== null && a.longitude !== null
        ? a.address
        : null,
}));

export const ratingSchema: z.ZodType<Rating> = z.object({
  kitchen: stars,
  balconies: stars,
  location: stars,
  floorplan: stars,
  overallFeeling: stars,
  comment: z.string(),
});

export const locationSchema: z.ZodType<Location> = z.object({
  label: z.string().min(1),
  icon: z.string().min(1),
  address: z.string().min(1),
  latitude: nullableNumber,
  longitude: nullableNumber,
});

export const draftSchema: z.ZodType<Draft> = z.object({
  url: z.string().refine(isHttpUrl),
  title: z.string().nullable().default(null),
});
