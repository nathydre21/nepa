# syntax=docker/dockerfile:1
#
# Production image for the NEPA backend (Express + Socket.IO + Prisma).
#
# Entry point is server.ts → dist/server.js listening on PORT (default 3001)
# with a GET /health endpoint and SIGTERM/SIGINT graceful shutdown.
#
# Debian-slim (not alpine) is deliberate: several dependencies ship native
# addons — most notably @tensorflow/tfjs-node — whose prebuilt binaries target
# glibc. Building on musl (alpine) forces a fragile from-source compile.

############################
# 1. Production node_modules
############################
FROM node:20-slim AS deps-prod
ENV NODE_ENV=production
WORKDIR /app
# Toolchain for any dependency that has to compile a native addon.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# No committed lockfile inside backend/ (the root npm workspace owns it), so a
# plain install is required rather than `npm ci`.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

############################
# 2. Builder (full deps + prisma client + tsc)
############################
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
# Generate the Prisma client (schema lives at the backend root, not prisma/).
RUN npx prisma generate --schema=./schema.prisma
# Compile TS → dist/. The repo tsconfig sets noEmit:false and does NOT set
# noEmitOnError, so tsc still emits runnable JS while reporting the type
# warnings that ci.yml treats as non-blocking. We therefore tolerate a non-zero
# tsc exit but assert the entry point was actually emitted.
RUN npm run build || echo "tsc reported type warnings (non-blocking) — verifying emit"
RUN test -f dist/server.js

############################
# 3. Runtime
############################
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
# tini → correct PID 1 signal forwarding so server.ts's SIGTERM handler runs.
# curl → container HEALTHCHECK probe.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system nepa \
 && useradd --system --gid nepa --home-dir /app --shell /usr/sbin/nologin nepa
# Production dependencies …
COPY --from=deps-prod /app/node_modules ./node_modules
# … plus the generated Prisma client (lives in node_modules/.prisma).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/schema.prisma ./schema.prisma
COPY package.json ./
USER nepa
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
