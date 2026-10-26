# Your own map file

Used when `FLATPARE_MAPS=local` (see `.env.example`). Put exactly one
`.pmtiles` file in this folder. The app serves it to the map from your own
server, and the map contacts no outside service: areas the file does not
cover show only your apartments and places.

The file must be a PMTiles v3 file in the OpenMapTiles schema. Two ways to
get one:

- **Switzerland, ready-made:** download
  `ch-2026-10-25.pmtiles` (225 MB) from
  https://github.com/brlauuu/flatpare/releases/tag/map-data-2026-10-25
  into this folder.
- **Any other region:** `scripts/build-map.sh <region>` builds one with
  Planetiler in Docker from an OpenStreetMap extract, for example
  `scripts/build-map.sh france` or `scripts/build-map.sh ile-de-france`.
  Region names are Geofabrik's (https://download.geofabrik.de). It needs
  Docker and some RAM: Switzerland takes a few minutes and 8 GB; a large
  country takes longer and more.

After adding or replacing the file, reload the map page; no restart is
needed. The map credits `© OpenMapTiles © OpenStreetMap contributors`, as
the data's licence requires.
