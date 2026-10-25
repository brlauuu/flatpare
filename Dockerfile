FROM node:24-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create data directory so the build can initialize SQLite if needed
RUN mkdir -p data

# The self-hosted map data (#339), about 225 MB, so the map contacts no tile
# host for Switzerland. `--build-arg MAP_DATA=skip` leaves it out; the map
# then reads OpenFreeMap everywhere.
ARG MAP_DATA=fetch
RUN if [ "$MAP_DATA" != "skip" ]; then npx tsx scripts/fetch-map-data.ts; fi

RUN npm run build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Migrations are applied at startup via src/instrumentation.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/docker-entrypoint.sh ./

# Create data and uploads directories for local mode
RUN mkdir -p data uploads && chown nextjs:nodejs data uploads

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
