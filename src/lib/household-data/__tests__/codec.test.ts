import { describe, it, expect } from "vitest";
import { generateDataKey } from "@/lib/crypto";
import {
  openApartment,
  openLocation,
  openRating,
  sealApartment,
  sealLocation,
  sealRating,
} from "../codec";
import { EMPTY_RATING, emptyApartment } from "../types";

describe("household-data codec", () => {
  it("round-trips an apartment under a key", async () => {
    const key = await generateDataKey();
    const data = { ...emptyApartment("Flat"), rentChf: 1800 };
    const env = await sealApartment(key, 1, "apt-1", data);
    expect(env.v).toBe(1);
    expect(await openApartment(key, 1, "apt-1", env)).toEqual(data);
  });

  it("round-trips as v0 when the key is null", async () => {
    const data = emptyApartment("Flat");
    const env = await sealApartment(null, 1, "apt-1", data);
    expect(env).toEqual({ v: 0, data });
    expect(await openApartment(null, 1, "apt-1", env)).toEqual(data);
  });

  it("returns null when the row id, household or table differ (AAD mismatch)", async () => {
    const key = await generateDataKey();
    const env = await sealApartment(key, 1, "apt-1", emptyApartment("Flat"));
    expect(await openApartment(key, 1, "apt-2", env)).toBeNull();
    expect(await openApartment(key, 2, "apt-1", env)).toBeNull();
    expect(await openLocation(key, 1, "apt-1", env)).toBeNull();
  });

  it("returns null when the plaintext fails the schema", async () => {
    const key = await generateDataKey();
    const env = await sealApartment(
      key, 1, "apt-1",
      { name: 42 } as unknown as ReturnType<typeof emptyApartment>
    );
    expect(await openApartment(key, 1, "apt-1", env)).toBeNull();
  });

  it("binds ratings to apartment and user", async () => {
    const key = await generateDataKey();
    const env = await sealRating(key, 1, "apt-1", "u1", { ...EMPTY_RATING, kitchen: 4 });
    expect(await openRating(key, 1, "apt-1", "u1", env)).toEqual({ ...EMPTY_RATING, kitchen: 4 });
    expect(await openRating(key, 1, "apt-1", "u2", env)).toBeNull();
  });

  it("round-trips a location", async () => {
    const key = await generateDataKey();
    const loc = { label: "Work", icon: "Briefcase", address: "X 1", latitude: 1, longitude: 2 };
    const env = await sealLocation(key, 1, "loc-1", loc);
    expect(await openLocation(key, 1, "loc-1", env)).toEqual(loc);
  });
});
