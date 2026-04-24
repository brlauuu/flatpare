import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ComparePage from "../page";

const DETAILS = [
  {
    id: 1,
    name: "Sonnenweg 3",
    address: null,
    sizeM2: 60,
    numRooms: 2.5,
    numBathrooms: 1,
    numBalconies: 1,
    hasWashingMachine: null,
    rentChf: 2200,
    distanceBikeMin: 12,
    distanceTransitMin: 25,
    shortCode: "ABC-2.5B-WY-4057",
    createdAt: "2026-01-15T10:00:00Z",
    pdfUrl: "https://example.com/sonnenweg.pdf",
    listingUrl: null,
    ratings: [],
  },
  {
    id: 2,
    name: "Bergstrasse 12",
    address: null,
    sizeM2: 45,
    numRooms: 2,
    numBathrooms: 1,
    numBalconies: 0,
    hasWashingMachine: null,
    rentChf: 1800,
    distanceBikeMin: 8,
    distanceTransitMin: 15,
    shortCode: "DEF-2B-W-4058",
    createdAt: "2026-03-20T10:00:00Z",
    pdfUrl: null,
    listingUrl: "https://example.com/bergstrasse-listing",
    ratings: [],
  },
  {
    id: 3,
    name: "Seeblick 7",
    address: null,
    sizeM2: 80,
    numRooms: 3.5,
    numBathrooms: 2,
    numBalconies: 2,
    hasWashingMachine: null,
    rentChf: null,
    distanceBikeMin: 18,
    distanceTransitMin: 30,
    shortCode: "GHI-3.5B-WY-4059",
    createdAt: "2026-02-10T10:00:00Z",
    pdfUrl: null,
    listingUrl: null,
    ratings: [],
  },
];

function columnOrder(): string[] {
  return Array.from(
    document.querySelectorAll("thead th .font-semibold")
  ).map((el) => el.textContent ?? "");
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url === "/api/apartments") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(DETAILS.map((d) => ({ id: d.id }))),
      } as Response);
    }
    const match = url.match(/\/api\/apartments\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      const detail = DETAILS.find((d) => d.id === id);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(detail),
      } as Response);
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Compare page — sort", () => {
  it("defaults to rentChf ascending (cheapest first, null last)", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(columnOrder()).toEqual([
      "Bergstrasse 12",
      "Sonnenweg 3",
      "Seeblick 7",
    ]);
  });

  it("reads sort field and direction from localStorage on mount", async () => {
    localStorage.setItem("flatpare-compare-sort-field", "distanceBikeMin");
    localStorage.setItem("flatpare-compare-sort-direction", "asc");
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(columnOrder()).toEqual([
      "Bergstrasse 12",
      "Sonnenweg 3",
      "Seeblick 7",
    ]);
  });

  it("changing the sort field re-orders columns and persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("combobox", { name: /Sort by/i }));
    await user.click(screen.getByRole("option", { name: "Bathrooms" }));
    await waitFor(() => {
      expect(columnOrder()).toEqual([
        "Bergstrasse 12",
        "Sonnenweg 3",
        "Seeblick 7",
      ]);
    });
    expect(localStorage.getItem("flatpare-compare-sort-field")).toBe(
      "numBathrooms"
    );
  });

  it("direction toggle flips column order and persists", async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(columnOrder()).toEqual([
      "Bergstrasse 12",
      "Sonnenweg 3",
      "Seeblick 7",
    ]);
    await user.click(screen.getByRole("button", { name: /Ascending/i }));
    await waitFor(() => {
      expect(columnOrder()).toEqual([
        "Sonnenweg 3",
        "Bergstrasse 12",
        "Seeblick 7",
      ]);
    });
    expect(localStorage.getItem("flatpare-compare-sort-direction")).toBe(
      "desc"
    );
  });

  it("falls back to defaults when localStorage has invalid sort values", async () => {
    localStorage.setItem("flatpare-compare-sort-field", "bogus");
    localStorage.setItem("flatpare-compare-sort-direction", "sideways");
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(columnOrder()).toEqual([
      "Bergstrasse 12",
      "Sonnenweg 3",
      "Seeblick 7",
    ]);
  });

  it("hidden columns compose with sort order", async () => {
    const user = userEvent.setup();
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Hide Bergstrasse 12/i }));
    await waitFor(() => {
      expect(columnOrder()).toEqual(["Sonnenweg 3", "Seeblick 7"]);
    });
  });
});

describe("Compare page — column header links", () => {
  it("renders the apartment name as a link to its detail page in a new tab", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: "Sonnenweg 3" });
    expect(link).toHaveAttribute("href", "/apartments/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a PDF icon link when pdfUrl is present", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    const pdfLink = screen.getByRole("link", {
      name: /View PDF for Sonnenweg 3/i,
    });
    expect(pdfLink).toHaveAttribute(
      "href",
      "https://example.com/sonnenweg.pdf"
    );
    expect(pdfLink).toHaveAttribute("target", "_blank");
  });

  it("hides the PDF icon link when pdfUrl is null", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: /View PDF for Bergstrasse 12/i })
    ).toBeNull();
  });

  it("renders an Original listing icon link when listingUrl is present", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    const listingLink = screen.getByRole("link", {
      name: /Original listing for Bergstrasse 12/i,
    });
    expect(listingLink).toHaveAttribute(
      "href",
      "https://example.com/bergstrasse-listing"
    );
    expect(listingLink).toHaveAttribute("target", "_blank");
  });

  it("hides the Original listing icon link when listingUrl is null", async () => {
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("link", { name: /Original listing for Seeblick 7/i })
    ).toBeNull();
  });
});
