import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ApartmentsPage from "../page";

const APARTMENTS = [
  {
    id: 1,
    name: "Sonnenweg 3",
    address: null,
    sizeM2: 60,
    numRooms: 2.5,
    rentChf: 2200,
    shortCode: "ABC-2.5B-?b-WY-4057",
    avgOverall: null,
    myRating: null,
    createdAt: null,
  },
  {
    id: 2,
    name: "Bergstrasse 12",
    address: null,
    sizeM2: 45,
    numRooms: 2,
    rentChf: 1800,
    shortCode: "DEF-2B-?b-W?-4058",
    avgOverall: "3.5",
    myRating: 4,
    createdAt: null,
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(APARTMENTS),
  } as Response);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartments page — view toggle", () => {
  it("defaults to grid view when no preference is stored", async () => {
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    expect(document.querySelector('[data-view="grid"]')).toBeInTheDocument();
    expect(document.querySelector('[data-view="list"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: /Grid view/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the stored preference from localStorage on mount", async () => {
    localStorage.setItem("flatpare-apartments-view", "list");
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    expect(document.querySelector('[data-view="list"]')).toBeInTheDocument();
    expect(document.querySelector('[data-view="grid"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: /List view/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking the toggle switches the layout and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    // Default grid
    expect(document.querySelector('[data-view="grid"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /List view/ }));
    expect(document.querySelector('[data-view="list"]')).toBeInTheDocument();
    expect(localStorage.getItem("flatpare-apartments-view")).toBe("list");

    await user.click(screen.getByRole("button", { name: /Grid view/ }));
    expect(document.querySelector('[data-view="grid"]')).toBeInTheDocument();
    expect(localStorage.getItem("flatpare-apartments-view")).toBe("grid");
  });
});
