import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolvePlace, suggestPlaces } from "../places";

// #480: Google Places Autocomplete (New) and Place Details, with the
// geocoder as the fallback until the Places API is enabled on the key.

const SESSION = { sessionToken: "44444444-4444-4444-8444-444444444444", language: "de" };
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response;

beforeEach(() => {
  process.env.GOOGLE_MAPS_API_KEY = "SECRET-KEY";
  delete process.env.OPENROUTESERVICE_API_KEY;
});
afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  vi.restoreAllMocks();
});

describe("suggestPlaces", () => {
  it("asks Places with the session, language and bias, and maps the predictions", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      reply({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJbern",
              text: { text: "Bahnhofplatz, Bern, Schweiz" },
              structuredFormat: { mainText: { text: "Bahnhofplatz" }, secondaryText: { text: "Bern, Schweiz" } },
            },
          },
          { queryPrediction: { text: { text: "Bahnhofplatz restaurant" } } },
          { placePrediction: { placeId: "ChIJplain", text: { text: "Hauptbahnhof Zürich" } } },
        ],
      })
    );
    const found = await suggestPlaces("Bahnhofpl", { ...SESSION, near: { lat: 47.4, lng: 8.5 } });
    expect(found).toEqual([
      { placeId: "ChIJbern", label: "Bahnhofplatz", detail: "Bern, Schweiz", place: null },
      { placeId: "ChIJplain", label: "Hauptbahnhof Zürich", detail: null, place: null },
    ]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("SECRET-KEY");
    expect(JSON.parse(String(init.body))).toEqual({
      input: "Bahnhofpl",
      sessionToken: SESSION.sessionToken,
      languageCode: "de",
      locationBias: { circle: { center: { latitude: 47.4, longitude: 8.5 }, radius: 50000 } },
    });
  });

  it("sends no bias without one", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(reply({ suggestions: [] }));
    expect(await suggestPlaces("Bahn", { ...SESSION, near: null })).toEqual([]);
    expect(JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body))).not.toHaveProperty("locationBias");
  });

  it("falls back to the geocoder when Places refuses, logging only the class and status", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(reply({ error: { message: "Places API (New) has not been used in project Secret" } }, 403))
      .mockResolvedValueOnce(
        reply({ results: [{ formatted_address: "Bahnhofplatz, 3011 Bern", geometry: { location: { lat: 46.9, lng: 7.4 } } }] })
      );
    expect(await suggestPlaces("Secret Street", { ...SESSION, near: null })).toEqual([
      {
        placeId: null,
        label: "Bahnhofplatz, 3011 Bern",
        detail: null,
        place: { address: "Bahnhofplatz, 3011 Bern", lat: 46.9, lng: 7.4 },
      },
    ]);
    const logged = errors.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("PlacesError status=403");
    expect(logged).not.toContain("Secret");
  });

  it("calls nothing for an empty query, or without a key", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    expect(await suggestPlaces("  ", { ...SESSION, near: null })).toEqual([]);
    delete process.env.GOOGLE_MAPS_API_KEY;
    expect(await suggestPlaces("Bahn", { ...SESSION, near: null })).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("resolvePlace", () => {
  it("asks Place Details for the address and location only, in the same session", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      reply({ formattedAddress: "Bahnhofplatz, 3011 Bern, Schweiz", location: { latitude: 46.948, longitude: 7.44 } })
    );
    expect(await resolvePlace("ChIJbern", SESSION)).toEqual({ address: "Bahnhofplatz, 3011 Bern, Schweiz", lat: 46.948, lng: 7.44 });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://places.googleapis.com/v1/places/ChIJbern?sessionToken=${SESSION.sessionToken}&languageCode=de`
    );
    expect(init.headers).toMatchObject({ "x-goog-fieldmask": "formattedAddress,location" });
  });

  it("is null without a location, and throws on a refusal", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(reply({ formattedAddress: "Somewhere" }))
      .mockResolvedValueOnce(reply({}, 403));
    expect(await resolvePlace("ChIJx", SESSION)).toBeNull();
    await expect(resolvePlace("ChIJx", SESSION)).rejects.toMatchObject({ name: "PlacesError", status: 403 });
  });
});
