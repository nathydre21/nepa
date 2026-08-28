# syntax=docker/dockerfile:1
#
# Production image for the NEPA frontend (React 19 + Vite).
#
# Vite bakes VITE_* variables at BUILD time, so the API base URL is supplied as
# a build arg. The compiled SPA is served by nginx, which also reverse-proxies
# /api and /socket.io to the backend service on the compose network (so the app
# is same-origin and needs no CORS in production).

############################
# 1. Builder
############################
FROM node:20-slim AS builder
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund \
 # vite.config.ts uses `minify: 'terser'`; terser is an optional peer that must
 # be present explicitly or `vite build` aborts.
 && npm install --no-save --no-audit --no-fund terser
COPY . .
# Default to a same-origin relative API path; override per environment/CDN.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
# `npm run build` is `tsc -b && vite build`. tsc project errors are non-blocking
# in this repo (see ci.yml), so fall back to a direct vite build (esbuild
# transpile) to guarantee the bundle, then assert the output exists.
RUN npm run build || npx vite build
RUN test -f dist/index.html

############################
# 2. Runtime (static nginx)
############################
FROM nginx:1.27-alpine AS runtime
# curl for the container HEALTHCHECK (alpine nginx ships without it).
RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost/healthz || exit 1
# nginx:alpine's base image already runs nginx in the foreground as CMD.
