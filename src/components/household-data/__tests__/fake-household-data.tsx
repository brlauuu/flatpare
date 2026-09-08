import { render } from "@testing-library/react";
import { vi } from "vitest";
import { emptyApartment, type ApartmentView, type LocationView } from "@/lib/household-data/types";
import { HouseholdDataContext, type HouseholdDataContextValue } from "../household-data-provider";

// Builders and a renderer for page/component tests: render under a
// hand-built context value instead of the real provider + fetch.

export function makeApartmentView(over: Partial<ApartmentView> & { id: string }): ApartmentView {
  return {
    ...emptyApartment(over.name ?? `Apartment ${over.id}`),
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ratings: [],
    avgKitchen: null,
    avgBalconies: null,
    avgLocation: null,
    avgFloorplan: null,
    avgOverall: null,
    myRating: null,
    ...over,
  };
}

export function makeLocationView(over: Partial<LocationView> & { id: string }): LocationView {
  return {
    label: `Location ${over.id}`,
    icon: "Briefcase",
    address: "Somewhere 1",
    latitude: null,
    longitude: null,
    sortOrder: 0,
    ...over,
  };
}

export function makeHouseholdData(over: Partial<HouseholdDataContextValue> = {}): HouseholdDataContextValue {
  return {
    identity: { userId: "u-me", householdId: 7, userName: "Me" },
    // Unlimited by default so every existing page test keeps its current
    // behaviour: a test that cares about a cap passes `limits` explicitly.
    limits: { maxMembers: null, maxApartments: null },
    dataKey: null,
    status: "ready",
    error: null,
    apartments: [],
    locations: [],
    enrichmentError: {},
    reload: vi.fn(async () => {}),
    createApartment: vi.fn(async (id: string) => makeApartmentView({ id })),
    updateApartment: vi.fn(async (id: string) => makeApartmentView({ id })),
    deleteApartment: vi.fn(async () => {}),
    rateApartment: vi.fn(async () => {}),
    retryEnrichment: vi.fn(async () => {}),
    createLocation: vi.fn(async (id: string) => makeLocationView({ id })),
    updateLocation: vi.fn(async (id: string) => makeLocationView({ id })),
    deleteLocation: vi.fn(async () => {}),
    moveLocation: vi.fn(async () => {}),
    runMaintenance: vi.fn(async () => ({ updated: 0, skipped: 0, failed: [] })),
    ...over,
  };
}

export function renderWithHouseholdData(
  ui: React.ReactElement,
  over: Partial<HouseholdDataContextValue> = {}
) {
  const value = makeHouseholdData(over);
  const result = render(<HouseholdDataContext.Provider value={value}>{ui}</HouseholdDataContext.Provider>);
  return { value, ...result };
}
