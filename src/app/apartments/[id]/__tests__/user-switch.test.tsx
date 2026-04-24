import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push, refresh }),
}));

import ApartmentDetailPage from "../page";

const APARTMENT_WITH_TWO_RATINGS = {
  id: 42,
  name: "Test Flat",
  address: null,
  sizeM2: null,
  numRooms: null,
  numBathrooms: null,
  numBalconies: null,
  hasWashingMachine: null,
  rentChf: null,
  distanceBikeMin: null,
  distanceTransitMin: null,
  pdfUrl: null,
  listingUrl: null,
  shortCode: "ABC-?B-?b-W?-?",
  ratings: [
    {
      id: 1,
      userName: "Alice",
      kitchen: 5,
      balconies: 5,
      location: 5,
      floorplan: 5,
      overallFeeling: 5,
      comment: "alice comment",
    },
    {
      id: 2,
      userName: "Bob",
      kitchen: 2,
      balconies: 2,
      location: 2,
      floorplan: 2,
      overallFeeling: 2,
      comment: "bob comment",
    },
  ],
};

let currentCookie = "flatpare-name=Alice";

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  currentCookie = "flatpare-name=Alice";

  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => currentCookie,
    set: () => {},
  });

  vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url === "/api/apartments") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }
    if (url.endsWith("/api/apartments/42")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(APARTMENT_WITH_TWO_RATINGS),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartment detail — user switch", () => {
  it("shows the current user's rating on mount", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Alice\)/)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText(/Comment/i) as HTMLTextAreaElement).value
    ).toBe("alice comment");
  });

  it("reloads the form for the new user when a user-change event fires", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Alice\)/)).toBeInTheDocument();
    });

    currentCookie = "flatpare-name=Bob";
    window.dispatchEvent(new Event("flatpare-user-changed"));

    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Bob\)/)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText(/Comment/i) as HTMLTextAreaElement).value
    ).toBe("bob comment");
  });

  it("reloads to an empty rating when the new user has none", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Alice\)/)).toBeInTheDocument();
    });

    currentCookie = "flatpare-name=Charlie";
    window.dispatchEvent(new Event("flatpare-user-changed"));

    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Charlie\)/)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText(/Comment/i) as HTMLTextAreaElement).value
    ).toBe("");
  });
});
