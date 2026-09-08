import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useContext, useEffect } from "react";
import { CryptoContext, type CryptoContextValue } from "@/components/crypto/crypto-provider";
import { generateDataKey, seal } from "@/lib/crypto";
import { envelopeAad } from "@/lib/crypto";
import { emptyApartment, EMPTY_RATING, type Apartment, type Location } from "@/lib/household-data/types";
import type { ApartmentRow, LocationRow, RatingRow } from "@/lib/household-data/wire";
import {
  HouseholdDataContext,
  HouseholdDataProvider,
  type HouseholdDataContextValue,
} from "../household-data-provider";

const HID = 7;
const ME = { userId: "u-me", householdId: HID, userName: "Me" };
const A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const L1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// ---- fake server -----------------------------------------------------------

interface FakeServer {
  apartments: Map<string, ApartmentRow>;
  ratings: Map<string, RatingRow>; // key `${apartmentId}:${userId}`
  locations: Map<string, LocationRow>;
  process: {
    geocode: (address: string) => unknown;
    distance: (from: string, to: string) => unknown;
    checkListing: (url: string) => unknown;
  };
  calls: { method: string; url: string }[];
}

function makeServer(): FakeServer {
  return {
    apartments: new Map(),
    ratings: new Map(),
    locations: new Map(),
    process: {
      geocode: () => ({ lat: 47, lng: 8, postcode: "8000" }),
      distance: () => ({ bikeMin: 12, transitMin: 20 }),
      checkListing: () => ({ gone: false }),
    },
    calls: [],
  };
}

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function installFetch(server: FakeServer) {
  const now = () => new Date().toISOString();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = input;
      server.calls.push({ method, url });
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;

      if (url === "/api/apartments" && method === "GET") return json([...server.apartments.values()]);
      if (url === "/api/apartments" && method === "POST") {
        if (server.apartments.has(body.id)) return json({ error: "Duplicate id" }, 409);
        const row: ApartmentRow = { id: body.id, version: 1, envelope: body.envelope, createdAt: now(), updatedAt: now() };
        server.apartments.set(row.id, row);
        return json(row, 201);
      }
      const apt = url.match(/^\/api\/apartments\/([^/]+)$/);
      if (apt && method === "PUT") {
        const row = server.apartments.get(apt[1]);
        if (!row) return json({ error: "Not found" }, 404);
        if (row.version !== body.version) return json({ error: "Stale version", version: row.version }, 409);
        const updated = { ...row, version: row.version + 1, envelope: body.envelope, updatedAt: now() };
        server.apartments.set(row.id, updated);
        return json(updated);
      }
      if (apt && method === "DELETE") {
        if (!server.apartments.delete(apt[1])) return json({ error: "Not found" }, 404);
        for (const key of [...server.ratings.keys()]) if (key.startsWith(apt[1] + ":")) server.ratings.delete(key);
        return json(undefined, 204);
      }
      if (url === "/api/ratings" && method === "GET") return json([...server.ratings.values()]);
      const mine = url.match(/^\/api\/apartments\/([^/]+)\/ratings\/me$/);
      if (mine && method === "PUT") {
        const row: RatingRow = { apartmentId: mine[1], userId: ME.userId, userName: ME.userName, envelope: body.envelope, updatedAt: now() };
        server.ratings.set(`${mine[1]}:${ME.userId}`, row);
        return json(row);
      }
      if (mine && method === "DELETE") {
        server.ratings.delete(`${mine[1]}:${ME.userId}`);
        return json(undefined, 204);
      }
      if (url === "/api/locations" && method === "GET") return json([...server.locations.values()]);
      if (url === "/api/locations" && method === "POST") {
        const sortOrder = server.locations.size;
        const row: LocationRow = { id: body.id, sortOrder, envelope: body.envelope, createdAt: now(), updatedAt: now() };
        server.locations.set(row.id, row);
        return json(row, 201);
      }
      const loc = url.match(/^\/api\/locations\/([^/]+)$/);
      if (loc && method === "PUT") {
        const row = server.locations.get(loc[1]);
        if (!row) return json({ error: "Not found" }, 404);
        const updated = { ...row, envelope: body.envelope, updatedAt: now() };
        server.locations.set(row.id, updated);
        return json(updated);
      }
      if (loc && method === "DELETE") {
        server.locations.delete(loc[1]);
        return json(undefined, 204);
      }
      const move = url.match(/^\/api\/locations\/([^/]+)\/move$/);
      if (move && method === "POST") {
        const rows = [...server.locations.values()].sort((a, b) => a.sortOrder - b.sortOrder);
        const i = rows.findIndex((r) => r.id === move[1]);
        const j = body.direction === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= rows.length) return json({ error: "Not found" }, 404);
        [rows[i].sortOrder, rows[j].sortOrder] = [rows[j].sortOrder, rows[i].sortOrder];
        for (const r of rows) server.locations.set(r.id, r);
        return json(rows.sort((a, b) => a.sortOrder - b.sortOrder));
      }
      // A process handler that throws mimics a route that failed server-side
      // (a 500 with no error body), not a network-level fetch failure.
      if (url === "/api/process/geocode" || url === "/api/process/distance" || url === "/api/process/check-listing") {
        try {
          if (url === "/api/process/geocode") return json(server.process.geocode(body.address));
          if (url === "/api/process/distance") return json(server.process.distance(body.from, body.to));
          return json(server.process.checkListing(body.url));
        } catch {
          return json({}, 500);
        }
      }
      throw new Error(`unhandled ${method} ${url}`);
    })
  );
}

// ---- harness ---------------------------------------------------------------

let dataKey: CryptoKey;
let server: FakeServer;
let captured: HouseholdDataContextValue | null = null;

function Capture() {
  const value = useContext(HouseholdDataContext);
  useEffect(() => {
    captured = value;
  });
  return (
    <div>
      <span data-testid="status">{value?.status}</span>
      <span data-testid="count">{value?.apartments.length ?? 0}</span>
      <ul>
        {value?.apartments.map((a) => (
          <li key={a.id} data-testid={`apt-${a.id}`}>
            {a.name}|{a.shortCode ?? "-"}|{a.avgOverall ?? "-"}|{a.corrupt ? "corrupt" : "ok"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderProvider() {
  const crypto = { keys: { userId: ME.userId, householdId: HID, privateKey: {} as CryptoKey, dataKey } } as unknown as CryptoContextValue;
  return render(
    <CryptoContext.Provider value={crypto}>
      <HouseholdDataProvider identity={ME} limits={{ maxMembers: null, maxApartments: null }}>
        <Capture />
      </HouseholdDataProvider>
    </CryptoContext.Provider>
  );
}

async function seed(id: string, data: Apartment, version = 1) {
  const envelope = await seal(dataKey, data, envelopeAad(HID, "apartments", id));
  server.apartments.set(id, { id, version, envelope, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
}

async function seedLocation(id: string, data: Location, sortOrder = 0) {
  const envelope = await seal(dataKey, data, envelopeAad(HID, "locations", id));
  server.locations.set(id, { id, sortOrder, envelope, createdAt: "", updatedAt: "" });
}

async function ready() {
  await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  return captured as HouseholdDataContextValue;
}

beforeEach(async () => {
  dataKey = await generateDataKey();
  server = makeServer();
  captured = null;
  installFetch(server);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- tests -----------------------------------------------------------------

describe("HouseholdDataProvider", () => {
  it("loads and decodes the three tables, deriving averages", async () => {
    await seed(A1, { ...emptyApartment("Flat A"), shortCode: "ABC-3B-1b-WY-8000" });
    const rating = await seal(dataKey, { ...EMPTY_RATING, overallFeeling: 4 }, envelopeAad(HID, "ratings", `${A1}:u-other`));
    server.ratings.set(`${A1}:u-other`, { apartmentId: A1, userId: "u-other", userName: "Other", envelope: rating, updatedAt: "" });
    renderProvider();
    const ctx = await ready();
    expect(screen.getByTestId(`apt-${A1}`).textContent).toBe("Flat A|ABC-3B-1b-WY-8000|4|ok");
    expect(ctx.apartments[0].ratings).toHaveLength(1);
    expect(ctx.apartments[0].myRating).toBeNull();
  });

  it("renders a corrupt placeholder for a row that fails to open", async () => {
    await seed(A1, emptyApartment("Good"));
    const foreign = await seal(dataKey, emptyApartment("Bad"), envelopeAad(HID, "apartments", A2));
    server.apartments.set(A1 + "-x", { id: A1 + "-x", version: 1, envelope: foreign, createdAt: "", updatedAt: "" });
    renderProvider();
    await ready();
    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId(`apt-${A1}-x`).textContent).toBe("Unreadable apartment|-|-|corrupt");
  });

  it("createApartment seals, posts, shows the row and enriches it", async () => {
    await seedLocation(L1, { label: "Work", icon: "Briefcase", address: "Office 1", latitude: 47, longitude: 8 });
    renderProvider();
    const ctx = await ready();

    let view: Awaited<ReturnType<typeof ctx.createApartment>> | undefined;
    await act(async () => {
      view = await ctx.createApartment(A1, { ...emptyApartment("New"), address: "Street 5", numRooms: 2, numBathrooms: 1, hasWashingMachine: false });
    });
    expect(view?.id).toBe(A1);
    expect(server.apartments.get(A1)?.envelope).toMatchObject({ v: 1 });

    await waitFor(() => expect(screen.getByTestId(`apt-${A1}`).textContent).toMatch(/\|[A-Z]{3}-2B-1b-WN-8000\|/));
    const enriched = (captured as HouseholdDataContextValue).apartments.find((a) => a.id === A1)!;
    expect(enriched.latitude).toBe(47);
    expect(enriched.distances[L1]).toEqual({ bikeMin: 12, transitMin: 20 });
    expect(server.apartments.get(A1)?.version).toBe(2);
  });

  it("records an enrichment error and retryEnrichment clears it", async () => {
    server.process.geocode = () => {
      throw new Error("geocoder down");
    };
    renderProvider();
    const ctx = await ready();
    await act(async () => {
      await ctx.createApartment(A1, { ...emptyApartment("New"), address: "Street 5" });
    });
    await waitFor(() => expect((captured as HouseholdDataContextValue).enrichmentError[A1]).toBeTruthy(), { timeout: 3000 });

    server.process.geocode = () => ({ lat: 1, lng: 2, postcode: "9000" });
    await act(async () => {
      await (captured as HouseholdDataContextValue).retryEnrichment(A1);
    });
    expect((captured as HouseholdDataContextValue).enrichmentError[A1]).toBeUndefined();
    expect((captured as HouseholdDataContextValue).apartments[0].latitude).toBe(1);
  });

  it("updateApartment retries once on a stale version", async () => {
    await seed(A1, { ...emptyApartment("Flat"), shortCode: "ABC-1B-1b-WN-8000" }, 1);
    renderProvider();
    const ctx = await ready();
    // Another device wrote in between: bump the server's version behind our back.
    const row = server.apartments.get(A1)!;
    server.apartments.set(A1, { ...row, version: 3, envelope: await seal(dataKey, { ...emptyApartment("Flat (renamed elsewhere)"), shortCode: "ABC-1B-1b-WN-8000" }, envelopeAad(HID, "apartments", A1)) });

    await act(async () => {
      await ctx.updateApartment(A1, (a) => ({ ...a, rentChf: 2000 }));
    });
    const after = (captured as HouseholdDataContextValue).apartments[0];
    expect(after.name).toBe("Flat (renamed elsewhere)");
    expect(after.rentChf).toBe(2000);
    expect(after.version).toBe(4);
    expect(server.calls.filter((c) => c.method === "PUT")).toHaveLength(2);
  });

  it("updateApartment throws on a second stale conflict", async () => {
    await seed(A1, emptyApartment("Flat"), 1);
    renderProvider();
    const ctx = await ready();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (init?.method === "PUT") return json({ error: "Stale version", version: 9 }, 409);
      return original(input, init);
    });
    await expect(ctx.updateApartment(A1, (a) => a)).rejects.toThrow("Stale version");
  });

  it("rateApartment upserts and removes my rating", async () => {
    await seed(A1, emptyApartment("Flat"));
    renderProvider();
    const ctx = await ready();
    await act(async () => {
      await ctx.rateApartment(A1, { ...EMPTY_RATING, overallFeeling: 5, comment: "nice" });
    });
    expect((captured as HouseholdDataContextValue).apartments[0].myRating).toBe(5);
    expect(server.ratings.get(`${A1}:u-me`)?.envelope).toMatchObject({ v: 1 });
    await act(async () => {
      await (captured as HouseholdDataContextValue).rateApartment(A1, null);
    });
    expect((captured as HouseholdDataContextValue).apartments[0].myRating).toBeNull();
    expect(server.ratings.size).toBe(0);
  });

  it("deleteApartment sends the pdf path and drops the row", async () => {
    await seed(A1, { ...emptyApartment("Flat"), pdf: { path: `/api/uploads/households/7/${A1}.pdf.enc`, iv: "aa" } });
    renderProvider();
    const ctx = await ready();
    await act(async () => {
      await ctx.deleteApartment(A1);
    });
    expect(screen.getByTestId("count").textContent).toBe("0");
    const del = server.calls.find((c) => c.method === "DELETE");
    expect(del?.url).toBe(`/api/apartments/${A1}`);
  });

  it("createLocation geocodes first, then fills that location's distances", async () => {
    await seed(A1, { ...emptyApartment("Flat"), address: "Street 5", latitude: 47, longitude: 8 });
    renderProvider();
    const ctx = await ready();
    let view: Awaited<ReturnType<typeof ctx.createLocation>> | undefined;
    await act(async () => {
      view = await ctx.createLocation(L1, { label: "Work", icon: "Briefcase", address: "Office 1", latitude: null, longitude: null });
    });
    expect(view).toMatchObject({ id: L1, latitude: 47, longitude: 8, sortOrder: 0 });
    await waitFor(() =>
      expect((captured as HouseholdDataContextValue).apartments[0].distances[L1]).toEqual({ bikeMin: 12, transitMin: 20 })
    );
  });

  it("updateLocation re-geocodes only when the address changed", async () => {
    await seedLocation(L1, { label: "Work", icon: "Briefcase", address: "Office 1", latitude: 47, longitude: 8 });
    renderProvider();
    const ctx = await ready();
    await act(async () => {
      await ctx.updateLocation(L1, (l) => ({ ...l, label: "Job" }));
    });
    expect(server.calls.filter((c) => c.url === "/api/process/geocode")).toHaveLength(0);
    server.process.geocode = () => ({ lat: 1, lng: 1, postcode: null });
    await act(async () => {
      await (captured as HouseholdDataContextValue).updateLocation(L1, (l) => ({ ...l, address: "Office 2" }));
    });
    expect(server.calls.filter((c) => c.url === "/api/process/geocode")).toHaveLength(1);
    expect((captured as HouseholdDataContextValue).locations[0]).toMatchObject({ label: "Job", address: "Office 2", latitude: 1 });
  });

  it("moveLocation reorders from the server's response", async () => {
    await seedLocation(L1, { label: "A", icon: "Briefcase", address: "x", latitude: null, longitude: null }, 0);
    const L2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await seedLocation(L2, { label: "B", icon: "Briefcase", address: "y", latitude: null, longitude: null }, 1);
    renderProvider();
    const ctx = await ready();
    expect(ctx.locations.map((l) => l.label)).toEqual(["A", "B"]);
    await act(async () => {
      await ctx.moveLocation(L2, "up");
    });
    expect((captured as HouseholdDataContextValue).locations.map((l) => l.label)).toEqual(["B", "A"]);
  });

  it("runMaintenance('listings') writes only rows whose listingGone changed", async () => {
    await seed(A1, { ...emptyApartment("Gone"), listingUrl: "https://a", listingGone: false });
    await seed(A2, { ...emptyApartment("Still up"), listingUrl: "https://b", listingGone: false });
    server.process.checkListing = (url: string) => ({ gone: url === "https://a" });
    renderProvider();
    const ctx = await ready();
    const progress = vi.fn();
    let report: Awaited<ReturnType<typeof ctx.runMaintenance>> | undefined;
    await act(async () => {
      report = await ctx.runMaintenance("listings", progress);
    });
    expect(report).toEqual({ updated: 1, skipped: 1, failed: [] });
    expect(progress).toHaveBeenLastCalledWith(2, 2);
    expect(server.apartments.get(A1)?.version).toBe(2);
    expect(server.apartments.get(A2)?.version).toBe(1);
    expect((captured as HouseholdDataContextValue).apartments.find((a) => a.id === A1)?.listingGone).toBe(true);
  });

  it("runMaintenance('geocode') fills coordinates and reports failures per row", async () => {
    await seed(A1, { ...emptyApartment("No coords"), address: "Street 1" });
    await seed(A2, { ...emptyApartment("Bad"), address: "Street 2" });
    server.process.geocode = (address: string) => {
      if (address === "Street 2") throw new Error("boom");
      return { lat: 5, lng: 6, postcode: "8000" };
    };
    renderProvider();
    const ctx = await ready();
    let report: Awaited<ReturnType<typeof ctx.runMaintenance>> | undefined;
    await act(async () => {
      report = await ctx.runMaintenance("geocode");
    });
    expect(report?.updated).toBe(1);
    expect(report?.failed).toEqual([{ id: A2, reason: expect.stringContaining("Request failed") }]);
    expect((captured as HouseholdDataContextValue).apartments.find((a) => a.id === A1)?.latitude).toBe(5);
  });

  it("runMaintenance('distances') recomputes every located pair", async () => {
    await seed(A1, { ...emptyApartment("Flat"), address: "Street 1", latitude: 1, longitude: 1, distances: { [L1]: { bikeMin: 99, transitMin: 99 } } });
    await seedLocation(L1, { label: "Work", icon: "Briefcase", address: "Office", latitude: 2, longitude: 2 });
    renderProvider();
    const ctx = await ready();
    let report: Awaited<ReturnType<typeof ctx.runMaintenance>> | undefined;
    await act(async () => {
      report = await ctx.runMaintenance("distances");
    });
    expect(report).toEqual({ updated: 1, skipped: 0, failed: [] });
    expect((captured as HouseholdDataContextValue).apartments[0].distances[L1]).toEqual({ bikeMin: 12, transitMin: 20 });
  });

  it("reports a load failure as status error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Not authenticated" }, 401)));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    expect((captured as HouseholdDataContextValue).error).toBe("Not authenticated");
  });

  it("unmount drops state: a remount reloads from the server, not from memory", async () => {
    await seed(A1, emptyApartment("Flat A"));
    const view = renderProvider();
    await ready();
    expect(screen.getByTestId("count").textContent).toBe("1");

    view.unmount();
    captured = null;
    server.apartments.clear();

    renderProvider();
    await ready();
    expect(screen.getByTestId("count").textContent).toBe("0");
    // Two GET /api/apartments in total — one per mount; nothing was cached
    // across the unmount.
    expect(server.calls.filter((c) => c.method === "GET" && c.url === "/api/apartments")).toHaveLength(2);
  });
});
