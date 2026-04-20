#!/bin/sh
set -e

# Push database schema if using local SQLite
if [ -z "$TURSO_DATABASE_URL" ]; then
  echo "Local mode: pushing database schema..."
  npx drizzle-kit push --force
fi

exec node server.js
