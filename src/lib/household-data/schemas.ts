import { z } from "zod";
import type { Apartment, Location, Rating } from "./types";

const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();
const stars = z.number().int().min(0).max(5);

export const distanceSchema = z.object({
  bikeMin: z.number().int().nullable(),
  transitMin: z.number().int().nullable(),
});

export const apartmentSchema: z.ZodType<Apartment> = z.object({
  name: z.string(),
  address: nullableString,
  sizeM2: nullableNumber,
  numRooms: nullableNumber,
  numBathrooms: nullableNumber,
  numBalconies: nullableNumber,
  hasWashingMachine: z.boolean().nullable(),
  rentChf: nullableNumber,
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
});

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
