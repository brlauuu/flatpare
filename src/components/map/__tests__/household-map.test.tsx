import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { makeApartmentView, makeLocationView } from "@/components/household-data/__tests__/fake-household-data";
import type { MapPoints } from "@/lib/map/points";

// jsdom has no WebGL: the inner map is replaced by a stub that reports what
// it was given and can simulate a failure.
const innerProps: { points?: MapPoints; highlightId?: string | null; source?: unknown; onError?: () => void } = {};
vi.mock("../household-map-inner", () => ({
  default: (props: { points: MapPoints; highlightId: string | null; onError: () => void }) => {
    Object.assign(innerProps, props);
    return (
      <div data-testid="inner-map">
        <button onClick={props.onError}>simulate failure</button>
      </div>
    );
  },
}));

import { HouseholdMap } from "../household-map";

afterEach(cleanup);

const placed = makeApartmentView({ id: "a1", shortCode: "BS-01", latitude: 47.56, longitude: 7.59 });
const unplaced = makeApartmentView({ id: "a2", shortCode: "BS-06" });

describe("HouseholdMap", () => {
  it("hands the inner map the placed points", async () => {
    render(<HouseholdMap apartments={[placed]} locations={[makeLocationView({ id: "l1", latitude: 47.5, longitude: 7.5 })]} />);
    await screen.findByTestId("inner-map");
    expect(innerProps.points?.apartments.map((a) => a.id)).toEqual(["a1"]);
    expect(innerProps.points?.locations.map((l) => l.id)).toEqual(["l1"]);
  });

  it("passes the highlighted apartment through, none by default (#384)", async () => {
    render(<HouseholdMap apartments={[placed]} locations={[]} highlightId="a1" />);
    await screen.findByTestId("inner-map");
    expect(innerProps.highlightId).toBe("a1");
    cleanup();
    render(<HouseholdMap apartments={[placed]} locations={[]} />);
    await screen.findByTestId("inner-map");
    expect(innerProps.highlightId).toBeNull();
  });

  it("says plainly when the local map file is missing, and draws no map (#339)", () => {
    render(<HouseholdMap apartments={[placed]} locations={[]} source={{ mode: "local", file: null, problem: "several" }} />);
    expect(screen.getByText("This server is set to use its own map data, but there is no map to show.")).toBeInTheDocument();
    expect(screen.getByText(/more than one \.pmtiles file/)).toBeInTheDocument();
    expect(screen.queryByTestId("inner-map")).not.toBeInTheDocument();
  });

  it("hands a local source to the map", async () => {
    const source = { mode: "local" as const, file: "z.pmtiles", bounds: [8, 47, 9, 48] as [number, number, number, number], center: [8.5, 47.5] as [number, number], zoom: 10 };
    render(<HouseholdMap apartments={[placed]} locations={[]} source={source} />);
    await screen.findByTestId("inner-map");
    expect(innerProps.source).toEqual(source);
  });

  it("lists apartments that are not on the map yet, as links", async () => {
    render(<HouseholdMap apartments={[placed, unplaced]} locations={[]} />);
    expect(await screen.findByText(/1 apartment isn't on the map yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "BS-06" })).toHaveAttribute("href", "/apartments/a2");
  });

  it("says so when nothing can be placed", async () => {
    render(<HouseholdMap apartments={[unplaced]} locations={[]} />);
    expect(await screen.findByText(/Nothing to show yet/)).toBeInTheDocument();
  });

  it("links to Upload when the household has no apartments", async () => {
    render(<HouseholdMap apartments={[]} locations={[]} />);
    expect(await screen.findByRole("link", { name: /Upload/ })).toHaveAttribute("href", "/apartments/new");
  });

  it("falls back to a list of apartments when the map cannot load", async () => {
    render(<HouseholdMap apartments={[placed, unplaced]} locations={[]} />);
    fireEvent.click(await screen.findByText("simulate failure"));
    expect(await screen.findByText(/The map couldn't load/)).toBeInTheDocument();
    expect(screen.queryByTestId("inner-map")).toBeNull();
    expect(screen.getByRole("link", { name: "BS-01" })).toHaveAttribute("href", "/apartments/a1");
    expect(screen.getAllByRole("link", { name: "BS-06" })[0]).toHaveAttribute("href", "/apartments/a2");
  });
});
