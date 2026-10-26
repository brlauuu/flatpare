#!/bin/sh
# Builds a map file for FLATPARE_MAPS=local (#339): one PMTiles file in the
# OpenMapTiles schema, with only the layers the map draws, from a Geofabrik
# OpenStreetMap extract. Needs Docker. Usage: scripts/build-map.sh <region>
# (a Geofabrik name such as switzerland, france, ile-de-france, bayern).
# The same Planetiler image and layers as .github/workflows/map-data.yml.
set -e

REGION="$1"
if [ -z "$REGION" ]; then
  echo "usage: scripts/build-map.sh <geofabrik-region>   e.g. switzerland, france, ile-de-france" >&2
  exit 1
fi
case "$REGION" in
  *[!a-z0-9-]*) echo "region names are lowercase letters, digits and dashes" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/maps/.build"
mkdir -p "$WORK"

if ls "$ROOT"/maps/*.pmtiles >/dev/null 2>&1; then
  echo "Note: maps/ already holds a .pmtiles file. The app uses exactly one; remove the old one afterwards." >&2
fi

docker run --rm --user "$(id -u):$(id -g)" -e JAVA_TOOL_OPTIONS="-Xmx${PLANETILER_MEMORY:-8g}" -v "$WORK":/data \
  ghcr.io/onthegomap/planetiler@sha256:782244a0932fa5696fdf80fa139655209f67e524da0a9388f8da34014a4dd0e2 \
  --download --area="$REGION" \
  --only_layers=park,landcover,water,waterway,transportation,water_name,transportation_name,place \
  --output=/data/out.pmtiles

mv "$WORK/out.pmtiles" "$ROOT/maps/$REGION.pmtiles"
echo "Wrote maps/$REGION.pmtiles. Set FLATPARE_MAPS=local in .env.local and reload the map page."
echo "The downloads Planetiler cached are in maps/.build; delete that folder to free the space."
