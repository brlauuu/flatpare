import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
  makeLocationView,
} from "@/components/household-data/__tests__/fake-household-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));

import ComparePage from "../page";
import { downloadPdf } from "@/components/household-data/pdf-files";

const PDF = { path: "/api/pdf/households/7/a1.pdf.enc", iv: "AAAA" };
const WORK = makeLocationView({ id: "loc-1", label: "Work", icon: "Briefcase", address: "Zurich HQ" });

const APARTMENTS = [
  makeApartmentView({
    id: "a1",
    name: "Sonnenweg 3",
    sizeM2: 60,
    numRooms: 2.5,
    numBathrooms: 1,
    numBalconies: 1,
    rentChf: 2200,
    distances: { "loc-1": { bikeMin: 12, transitMin: 25 } },
    shortCode: "ABC-2.5B-WY-4057",
    createdAt: "2026-01-15T10:00:00Z",
    pdf: PDF,
    listingUrl: null,
  }),
  makeApartmentView({
    id: "a2",
    name: "Bergstrasse 12",
    sizeM2: 45,
    numRooms: 2,
    numBathrooms: 1,
    numBalconies: 0,
    rentChf: 1800,
    distances: { "loc-1": { bikeMin: 8, transitMin: 15 } },
    shortCode: "DEF-2B-W-4058",
    createdAt: "2026-03-20T10:00:00Z",
    pdf: null,
    listingUrl: "https://example.com/bergstrasse-listing",
  }),
  makeApartmentView({
    id: "a3",
    name: "Seeblick 7",
    sizeM2: 80,
    numRooms: 3.5,
    numBathrooms: 2,
    numBalconies: 2,
    rentChf: null,
    distances: { "loc-1": { bikeMin: 18, transitMin: 30 } },
    shortCode: "GHI-3.5B-WY-4059",
    createdAt: "2026-02-10T10:00:00Z",
    pdf: null,
    listingUrl: null,
  }),
];

function columnOrder(): string[] {
  return Array.from(document.querySelectorAll("thead th .font-semibold")).map(
    (el) => el.textContent ?? ""
  );
}

function setup() {
  return renderWithHouseholdData(<ComparePage />, { apartments: APARTMENTS, locations: [WORK] });
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Compare page — sort", () => {
  it("defaults to rentChf ascending (cheapest first, null last)", () => {
    setup();
    expect(columnOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  it("reads a location sort field from localStorage on mount", () => {
    localStorage.setItem("flatpare-compare-sort-field", "bikeTo:loc-1");
    localStorage.setItem("flatpare-compare-sort-direction", "desc");
    setup();
    expect(columnOrder()).toEqual(["Seeblick 7", "Sonnenweg 3", "Bergstrasse 12"]);
  });

  it("changing the sort field re-orders columns and persists to localStorage", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox", { name: /Sort by/i }));
    await user.click(screen.getByRole("option", { name: "Bathrooms" }));
    await waitFor(() => {
      expect(columnOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
    });
    expect(localStorage.getItem("flatpare-compare-sort-field")).toBe("numBathrooms");
  });

  it("direction toggle flips column order and persists", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /Ascending/i }));
    await waitFor(() => {
      expect(columnOrder()).toEqual(["Sonnenweg 3", "Bergstrasse 12", "Seeblick 7"]);
    });
    expect(localStorage.getItem("flatpare-compare-sort-direction")).toBe("desc");
  });

  it("falls back to defaults when localStorage has invalid sort values", () => {
    localStorage.setItem("flatpare-compare-sort-field", "bogus");
    localStorage.setItem("flatpare-compare-sort-direction", "sideways");
    setup();
    expect(columnOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  it("hidden columns compose with sort order and Show all restores them", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /Hide Bergstrasse 12/i }));
    await waitFor(() => expect(columnOrder()).toEqual(["Sonnenweg 3", "Seeblick 7"]));
    await user.click(screen.getByRole("button", { name: /Show all \(1 hidden\)/i }));
    await waitFor(() =>
      expect(columnOrder()).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"])
    );
  });
});

describe("Compare page — column header links", () => {
  it("renders the apartment name as a link to its detail page in a new tab", () => {
    setup();
    const link = screen.getByRole("link", { name: "Sonnenweg 3" });
    expect(link).toHaveAttribute("href", "/apartments/a1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("View PDF decrypts the file and opens a blob: URL", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:pdf-1");
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const open = vi.fn();
    vi.stubGlobal("open", open);
    vi.mocked(downloadPdf).mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    setup();
    await userEvent.setup().click(screen.getByRole("button", { name: /View PDF for Sonnenweg 3/i }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("blob:pdf-1", "_blank", "noopener"));
    expect(downloadPdf).toHaveBeenCalledWith(null, 7, "a1", PDF);
  });

  it("shows an error when the PDF cannot be opened", async () => {
    vi.mocked(downloadPdf).mockRejectedValue(new Error("Could not decrypt file"));
    setup();
    await userEvent.setup().click(screen.getByRole("button", { name: /View PDF for Sonnenweg 3/i }));
    expect(await screen.findByText(/Couldn't open PDF/)).toBeInTheDocument();
    // The table is still there — the error is a banner, not a page replacement.
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
  });

  it("hides the PDF button when there is no pdf", () => {
    setup();
    expect(screen.queryByRole("button", { name: /View PDF for Bergstrasse 12/i })).toBeNull();
  });

  it("renders an Original listing icon link when listingUrl is present", () => {
    setup();
    const listingLink = screen.getByRole("link", { name: /Original listing for Bergstrasse 12/i });
    expect(listingLink).toHaveAttribute("href", "https://example.com/bergstrasse-listing");
    expect(listingLink).toHaveAttribute("target", "_blank");
  });

  it("hides the Original listing icon link when listingUrl is null", () => {
    setup();
    expect(screen.queryByRole("link", { name: /Original listing for Sonnenweg 3/i })).toBeNull();
  });

  it("renders a distance row per store location", () => {
    setup();
    expect(screen.getAllByTitle(/Bike \+ transit to Work/i).length).toBe(1);
    expect(screen.getByText(/12.*25 min/)).toBeInTheDocument();
  });

  it("clears a stale error banner once a later View PDF click succeeds", async () => {
    vi.mocked(downloadPdf).mockRejectedValueOnce(new Error("Could not decrypt file"));
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /View PDF for Sonnenweg 3/i }));
    expect(await screen.findByText(/Couldn't open PDF/)).toBeInTheDocument();

    const createObjectURL = vi.fn().mockReturnValue("blob:pdf-2");
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("open", vi.fn());
    vi.mocked(downloadPdf).mockResolvedValueOnce(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    await user.click(screen.getByRole("button", { name: /View PDF for Sonnenweg 3/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Couldn't open PDF/)).not.toBeInTheDocument();
    });
  });
});
