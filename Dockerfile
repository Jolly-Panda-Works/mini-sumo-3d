# syntax=docker/dockerfile:1
#
# Mini Sumo in one container: the game server (Colyseus + economy API, SQLite) also serves
# the web game, so the page, the API, matchmaking and the game websockets share one port.
#
#   docker compose up -d --build        -> http://<host>:6803
#
# Built for networks with restricted access (e.g. Iran):
#   * Base image through a Docker Hub mirror (REGISTRY build arg; Docker Hub refuses
#     Iranian IPs). Default: Arvan Cloud's mirror. Alternatives in .env.docker.example.
#   * npm can use a mirror (NPM_REGISTRY), retries slow downloads; build proxies pass through.
#   * No apk installs at all (no native modules: SQLite is built into Node 22).

ARG REGISTRY=docker.arvancloud.ir
ARG NODE_IMAGE=${REGISTRY}/node:22-alpine

# ---------------------------------------------------------------- npm settings + manifests
FROM ${NODE_IMAGE} AS base
ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG NO_PROXY
ARG no_proxy
ENV npm_config_registry=${NPM_REGISTRY} \
    npm_config_fetch_retries=6 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=180000 \
    npm_config_fetch_timeout=600000 \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false \
    npm_config_loglevel=warn
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/

# ---------------------------------------------------------------- build shared, server and web game
FROM base AS build
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/client apps/client
# The web game finds the server on the same address as the page.
ARG VITE_SERVER_URL=same-origin
ARG VITE_NETWORK_MODE=auto
ARG VITE_APP_VERSION
ENV VITE_SERVER_URL=${VITE_SERVER_URL} \
    VITE_NETWORK_MODE=${VITE_NETWORK_MODE} \
    VITE_APP_VERSION=${VITE_APP_VERSION} \
    VITE_BASE=/
RUN npm run build:shared \
 && npm run build -w @mini-sumo/server \
 && npm run build -w @mini-sumo/client

# ---------------------------------------------------------------- production dependencies only
FROM base AS deps
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev -w @mini-sumo/server -w @mini-sumo/shared; \
    else \
      npm install --omit=dev -w @mini-sumo/server -w @mini-sumo/shared; \
    fi

# ---------------------------------------------------------------- the image
FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=80 \
    DATABASE_PATH=/data/mini-sumo.db \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/client/dist ./public
# The database lives in a volume and survives rebuilds.
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||80)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
