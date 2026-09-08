import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HouseholdDataContext } from "@/components/household-data/household-data-provider";
import {
  makeApartmentView,
  makeHouseholdData,
  renderWithHouseholdData,
} from "@/components/household-data/__tests__/fake-household-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// The overview map pulls Leaflet through next/dynamic; stub the inner map.
vi.mock("@/components/apartments-overview-map-inner", () => ({
  default: () => <div data-testid="leaflet-map" />,
}));

import ApartmentsPage from "../page";

const APARTMENTS = [
  makeApartmentView({
    id: "a1",
    name: "Sonnenweg 3",
    address: "Sonnenweg 3, 8001 Zürich",
    sizeM2: 60,
    numRooms: 2.5,
    rentChf: 2200,
    shortCode: "ABC-2.5B-WY-4057",
    createdAt: "2026-01-15T10:00:00Z",
  }),
  makeApartmentView({
    id: "a2",
    name: "Bergstrasse 12",
    address: "Bergstrasse 12, 8032 Zürich",
    sizeM2: 45,
    numRooms: 2,
    rentChf: 1800,
    shortCode: "DEF-2B-W-4058",
    avgOverall: 3.5,
    myRating: 4,
    createdAt: "2026-03-20T10:00:00Z",
  }),
  makeApartmentView({
    id: "a3",
    name: "Seeblick 7",
    address: null,
    sizeM2: 80,
    numRooms: 3.5,
    rentChf: null,
    shortCode: "GHI-3.5B-WY-4059",
    avgOverall: 4.5,
    createdAt: "2026-02-10T10:00:00Z",
  }),
];

function renderPage(over: Parameters<typeof renderWithHouseholdData>[1] = {}) {
  return renderWithHouseholdData(<ApartmentsPage />, { apartments: APARTMENTS, ...over });
}

function headingOrder(): (string | null)[] {
  return Array.from(document.querySelectorAll("h3")).map((el) => el.textContent);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Apartments page — store states", () => {
  it("shows the loading state while the store loads", () => {
    renderPage({ status: "loading", apartments: [] });
    expect(screen.getByText("Loading apartments...")).toBeInTheDocument();
  });

  it("shows the store error", () => {
    renderPage({ status: "error", error: "Couldn't load household data", apartments: [] });
    expect(screen.getByText("Couldn't load household data")).toBeInTheDocument();
  });

  it("shows the empty state with an upload link", () => {
    renderPage({ apartments: [] });
    expect(screen.getByText("No apartments yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload your first listing/i })).toHaveAttribute("href", "/apartments/new");
  });

  it("runs the listing maintenance pass exactly once on mount", async () => {
    const { value, rerender } = renderPage();
    await waitFor(() => expect(value.runMaintenance).toHaveBeenCalledWith("listings"));
    // rerender must re-supply the fake context: RTL's rerender replaces the
    // whole tree, it doesn't remember the provider renderWithHouseholdData
    // wrapped around the first render.
    rerender(
      <HouseholdDataContext.Provider value={value}>
        <ApartmentsPage />
      </HouseholdDataContext.Provider>
    );
    expect(value.runMaintenance).toHaveBeenCalledTimes(1);
  });

  it("runs the geocode pass the first time the map opens", async () => {
    const user = userEvent.setup();
    const { value } = renderPage();
    await user.click(screen.getByRole("button", { name: /Map overview/i }));
    expect(value.runMaintenance).toHaveBeenCalledWith("geocode");
  });

  it("offers a retry for a failed enrichment", async () => {
    const user = userEvent.setup();
    const { value } = renderPage({ enrichmentError: { a1: "Geocoding failed" } });
    expect(screen.getByText(/Enrichment failed for Sonnenweg 3/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(value.retryEnrichment).toHaveBeenCalledWith("a1");
  });
});

describe("Apartments page — view toggle", () => {
  it("renders grid view by default", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("[data-view='grid']")).not.toBeNull();
  });

  it("switches to list view and persists it", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(document.querySelector("[data-view='list']")).not.toBeNull();
    expect(localStorage.getItem("flatpare-apartments-view")).toBe("list");
  });

  it("restores list view from localStorage", () => {
    localStorage.setItem("flatpare-apartments-view", "list");
    renderPage();
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Apartments page — sort", () => {
  it("defaults to newest first (createdAt desc) when no preference is stored", () => {
    renderPage();
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });

  it("applies a stored sort preference", () => {
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    renderPage();
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  it("falls back to defaults on invalid stored values", () => {
    localStorage.setItem("flatpare-apartments-sort-field", "bogus");
    localStorage.setItem("flatpare-apartments-sort-direction", "sideways");
    renderPage();
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });

  it("changes the sort field via the select and persists it", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("combobox", { name: "Sort by" }));
    await user.click(await screen.findByRole("option", { name: "Price" }));
    // rentChf desc: 2200, 1800, null last
    expect(headingOrder()).toEqual(["Sonnenweg 3", "Bergstrasse 12", "Seeblick 7"]);
    expect(localStorage.getItem("flatpare-apartments-sort-field")).toBe("rentChf");
  });

  it("toggles direction and persists it", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Descending/i }));
    expect(headingOrder()).toEqual(["Sonnenweg 3", "Seeblick 7", "Bergstrasse 12"]);
    expect(localStorage.getItem("flatpare-apartments-sort-direction")).toBe("asc");
  });

  it("renders exactly 6 sort field options with no locations", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("combobox", { name: "Sort by" }));
    expect(await screen.findAllByRole("option")).toHaveLength(6);
  });
});

describe("Apartments page — search", () => {
  it("renders an empty search input", () => {
    renderPage();
    expect(screen.getByRole("textbox", { name: "Search apartments" })).toHaveValue("");
  });

  it("filters by name", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "berg");
    expect(headingOrder()).toEqual(["Bergstrasse 12"]);
  });

  it("filters by short code", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "ghi-3.5");
    expect(headingOrder()).toEqual(["Seeblick 7"]);
  });

  it("filters by address", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "8001");
    expect(headingOrder()).toEqual(["Sonnenweg 3"]);
  });

  it("does not match a null address against the literal 'null'", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "null");
    expect(screen.getByText('No apartments match "null"')).toBeInTheDocument();
  });

  it("shows the empty-result state and clears it via 'Show all apartments'", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "zzz");
    expect(screen.getByText('No apartments match "zzz"')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all apartments" }));
    expect(headingOrder()).toHaveLength(3);
  });

  it("clears via the X button", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "berg");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("textbox", { name: "Search apartments" })).toHaveValue("");
    expect(headingOrder()).toHaveLength(3);
  });

  it("treats whitespace-only queries as empty", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "   ");
    expect(headingOrder()).toHaveLength(3);
  });

  it("composes with sort", async () => {
    const user = userEvent.setup();
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Search apartments" }), "zürich");
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3"]);
  });
});

describe("Apartments page — listing gone badge", () => {
  it("renders a Gone badge only for apartments with listingGone=true", () => {
    renderPage({
      apartments: [
        { ...APARTMENTS[0], listingGone: true },
        { ...APARTMENTS[1], listingGone: false },
        APARTMENTS[2],
      ],
    });
    expect(screen.getAllByText("Gone")).toHaveLength(1);
  });
});

describe("Apartments page — corrupt rows", () => {
  const CORRUPT = makeApartmentView({
    id: "a-corrupt",
    name: "Unreadable apartment",
    corrupt: true,
  });

  it("renders a corrupt row as a placeholder, not a normal card", () => {
    renderPage({ apartments: [...APARTMENTS, CORRUPT] });
    expect(
      screen.getByText("This apartment could not be decrypted")
    ).toBeInTheDocument();
    // Never rendered as an ordinary apartment card/heading.
    expect(headingOrder()).not.toContain("Unreadable apartment");
  });

  it("renders a corrupt row as a placeholder in list view too", () => {
    localStorage.setItem("flatpare-apartments-view", "list");
    renderPage({ apartments: [...APARTMENTS, CORRUPT] });
    expect(
      screen.getByText("This apartment could not be decrypted")
    ).toBeInTheDocument();
  });

  it("its delete button calls the store's deleteApartment", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const value = makeHouseholdData({ apartments: [...APARTMENTS, CORRUPT] });
    render(
      <HouseholdDataContext.Provider value={value}>
        <ApartmentsPage />
      </HouseholdDataContext.Provider>
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(value.deleteApartment).toHaveBeenCalledWith("a-corrupt");
    confirmSpy.mockRestore();
  });

  it("is excluded from search results", async () => {
    const user = userEvent.setup();
    renderPage({ apartments: [...APARTMENTS, CORRUPT] });
    await user.type(
      screen.getByRole("textbox", { name: "Search apartments" }),
      "Unreadable"
    );
    expect(
      screen.queryByText("This apartment could not be decrypted")
    ).not.toBeInTheDocument();
    expect(screen.getByText('No apartments match "Unreadable"')).toBeInTheDocument();
  });

  it("is excluded from sorting and does not shift readable rows' order", () => {
    renderPage({ apartments: [CORRUPT, ...APARTMENTS] });
    // The three readable apartments still sort by their own field, unaffected
    // by the corrupt row's position in the underlying array.
    expect(headingOrder()).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });
});
