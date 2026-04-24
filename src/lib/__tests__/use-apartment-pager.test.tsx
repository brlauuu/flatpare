import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useApartmentPager } from "@/lib/use-apartment-pager";

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

// Default (createdAt desc) order: Bergstrasse (id 2), Seeblick (id 3), Sonnenweg (id 1).

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(LIST),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useApartmentPager", () => {
  it("returns loading state initially", () => {
    const { result } = renderHook(() => useApartmentPager(2));
    expect(result.current.loading).toBe(true);
    expect(result.current.total).toBe(0);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("resolves to correct position and neighbors under default sort (createdAt desc)", async () => {
    // Default order: Bergstrasse (2, newest), Seeblick (3), Sonnenweg (1, oldest).
    // Middle apartment = Seeblick (id 3): position 2, prev 2, next 1.
    const { result } = renderHook(() => useApartmentPager(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe(2);
    expect(result.current.nextId).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("honors sort preference stored in localStorage", async () => {
    // rentChf asc: Bergstrasse (1800, id 2), Sonnenweg (2200, id 1), Seeblick (null last, id 3).
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    const { result } = renderHook(() => useApartmentPager(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe(2);
    expect(result.current.nextId).toBe(3);
  });

  it("returns prevId null on the first apartment in order", async () => {
    // Default order: Bergstrasse (2) is first.
    const { result } = renderHook(() => useApartmentPager(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.position).toBe(1);
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBe(3);
  });

  it("returns nextId null on the last apartment in order", async () => {
    // Default order: Sonnenweg (1) is last.
    const { result } = renderHook(() => useApartmentPager(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.position).toBe(3);
    expect(result.current.prevId).toBe(3);
    expect(result.current.nextId).toBeNull();
  });

  it("returns null position and null ids when current id is not in the list", async () => {
    const { result } = renderHook(() => useApartmentPager(9999));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
  });

  it("falls back to defaults when localStorage has invalid sort values", async () => {
    localStorage.setItem("flatpare-apartments-sort-field", "bogus");
    localStorage.setItem("flatpare-apartments-sort-direction", "sideways");
    const { result } = renderHook(() => useApartmentPager(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Defaults → createdAt desc → Seeblick is position 2.
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe(2);
    expect(result.current.nextId).toBe(1);
  });

  it("surfaces an error when the list fetch fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      clone() {
        return this;
      },
      text: () => Promise.resolve("boom"),
      headers: new Headers(),
    } as unknown as Response);

    const { result } = renderHook(() => useApartmentPager(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.total).toBe(0);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
  });

  it("surfaces an error when fetch itself throws (network failure)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useApartmentPager(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.total).toBe(0);
    expect(result.current.position).toBeNull();
  });
});
