import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ComparePage from "../page";

const APT = {
  id: 1,
  name: "Apt A",
  address: null,
  sizeM2: 50,
  numRooms: 2,
  numBathrooms: 1,
  numBalconies: 1,
  hasWashingMachine: null,
  rentChf: 2000,
  distances: [],
  pdfUrl: null,
  listingUrl: null,
  shortCode: "A-2-W-100",
  createdAt: "2026-01-01T00:00:00Z",
  ratings: [],
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Compare page — load + error states", () => {
  it("shows 'Loading comparison...' while the initial fetch is pending", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<ComparePage />);
    expect(screen.getByText(/Loading comparison/i)).toBeInTheDocument();
  });

  it("renders ErrorDisplay when initial GET /api/apartments fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/apartments") {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Server Error",
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ error: "boom" }),
          text: () => Promise.resolve('{"error":"boom"}'),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }) as typeof fetch);

    render(<ComparePage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't load comparison data/i)
      ).toBeInTheDocument();
    });
  });

  it("renders ErrorDisplay when a per-apartment GET fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/apartments") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 1 }]),
        } as Response);
      }
      if (url === "/api/locations") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      }
      if (url.endsWith("/api/apartments/1")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Server Error",
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ error: "boom" }),
          text: () => Promise.resolve('{"error":"boom"}'),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);
    }) as typeof fetch);

    render(<ComparePage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't load comparison data/i)
      ).toBeInTheDocument();
    });
  });

  it("renders ErrorDisplay when fetch throws (network failure)", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() => {
      throw new TypeError("Failed to fetch");
    });
    render(<ComparePage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't load comparison data/i)
      ).toBeInTheDocument();
    });
  });

  it("renders the empty state when no apartments are returned", async () => {
    vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/apartments") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }) as typeof fetch);

    render(<ComparePage />);
    await waitFor(() => {
      expect(
        screen.getByText(/No apartments to compare yet/i)
      ).toBeInTheDocument();
    });
  });

  it("shows the 'Show all (N hidden)' button after hiding a column", async () => {
    vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/apartments") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 1 }, { id: 2 }]),
        } as Response);
      }
      if (url === "/api/locations") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      }
      const m = url.match(/\/api\/apartments\/(\d+)$/);
      if (m) {
        const id = Number(m[1]);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ ...APT, id, name: `Apt ${id}` }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);
    }) as typeof fetch);

    const user = userEvent.setup();
    render(<ComparePage />);
    await waitFor(() => {
      expect(screen.getByText("Apt 1")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Hide Apt 2/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Show all \(1 hidden\)/i })
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Apt 2")).not.toBeInTheDocument();

    // Clicking it brings the column back.
    await user.click(
      screen.getByRole("button", { name: /Show all \(1 hidden\)/i })
    );
    await waitFor(() => {
      expect(screen.getByText("Apt 2")).toBeInTheDocument();
    });
  });
});
