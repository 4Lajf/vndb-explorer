# syntax=docker/dockerfile:1

# ── Stage 1: Build SvelteKit production bundle ──
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# ── Stage 2: Optional build-time VNDB SQLite build (set BUILD_DB=1 in Coolify build args) ──
FROM node:22-slim AS db-builder
WORKDIR /app

ARG BUILD_DB=0
ARG VNDB_DUMP_URL=https://dl.vndb.org/dump/vndb-db-latest.tar.zst

RUN mkdir -p /app/data
COPY package.json ./
COPY scripts ./scripts
COPY src/lib/relations.ts ./src/lib/relations.ts
COPY src/lib/roles.ts ./src/lib/roles.ts
COPY src/lib/types.ts ./src/lib/types.ts

RUN if [ "$BUILD_DB" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends curl ca-certificates zstd && rm -rf /var/lib/apt/lists/* && \
      VNDB_DATA_DIR=/app/data VNDB_DB_PATH=/app/data/vndb.sqlite VNDB_DUMP_URL="$VNDB_DUMP_URL" \
      node --experimental-strip-types scripts/refresh-dump.ts && \
      VNDB_DATA_DIR=/app/data VNDB_DB_PATH=/app/data/vndb.sqlite \
      node --experimental-strip-types scripts/build-db.ts --clean; \
    fi

# ── Stage 3: Minimal production runtime ──
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates zstd && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    VNDB_DB_PATH=/app/data/vndb.sqlite \
    PROTOCOL_HEADER=x-forwarded-proto \
    HOST_HEADER=x-forwarded-host \
    ADDRESS_HEADER=x-forwarded-for \
    XFF_DEPTH=1

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
# Keep DB parsing scripts + shared relation/role constants so `npm run db:refresh:clean` works inside the container
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/lib/relations.ts ./src/lib/relations.ts
COPY --from=builder /app/src/lib/roles.ts ./src/lib/roles.ts
COPY --from=builder /app/src/lib/types.ts ./src/lib/types.ts
COPY --from=db-builder /app/data ./data

RUN sed -i 's/\r$//' /app/scripts/docker-entrypoint.sh && chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-3000}/api/health || exit 1

ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
