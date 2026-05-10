import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import ApartmentDetailPage from "../page";

const APT = {
  id: 42,
  name: "Sonnenweg 3",
  address: "Sonnenweg 3, 8001 Zurich",
  sizeM2: 60,
  numRooms: 2.5,
  numBathrooms: 1,
  numBalconies: 1,
  hasWashingMachine: null,
  rentChf: 2200,
  pdfUrl: null,
  listingUrl: null,
  summary: null,
  availableFrom: null,
  ratings: [],
};

beforeEach(() => {
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartment detail — loading and error states", () => {
  it("renders the loading placeholder while the fetch is pending", () => {
    // Never-resolving fetch → component stays in loading state.
    vi.spyOn(global, "fetch").mockImplementation(
      () => new Promise(() => {})
    );
    render(<ApartmentDetailPage />);
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it("renders ErrorDisplay when initial GET fails and there's no apartment", async () => {
    vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/apartments/42")) {
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

    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load apartment/i)).toBeInTheDocument();
    });
  });

  it("surfaces an error when delete fails on the server", async () => {
    vi.spyOn(global, "fetch").mockImplementation(((
      input: RequestInfo,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      if (url === "/api/apartments" && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      }
      if (url.endsWith("/api/apartments/42") && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(APT),
        } as Response);
      }
      if (url === "/api/locations" && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      }
      if (url.endsWith("/api/apartments/42") && method === "DELETE") {
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
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't delete apartment/i)
      ).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("aborts delete when the user cancels confirm()", async () => {
    vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/apartments/42")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(APT),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }) as typeof fetch);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    // No DELETE was issued (only the initial GETs).
    const deleteCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter((c) => {
        const init = c[1] as RequestInit | undefined;
        return init?.method === "DELETE";
      });
    expect(deleteCalls.length).toBe(0);
    vi.unstubAllGlobals();
  });
});
