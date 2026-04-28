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
| Single-apartment map embed | Maps Embed API | Google Cloud — Maps Platform | `GOOGLE_MAPS_API_KEY` |

The map *overview* page does **not** call any Google API at render time —
it uses OpenStreetMap tiles. Pin coordinates are produced by the
Geocoding API at apartment/location save time and on backfill.

All Maps Platform APIs share one key; you just need to **enable each one
individually** in the Google Cloud Console. Enabling Maps Embed alone
will not enable Geocoding — they are billed and gated separately.

## Setup

### 1. Generative AI key — `GOOGLE_GENERATIVE_AI_API_KEY`

For PDF parsing only. Get it from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). No
Google Cloud project setup required.

If unset, PDF upload falls back to manual entry.

### 2. Maps Platform key — `GOOGLE_MAPS_API_KEY`

One key, three APIs to enable:

1. Open [Google Cloud Console → APIs & Services → Library](https://console.cloud.google.com/apis/library).
2. Enable each of the following:
   - **Geocoding API** — used by `src/lib/geocode.ts` for both
     postcode extraction and the lat/lng pins on the apartments
     overview map.
   - **Distance Matrix API** — used by `src/lib/distance.ts` for bike
     and transit times shown on each apartment.
   - **Maps Embed API** — used by `src/lib/map-embed.ts` to render
     the single-apartment map iframe on the apartment detail page.
3. Create or reuse an API key under **Credentials**. Restrict it to
   the three APIs above. (HTTP-referrer restrictions break server-side
   calls — restrict by API instead.)

If the key is unset, distances and embedded maps are skipped without
error, and apartments simply don't get geocoded — set
`OPENROUTESERVICE_API_KEY` as a free fallback for both geocoding and
distance.

## Verifying it works

After deployment, from the apartments page in DevTools:

```js
// Geocoding API enabled?
await fetch("/api/geocode/backfill", { method: "POST" }).then(r => r.json())
// → { pending: N, updated: N }    ✅
// → { pending: N, updated: 0 }    ❌ Geocoding API disabled or key wrong
```

If `updated < pending` after the backfill, check the function logs in
Vercel — `tryGoogleGeocodeLatLng` swallows the error but logs through
the API-usage table; a `REQUEST_DENIED` response from Google means the
API isn't enabled on that key.

## Troubleshooting

- **Map overview shows "0 apartments · 0 locations"**: backfill ran but
  geocoding returned null. Almost always: Geocoding API not enabled on
  the Maps Platform key.
- **Distances missing on apartment cards**: Distance Matrix API not
  enabled, or `GOOGLE_MAPS_API_KEY` not set in the deployed env.
- **Single-apartment map iframe is blank**: Maps Embed API not enabled,
  or the key has referrer restrictions that block your domain.
- **PDF parsing returns "manual entry only"**:
  `GOOGLE_GENERATIVE_AI_API_KEY` is unset or invalid.
