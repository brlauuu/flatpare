import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ApartmentsPage from "../page";

// Alice has rated this apartment; Bob hasn't. Switching from Alice to Bob
// must flip the "Rated" badge to "Not yet rated".
const ALICE_VIEW = [
  {
    id: 1,
    name: "Sonnenweg 3",
    address: "Sonnenweg 3, 8001 Zürich",
    sizeM2: 60,
    numRooms: 2.5,
    rentChf: 2200,
    shortCode: "ABC-2.5B-WY-4057",
    avgOverall: "4.0",
    myRating: 5,
    createdAt: "2026-01-15T10:00:00Z",
  },
];

const BOB_VIEW = [
  {
    ...ALICE_VIEW[0],
    myRating: null,
  },
];

let currentApartments: typeof ALICE_VIEW = ALICE_VIEW;

beforeEach(() => {
  localStorage.clear();
  currentApartments = ALICE_VIEW;
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url === "/api/locations") {
      return { ok: true, json: () => Promise.resolve([]) } as Response;
    }
    if (url.includes("/api/apartments/check-listings")) {
      return { ok: true, json: () => Promise.resolve({}) } as Response;
    }
    return {
      ok: true,
      json: () => Promise.resolve(currentApartments),
    } as Response;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartments list — user switch", () => {
  it("re-fetches and updates the per-user 'Rated' badge when the user changes", async () => {
    render(<ApartmentsPage />);

    // Initial load: Alice has rated this apartment.
    await waitFor(() => {
      expect(screen.getByText("Rated")).toBeInTheDocument();
    });
    expect(screen.queryByText("Not yet rated")).toBeNull();

    // Switch to Bob — backend now returns the same apartment with no rating.
    currentApartments = BOB_VIEW as unknown as typeof ALICE_VIEW;
    window.dispatchEvent(new Event("flatpare-user-changed"));

    await waitFor(() => {
      expect(screen.getByText("Not yet rated")).toBeInTheDocument();
    });
    expect(screen.queryByText("Rated")).toBeNull();
  });
});
