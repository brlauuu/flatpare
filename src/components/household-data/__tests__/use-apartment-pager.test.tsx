import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { HouseholdDataContext } from "@/components/household-data/household-data-provider";
import {
  makeApartmentView,
  makeHouseholdData,
} from "@/components/household-data/__tests__/fake-household-data";
import { useApartmentPager } from "@/components/household-data/use-apartment-pager";

// Default (createdAt desc) order: b (March), c (February), a (January).
const APARTMENTS = [
  makeApartmentView({ id: "a", name: "Sonnenweg 3", rentChf: 2200, createdAt: "2026-01-15T10:00:00Z" }),
  makeApartmentView({ id: "b", name: "Bergstrasse 12", rentChf: 1800, createdAt: "2026-03-20T10:00:00Z" }),
  makeApartmentView({ id: "c", name: "Seeblick 7", rentChf: null, createdAt: "2026-02-10T10:00:00Z" }),
];

function renderPager(
  currentId: string,
  over: Parameters<typeof makeHouseholdData>[0] = {}
) {
  const value = makeHouseholdData({ apartments: APARTMENTS, ...over });
  return renderHook(() => useApartmentPager(currentId), {
    wrapper: ({ children }) => (
      <HouseholdDataContext.Provider value={value}>{children}</HouseholdDataContext.Provider>
    ),
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("useApartmentPager", () => {
  it("reports loading while the store is loading", () => {
    const { result } = renderPager("b", { status: "loading", apartments: [] });
    expect(result.current.loading).toBe(true);
    expect(result.current.total).toBe(0);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("positions the middle apartment under the default sort (createdAt desc)", () => {
    const { result } = renderPager("c");
    expect(result.current.loading).toBe(false);
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe("b");
    expect(result.current.nextId).toBe("a");
  });

  it("honors the sort preference stored in localStorage", () => {
    // rentChf asc: b (1800), a (2200), c (null last).
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    const { result } = renderPager("a");
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe("b");
    expect(result.current.nextId).toBe("c");
  });

  it("returns prevId null on the first and nextId null on the last", () => {
    expect(renderPager("b").result.current.prevId).toBeNull();
    expect(renderPager("b").result.current.nextId).toBe("c");
    expect(renderPager("a").result.current.nextId).toBeNull();
    expect(renderPager("a").result.current.prevId).toBe("c");
  });

  it("returns null position and ids when the current id is not in the store", () => {
    const { result } = renderPager("nope");
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBeNull();
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
  });

  it("falls back to defaults when localStorage holds invalid sort values", () => {
    localStorage.setItem("flatpare-apartments-sort-field", "bogus");
    localStorage.setItem("flatpare-apartments-sort-direction", "sideways");
    const { result } = renderPager("c");
    expect(result.current.position).toBe(2);
    expect(result.current.prevId).toBe("b");
  });

  it("surfaces the store's error", () => {
    const { result } = renderPager("b", { status: "error", error: "Couldn't load household data", apartments: [] });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("Couldn't load household data");
    expect(result.current.position).toBeNull();
  });
});
