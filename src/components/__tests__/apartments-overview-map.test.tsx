import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the dynamic Leaflet import so jsdom doesn't instantiate a real map.
vi.mock("../apartments-overview-map-inner", () => ({
  default: ({ apartments, locations }: { apartments: { id: string }[]; locations: { id: string }[] }) => (
    <div data-testid="leaflet-map">
      pins:{apartments.length}+{locations.length}
    </div>
  ),
}));

import { ApartmentsOverviewMap } from "../apartments-overview-map";

const APT = { id: "a1", name: "x", shortCode: "X-1", latitude: 47, longitude: 8 };
const LOC = { id: "l1", label: "Work", latitude: 47.1, longitude: 8.1 };

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ApartmentsOverviewMap", () => {
  it("starts collapsed when localStorage has no flag", () => {
    render(<ApartmentsOverviewMap apartments={[]} locations={[]} />);
    expect(screen.getByRole("button", { name: /Map overview/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("leaflet-map")).toBeNull();
  });

  it("starts open when localStorage flag is '1' and calls onOpen once", async () => {
    localStorage.setItem("flatpare-overview-map-open", "1");
    const onOpen = vi.fn();
    render(<ApartmentsOverviewMap apartments={[APT]} locations={[LOC]} onOpen={onOpen} />);
    expect(screen.getByRole("button", { name: /Map overview/i })).toHaveAttribute("aria-expanded", "true");
    // The Leaflet map is loaded via next/dynamic (React.lazy + Suspense), so
    // the mocked inner component resolves a tick after the initial render.
    expect(await screen.findByTestId("leaflet-map")).toHaveTextContent("pins:1+1");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("toggles open on click, persists the flag, and only counts geocoded pins", async () => {
    const user = userEvent.setup();
    render(
      <ApartmentsOverviewMap
        apartments={[APT, { id: "a2", name: "y", shortCode: null, latitude: null, longitude: null }]}
        locations={[]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(localStorage.getItem("flatpare-overview-map-open")).toBe("1");
    expect(screen.getByTestId("leaflet-map")).toHaveTextContent("pins:1+0");
    expect(screen.getByText(/1 apartments · 0 locations/)).toBeInTheDocument();
  });

  it("shows the empty state when nothing is geocoded", async () => {
    const user = userEvent.setup();
    render(<ApartmentsOverviewMap apartments={[]} locations={[]} />);
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(screen.getByText(/No geocoded apartments or locations yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("leaflet-map")).toBeNull();
  });

  it("calls onOpen on the first open only, not again after close/reopen", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ApartmentsOverviewMap apartments={[APT]} locations={[]} onOpen={onOpen} />);
    expect(onOpen).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: /Map overview/i });
    await user.click(toggle);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await user.click(toggle);
    await user.click(toggle);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not call fetch at all", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const user = userEvent.setup();
    render(<ApartmentsOverviewMap apartments={[APT]} locations={[]} onOpen={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
