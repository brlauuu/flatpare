# Google APIs used by Flatpare

This project uses **two separate Google products**, each with its own key.
Make sure the right APIs are enabled on the right key, or features will
silently no-op.

## Quick reference

| Feature | API | Cloud product | Env var |
|---|---|---|---|
| PDF data extraction | Gemini API | Google AI Studio (or Vertex) | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Postcode + lat/lng geocoding | Geocoding API | Google Cloud — Maps Platform | `GOOGLE_MAPS_API_KEY` |
| Bike + transit travel times | Distance Matrix API | Google Cloud — Maps Platform | `GOOGLE_MAPS_API_KEY` |

**No Google API renders a map.** Both the overview map and the
single-apartment pin are drawn client-side with [Leaflet](https://leafletjs.com)
over OpenStreetMap tiles. The **Maps Embed API is not used and should not be
enabled** — it was, until E3 deleted `src/lib/map-embed.ts`, and enabling an
API a key does not need only widens what a leaked key can do.

Google is asked for two things only: coordinates (Geocoding) and travel times
(Distance Matrix), both at save time or during a maintenance pass — never at
render time.

All Maps Platform APIs share one key; you just need to **enable each one
individually** in the Google Cloud Console. Enabling one does not enable the
other — they are billed and gated separately.

## Setup

### 1. Generative AI key — `GOOGLE_GENERATIVE_AI_API_KEY`

For PDF parsing only. Get it from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). No
Google Cloud project setup required.

If unset, PDF upload falls back to manual entry.

### 2. Maps Platform key — `GOOGLE_MAPS_API_KEY`

One key, **two** APIs to enable:

1. Open [Google Cloud Console → APIs & Services → Library](https://console.cloud.google.com/apis/library).
2. Enable each of the following:
   - **Geocoding API** — used by `src/lib/geocode.ts` for both
     postcode extraction and the lat/lng pins the maps draw.
   - **Distance Matrix API** — used by `src/lib/distance.ts` for bike
     and transit times shown on each apartment.
3. Create or reuse an API key under **Credentials**. Restrict it to
   **those two APIs and nothing else.** (HTTP-referrer restrictions break
   server-side calls — restrict by API instead.)

If the key is unset, distances are skipped without error and apartments
simply don't get geocoded — set `OPENROUTESERVICE_API_KEY` as a free
fallback for both geocoding and distance.

## Verifying it works

After deployment, signed in, from DevTools on any page inside the app:

```js
// Geocoding API enabled?
await fetch("/api/process/geocode", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address: "Bahnhofstrasse 1, 8001 Zürich" }),
}).then(r => r.json())
// → { lat: 47.3, lng: 8.5, postcode: "8001" }        ✅
// → { lat: null, lng: null, reason: "google: REQUEST_DENIED" }
//                                                     ❌ API not enabled on this key
```

```js
// Distance Matrix API enabled?
await fetch("/api/process/distance", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ from: "8001 Zürich", to: "8005 Zürich" }),
}).then(r => r.json())
```

The `reason` field is where a misconfigured key shows up — `REQUEST_DENIED`
means the API is not enabled, `ZERO_RESULTS` means it is enabled and simply
found nothing. Both come back as a 200 with nulls, because a failed geocode
is not a failed request.

There is no server-side backfill route to call: geocoding a household's
existing rows happens **in the browser**, through the store's
`runMaintenance("geocode")`, since the addresses are encrypted and the server
cannot read them. Opening the map overview panel on the apartments page
triggers exactly that pass.

## Troubleshooting

- **Map overview shows "0 apartments · 0 locations"**: backfill ran but
  geocoding returned null. Almost always: Geocoding API not enabled on
  the Maps Platform key.
- **Distances missing on apartment cards**: Distance Matrix API not
  enabled, or `GOOGLE_MAPS_API_KEY` not set in the deployed env.
- **A map renders but has no pins**: the apartments have no coordinates
  yet, which is a Geocoding problem rather than a map one — the tiles come
  from OpenStreetMap and need no key at all.
- **PDF parsing returns "manual entry only"**:
  `GOOGLE_GENERATIVE_AI_API_KEY` is unset or invalid.
