import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the dynamic Leaflet import so jsdom doesn't try to instantiate a
// real map. The dynamic-loaded module just renders a placeholder span we
// can assert against.
vi.mock("../apartments-overview-map-inner", () => ({
  default: ({
    apartments,
    locations,
  }: {
    apartments: { id: number }[];
    locations: { id: number }[];
  }) => (
    <div data-testid="leaflet-map">
      pins:{apartments.length}+{locations.length}
    </div>
  ),
}));

import { ApartmentsOverviewMap } from "../apartments-overview-map";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ApartmentsOverviewMap", () => {
  it("starts collapsed when localStorage has no flag", () => {
    render(
      <ApartmentsOverviewMap apartments={[]} locations={[]} />
    );
    expect(
      screen.getByRole("button", { name: /Map overview/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("leaflet-map")).toBeNull();
  });

  it("starts open when localStorage flag is set to '1'", () => {
    localStorage.setItem("flatpare-overview-map-open", "1");
    render(
      <ApartmentsOverviewMap
        apartments={[
          { id: 1, name: "x", shortCode: "X-1", latitude: 47, longitude: 8 },
        ]}
        locations={[]}
      />
    );
    expect(
      screen.getByRole("button", { name: /Map overview/i })
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("toggling open persists to localStorage and renders the map when pins exist", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ updated: 0 }), { status: 200 })
    );
    const user = userEvent.setup();
    render(
      <ApartmentsOverviewMap
        apartments={[
          { id: 1, name: "x", shortCode: "X-1", latitude: 47, longitude: 8 },
        ]}
        locations={[]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(localStorage.getItem("flatpare-overview-map-open")).toBe("1");
    expect(await screen.findByTestId("leaflet-map")).toHaveTextContent(
      "pins:1+0"
    );
  });

  it("renders 'No geocoded apartments' empty state when open with zero pins", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const user = userEvent.setup();
    render(
      <ApartmentsOverviewMap
        apartments={[{ id: 1, name: "x", shortCode: null, latitude: null, longitude: null }]}
        locations={[{ id: 2, label: "Y", latitude: null, longitude: null }]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(
      await screen.findByText(/No geocoded apartments/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("leaflet-map")).toBeNull();
  });

  it("triggers /api/geocode/backfill exactly once when first opened", async () => {
    const onBackfillComplete = vi.fn();
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ updated: 2 }), { status: 200 })
      );
    const user = userEvent.setup();
    render(
      <ApartmentsOverviewMap
        apartments={[
          { id: 1, name: "x", shortCode: "X-1", latitude: 47, longitude: 8 },
        ]}
        locations={[]}
        onBackfillComplete={onBackfillComplete}
      />
    );
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    await waitFor(() => {
      expect(onBackfillComplete).toHaveBeenCalledTimes(1);
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/geocode/backfill",
      expect.objectContaining({ method: "POST" })
    );

    // Closing and re-opening should not refire the backfill.
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(onBackfillComplete).toHaveBeenCalledTimes(1);
  });

  it("silently swallows a fetch failure on backfill (best-effort)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("offline"));
    const user = userEvent.setup();
    const onBackfillComplete = vi.fn();
    render(
      <ApartmentsOverviewMap
        apartments={[
          { id: 1, name: "x", shortCode: "X-1", latitude: 47, longitude: 8 },
        ]}
        locations={[]}
        onBackfillComplete={onBackfillComplete}
      />
    );
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    // Wait long enough for the effect's microtasks to settle.
    await waitFor(() => {
      expect(localStorage.getItem("flatpare-overview-map-open")).toBe("1");
    });
    expect(onBackfillComplete).not.toHaveBeenCalled();
  });
});
