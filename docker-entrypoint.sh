#!/bin/sh
set -e

# The map choice (#339) is made at installation, not defaulted: a
# self-hoster decides whether the map may contact OpenFreeMap. See
# FLATPARE_MAPS in .env.example.
case "${FLATPARE_MAPS:-}" in
  openfreemap|local) ;;
  "")
    echo "Flatpare will not start until you choose where the map's streets come from." >&2
    echo "Set FLATPARE_MAPS in .env.local to one of:" >&2
    echo "  openfreemap  streets load from OpenFreeMap, which sees the area on screen (never your data)" >&2
    echo "  local        streets come from a map file you put in ./maps; nothing outside it is contacted" >&2
    echo "Then run: docker compose up -d" >&2
    exit 1
    ;;
  *)
    echo "FLATPARE_MAPS must be \"openfreemap\" or \"local\", got \"$FLATPARE_MAPS\"." >&2
    exit 1
    ;;
esac

exec node server.js
