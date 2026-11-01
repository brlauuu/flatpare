import { scrubbedErrorLine } from "@/lib/log-scrub";
import { searchAddresses, ADDRESS_SEARCH_LIMIT } from "@/lib/geocode";

// #480: address suggestions while typing a location of interest, from
// Google Places Autocomplete (New), the way a maps site offers them. A
// suggestion is only a name until it is picked; picking asks Place Details
// for its address and coordinates, and the two calls share the session token
// the browser minted, which is how Google bills them as one search.
//
// Until Places API (New) is enabled on GOOGLE_MAPS_API_KEY (or without the
// key) suggestions come from the geocoder instead: one best match with its
// coordinates already known, or OpenRouteService's matches.

export interface PlaceSuggestion {
  // A Places id to resolve on pick, or null when `place` is already known.
  placeId: string | null;
  label: string;
  detail: string | null;
  place: Place | null;
}

export interface Place {
  address: string;
  lat: number;
  lng: number;
}

export interface SuggestOptions {
  sessionToken: string;
  language: string;
  near: { lat: number; lng: number } | null;
}

// How far around the household's own places suggestions are favoured. A
// bias, not a restriction: a place outside it can still be found.
const BIAS_RADIUS_M = 50_000;

const PLACES = "https://places.googleapis.com/v1";
const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): string | null => {
  const t = (v as { text?: unknown } | undefined)?.text;
  return typeof t === "string" && t.trim() !== "" ? t : null;
};

class PlacesError extends Error {
  constructor(readonly status: number) {
    super("Places request failed");
    this.name = "PlacesError";
  }
}

async function placesAutocomplete(
  apiKey: string,
  input: string,
  { sessionToken, language, near }: SuggestOptions
): Promise<PlaceSuggestion[]> {
  const res = await fetch(`${PLACES}/places:autocomplete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: language,
      ...(near
        ? {
            locationBias: {
              circle: { center: { latitude: near.lat, longitude: near.lng }, radius: BIAS_RADIUS_M },
            },
          }
        : {}),
    }),
  });
  if (!res.ok) throw new PlacesError(res.status);
  const data = await res.json();
  const suggestions: unknown[] = Array.isArray(data.suggestions) ? data.suggestions : [];
  return suggestions
    .flatMap((s) => {
      const p = (s as { placePrediction?: Record<string, unknown> }).placePrediction;
      if (!p || typeof p.placeId !== "string") return [];
      const format = p.structuredFormat as Record<string, unknown> | undefined;
      const label = text(format?.mainText) ?? text(p.text);
      if (!label) return [];
      return [{ placeId: p.placeId, label, detail: text(format?.secondaryText), place: null }];
    })
    .slice(0, ADDRESS_SEARCH_LIMIT);
}

// Suggestions for what has been typed so far. Never throws for a provider
// failure: it logs the error's class and falls back to the geocoder.
export async function suggestPlaces(input: string, options: SuggestOptions): Promise<PlaceSuggestion[]> {
  if (!input.trim()) return [];
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      return await placesAutocomplete(apiKey, input, options);
    } catch (err) {
      // A 403 is Places API (New) not enabled on the key; the fallback keeps
      // the search working meanwhile. Logged scrubbed: the class and status.
      console.error(`[places:autocomplete] failed — ${scrubbedErrorLine(err)}`);
    }
  }
  return (await searchAddresses(input)).map((place) => ({
    placeId: null,
    label: place.address,
    detail: null,
    place,
  }));
}

// The address and coordinates of a picked suggestion; null when Google has
// none for it. Throws on a provider failure, so the route answers an error
// and the form keeps what was typed.
export async function resolvePlace(
  placeId: string,
  { sessionToken, language }: Omit<SuggestOptions, "near">
): Promise<Place | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const url = new URL(`${PLACES}/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("languageCode", language);
  const res = await fetch(url.toString(), {
    headers: { "x-goog-api-key": apiKey, "x-goog-fieldmask": "formattedAddress,location" },
  });
  if (!res.ok) throw new PlacesError(res.status);
  const data = await res.json();
  const address = data.formattedAddress;
  const lat = data.location?.latitude;
  const lng = data.location?.longitude;
  if (typeof address !== "string" || !isCoord(lat) || !isCoord(lng)) return null;
  return { address, lat, lng };
}
