import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
let currentParamsId = "3";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: currentParamsId }),
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

import ApartmentDetailPage from "../page";

const LIST = [
  {
    id: 1,
    name: "Sonnenweg 3",
    address: null,
    sizeM2: 60,
    numRooms: 2.5,
    rentChf: 2200,
    shortCode: "ABC-2.5B-WY-4057",
    avgOverall: null,
    myRating: null,
    createdAt: "2026-01-15T10:00:00Z",
  },
  {
    id: 2,
    name: "Bergstrasse 12",
    address: null,
    sizeM2: 45,
    numRooms: 2,
    rentChf: 1800,
    shortCode: "DEF-2B-W-4058",
    avgOverall: "3.5",
    myRating: 4,
    createdAt: "2026-03-20T10:00:00Z",
  },
  {
    id: 3,
    name: "Seeblick 7",
    address: null,
    sizeM2: 80,
    numRooms: 3.5,
    rentChf: null,
    shortCode: "GHI-3.5B-WY-4059",
    avgOverall: "4.5",
    myRating: null,
    createdAt: "2026-02-10T10:00:00Z",
  },
];

function apartmentResponse(id: number) {
  const apt = LIST.find((a) => a.id === id);
  return {
    ok: true,
    json: () => Promise.resolve({ ...apt, ratings: [] }),
  } as Response;
}

function listResponse() {
  return {
    ok: true,
    json: () => Promise.resolve(LIST),
  } as Response;
}

beforeEach(() => {
  localStorage.clear();
  pushMock.mockReset();
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url === "/api/apartments") return Promise.resolve(listResponse());
    if (url === "/api/locations") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }
    const match = url.match(/\/api\/apartments\/(\d+)$/);
    if (match) return Promise.resolve(apartmentResponse(Number(match[1])));
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartment detail page — pager", () => {
  it("renders position and enabled buttons for a middle apartment", async () => {
    currentParamsId = "3"; // Seeblick — middle under default sort
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("2 of 3")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Previous/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  it("clicking Next navigates to nextId", async () => {
    currentParamsId = "3"; // Seeblick → next is Sonnenweg (id 1) under default sort.
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("2 of 3")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(pushMock).toHaveBeenCalledWith("/apartments/1");
  });

  it("disables Previous on the first apartment", async () => {
    currentParamsId = "2"; // Bergstrasse — first under default sort.
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("1 of 3")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  it("disables Next on the last apartment and Previous navigates", async () => {
    currentParamsId = "1"; // Sonnenweg — last under default sort.
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("3 of 3")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Previous/i }));
    expect(pushMock).toHaveBeenCalledWith("/apartments/3");
  });
});
