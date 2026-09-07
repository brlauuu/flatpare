import { describe, it, expect } from "vitest";
import { planDistanceMaintenance, planGeocodeMaintenance, planListingMaintenance } from "../maintenance";
import { emptyApartment, type ApartmentView, type LocationView } from "../types";

const view = (id: string, over: Partial<ApartmentView> = {}): ApartmentView => ({
  ...emptyApartment(id), id, version: 1, createdAt: "", updatedAt: "", ratings: [],
  avgKitchen: null, avgBalconies: null, avgLocation: null, avgFloorplan: null, avgOverall: null, myRating: null,
  ...over,
});
const loc = (id: string, latitude: number | null = 1): LocationView => ({
  id, sortOrder: 0, label: id, icon: "Briefcase", address: "X", latitude, longitude: latitude,
});

describe("maintenance planners", () => {
  it("geocode: apartments with an address but no coordinates, never corrupt ones", () => {
    const plan = planGeocodeMaintenance([
      view("a", { address: "A" }),
      view("b", { address: "B", latitude: 1, longitude: 1 }),
      view("c"),
      view("d", { address: "D", corrupt: true }),
    ]);
    expect(plan.map((a) => a.id)).toEqual(["a"]);
  });

  it("distances: located apartments paired with the located locations they lack", () => {
    const plan = planDistanceMaintenance(
      [
        view("a", { address: "A", latitude: 1, longitude: 1, distances: { l1: { bikeMin: 1, transitMin: 1 } } }),
        view("b", { address: "B" }),
      ],
      [loc("l1"), loc("l2"), loc("l3", null)]
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].apartment.id).toBe("a");
    expect(plan[0].locations.map((l) => l.id)).toEqual(["l2"]);
  });

  it('distances "all": every located pair, including ones already present', () => {
    const plan = planDistanceMaintenance(
      [view("a", { address: "A", latitude: 1, longitude: 1, distances: { l1: { bikeMin: 1, transitMin: 1 } } })],
      [loc("l1"), loc("l2"), loc("l3", null)],
      "all"
    );
    expect(plan[0].locations.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("listings: apartments with a listing url", () => {
    const plan = planListingMaintenance([
      view("a", { listingUrl: "https://x" }),
      view("b"),
      view("c", { listingUrl: "https://y", corrupt: true }),
    ]);
    expect(plan.map((a) => a.id)).toEqual(["a"]);
  });
});
