import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyApartment, type LocationView } from "@/lib/household-data/types";

const { mockGeocode, mockDistance } = vi.hoisted(() => ({ mockGeocode: vi.fn(), mockDistance: vi.fn() }));
vi.mock("../process-client", () => ({ geocodeAddress: mockGeocode, distanceBetween: mockDistance }));

import { enrichApartment } from "../enrichment";

const loc = (id: string, latitude: number | null = 1): LocationView => ({
  id, sortOrder: 0, label: id, icon: "Briefcase", address: `${id} street`, latitude, longitude: latitude,
});

beforeEach(() => {
  mockGeocode.mockResolvedValue({ lat: 47.1, lng: 8.5, postcode: "8000" });
  mockDistance.mockImplementation(async (_from: string, to: string) => ({ bikeMin: to.length, transitMin: null }));
});

describe("enrichApartment", () => {
  it("geocodes, builds a unique short code and computes distances to located locations", async () => {
    const data = { ...emptyApartment("A"), address: "Somewhere 1", numRooms: 3.5, numBathrooms: 1, hasWashingMachine: true };
    const out = await enrichApartment(data, [loc("l1"), loc("l2", null)], new Set(), {
      geocode: true, shortCode: true, distances: true,
    });
    expect(out.latitude).toBe(47.1);
    expect(out.longitude).toBe(8.5);
    expect(out.shortCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{3}-3\.5B-1b-WY-8000$/);
    expect(out.distances).toEqual({ l1: { bikeMin: "l1 street".length, transitMin: null } });
    expect(mockDistance).toHaveBeenCalledWith("Somewhere 1", "l1 street");
  });

  it("re-rolls the short code letters until unique", async () => {
    const data = { ...emptyApartment("A"), address: "Somewhere 1", numRooms: 2, numBathrooms: 1, hasWashingMachine: false };
    const random = vi.fn().mockReturnValue(0);
    const first = await enrichApartment(data, [], new Set(), { geocode: true, shortCode: true, distances: false }, random);
    const second = await enrichApartment(data, [], new Set([first.shortCode as string]), { geocode: true, shortCode: true, distances: false }, random);
    // With a constant random source every re-roll produces the same letters,
    // so the collision persists and the last candidate is returned unchanged.
    expect(second.shortCode).toBe(first.shortCode);
  });

  it("keeps the old postcode when only the short-code inputs changed", async () => {
    const data = { ...emptyApartment("A"), address: "Somewhere 1", numRooms: 4, numBathrooms: 2, hasWashingMachine: null, shortCode: "ABC-3B-1b-WY-8001", latitude: 1, longitude: 1 };
    const out = await enrichApartment(data, [], new Set(), { geocode: false, shortCode: true, distances: false });
    expect(mockGeocode).not.toHaveBeenCalled();
    expect(out.shortCode).toMatch(/-4B-2b-W\?-8001$/);
  });

  it("leaves coordinates null when geocoding is unresolved and skips distances", async () => {
    mockGeocode.mockResolvedValue({ lat: null, lng: null, postcode: null, reason: "unresolved" });
    const data = { ...emptyApartment("A"), address: "Nowhere" };
    const out = await enrichApartment(data, [loc("l1")], new Set(), { geocode: true, shortCode: true, distances: true });
    expect(out.latitude).toBeNull();
    expect(out.distances).toEqual({});
    expect(out.shortCode).toMatch(/-\?B-\?b-W\?-\?$/);
    expect(mockDistance).not.toHaveBeenCalled();
  });

  it("fills only missing distances when the plan does not ask for all", async () => {
    const data = { ...emptyApartment("A"), address: "X", latitude: 1, longitude: 1, distances: { l1: { bikeMin: 99, transitMin: 99 } } };
    const out = await enrichApartment(data, [loc("l1"), loc("l2")], new Set(), { geocode: false, shortCode: false, distances: false });
    expect(out.distances.l1).toEqual({ bikeMin: 99, transitMin: 99 });
    expect(out.distances.l2).toEqual({ bikeMin: "l2 street".length, transitMin: null });
  });
});
