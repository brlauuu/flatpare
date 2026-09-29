import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import {
  renderWithHouseholdData,
  makeApartmentView,
} from "@/components/household-data/__tests__/fake-household-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ComparePage from "../page";

afterEach(() => cleanup());

describe("Compare page — load + error states", () => {
  it("shows 'Loading comparison...' while the store is loading", () => {
    renderWithHouseholdData(<ComparePage />, { status: "loading", apartments: [] });
    expect(screen.getByText(/Loading comparison/i)).toBeInTheDocument();
  });

  it("renders ErrorDisplay when the store failed to load", () => {
    renderWithHouseholdData(<ComparePage />, {
      status: "error",
      error: "Failed to load household data",
      apartments: [],
    });
    expect(screen.getByText(/Couldn't load comparison data/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to load household data/)).toBeInTheDocument();
  });

  it("renders the empty state with an upload link when there are no apartments", () => {
    renderWithHouseholdData(<ComparePage />, { apartments: [] });
    expect(screen.getByText(/No apartments to compare yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload a listing/i })).toHaveAttribute(
      "href",
      "/apartments/new"
    );
  });

  it("leaves corrupt rows out of the table", () => {
    renderWithHouseholdData(<ComparePage />, {
      apartments: [
        makeApartmentView({ id: "a1", name: "Readable" }),
        makeApartmentView({ id: "a2", corrupt: true }),
      ],
    });
    expect(screen.getByText("Readable")).toBeInTheDocument();
    expect(document.querySelectorAll("thead th .font-semibold")).toHaveLength(1);
  });
});
