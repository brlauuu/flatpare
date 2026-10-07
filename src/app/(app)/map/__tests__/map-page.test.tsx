import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { HouseholdDataContext } from "@/components/household-data/household-data-provider";
import { makeApartmentView, renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";

vi.mock("../map-fonts", () => ({ mapFontVariables: "" }));
vi.mock("@/components/map/household-map-inner", () => ({ default: () => <div data-testid="inner-map" /> }));

import MapPage from "../page";

afterEach(cleanup);

const APTS = [makeApartmentView({ id: "a1", shortCode: "BS-01", latitude: 47.5, longitude: 7.6 })];

describe("Map page", () => {
  it("shows the heading and the map", async () => {
    renderWithHouseholdData(<MapPage />, { apartments: APTS });
    expect(screen.getByRole("heading", { name: "Map" })).toBeInTheDocument();
    expect(await screen.findByTestId("inner-map")).toBeInTheDocument();
  });

  it("looks up missing coordinates once, when the store is ready", async () => {
    const { value, rerender } = renderWithHouseholdData(<MapPage />, { apartments: APTS });
    await waitFor(() => expect(value.runMaintenance).toHaveBeenCalledWith("geocode"));
    rerender(
      <HouseholdDataContext.Provider value={value}>
        <MapPage />
      </HouseholdDataContext.Provider>
    );
    expect(value.runMaintenance).toHaveBeenCalledTimes(1);
  });

  it("does not look anything up while the store is loading", () => {
    const { value } = renderWithHouseholdData(<MapPage />, { status: "loading", apartments: [] });
    expect(screen.getByText("Loading map...")).toBeInTheDocument();
    expect(value.runMaintenance).not.toHaveBeenCalled();
  });

  it("shows the store error", () => {
    renderWithHouseholdData(<MapPage />, { status: "error", error: "Couldn't load household data", apartments: [] });
    expect(screen.getByText("Couldn't load household data")).toBeInTheDocument();
  });
});
