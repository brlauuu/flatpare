import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import {
  DEFAULT_STATION_ADDRESS,
  getStationAddress,
  setStationAddress,
} from "@/lib/app-settings";

beforeEach(async () => {
  await db.delete(appSettings);
});

afterEach(async () => {
  await db.delete(appSettings);
});

describe("app-settings", () => {
  it("returns the default when the table has no row for station_address", async () => {
    const value = await getStationAddress();
    expect(value).toBe(DEFAULT_STATION_ADDRESS);
  });

  it("returns the stored value after setStationAddress", async () => {
    await setStationAddress("Zürich HB, Switzerland");
    const value = await getStationAddress();
    expect(value).toBe("Zürich HB, Switzerland");
  });

  it("upserts — calling setStationAddress twice keeps a single row", async () => {
    await setStationAddress("Zürich HB, Switzerland");
    await setStationAddress("Bern, Schweiz");
    const value = await getStationAddress();
    expect(value).toBe("Bern, Schweiz");
    const rows = await db.select().from(appSettings);
    expect(rows.length).toBe(1);
  });

  it("throws when given an empty or whitespace-only string", async () => {
    await expect(setStationAddress("")).rejects.toThrow();
    await expect(setStationAddress("   ")).rejects.toThrow();
  });
});
