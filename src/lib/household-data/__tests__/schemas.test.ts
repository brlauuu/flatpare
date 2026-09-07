import { describe, it, expect } from "vitest";
import { apartmentSchema, locationSchema, ratingSchema } from "../schemas";
import { EMPTY_RATING, emptyApartment } from "../types";

describe("household-data schemas", () => {
  it("accepts the empty apartment and rejects a missing distances map", () => {
    expect(apartmentSchema.safeParse(emptyApartment("Flat")).success).toBe(true);
    const { distances: _d, ...noDistances } = emptyApartment("Flat");
    expect(apartmentSchema.safeParse(noDistances).success).toBe(false);
  });

  it("accepts a fully populated apartment", () => {
    const full = {
      ...emptyApartment("Flat"),
      address: "Bahnhofstrasse 1, 8001 Zürich",
      sizeM2: 80.5,
      numRooms: 3.5,
      numBathrooms: 1,
      numBalconies: 1,
      hasWashingMachine: true,
      rentChf: 2500,
      listingUrl: "https://example.com/x",
      summary: "Nice",
      availableFrom: "2026-10-01",
      shortCode: "ABC-3.5B-1b-WY-8001",
      rawExtractedData: { anything: [1, 2, 3] },
      userEditedFields: ["name"],
      latitude: 47.37,
      longitude: 8.54,
      listingGone: true,
      listingCheckedAt: "2026-09-07T10:00:00.000Z",
      distances: { "loc-1": { bikeMin: 12, transitMin: null } },
      pdf: { path: "/api/pdf/households/1/x.pdf.enc", iv: "AAAA" },
    };
    expect(apartmentSchema.parse(full)).toEqual(full);
  });

  it("bounds ratings to 0..5 integers", () => {
    expect(ratingSchema.safeParse(EMPTY_RATING).success).toBe(true);
    expect(ratingSchema.safeParse({ ...EMPTY_RATING, kitchen: 6 }).success).toBe(false);
    expect(ratingSchema.safeParse({ ...EMPTY_RATING, kitchen: 2.5 }).success).toBe(false);
  });

  it("requires label, icon and address on a location", () => {
    expect(
      locationSchema.safeParse({ label: "Work", icon: "Briefcase", address: "X 1", latitude: null, longitude: null }).success
    ).toBe(true);
    expect(locationSchema.safeParse({ label: "Work", icon: "Briefcase" }).success).toBe(false);
  });
});
