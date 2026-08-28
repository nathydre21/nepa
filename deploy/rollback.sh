#!/usr/bin/env bash
#
# Manual rollback of the NEPA stack to a specific, previously-deployed tag.
# Use when a bad release was already promoted and you know the last good tag
# (image tags are the git short-SHA or release tag produced by the CD pipeline;
# `docker inspect --format '{{ index .Config.Labels "nepa.image.tag" }}'
# nepa-backend` shows what is running now).
#
# Usage:
#   deploy/rollback.sh <environment> <image_tag>
set -euo pipefail

ENVIRONMENT="${1:?usage: deploy/rollback.sh <environment> <image_tag>}"
TAG="${2:?usage: deploy/rollback.sh <environment> <image_tag>}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
HEALTH_URL="${HEALTH_URL:-http://localhost:${FRONTEND_PORT}/health}"
VERIFY_TIMEOUT="${VERIFY_TIMEOUT:-90}"

log() { printf '%s [rollback] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [ ! -f .env ]; then
  log "ERROR: .env not found next to ${COMPOSE_FILE}"
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set — refusing to deploy}"

log "Rolling ${ENVIRONMENT} back to ${TAG}"
export IMAGE_TAG="${TAG}"
docker compose -f "${COMPOSE_FILE}" pull --quiet backend frontend || true
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --wait
bash backend/scripts/verify-deployment.sh "${HEALTH_URL}" "${VERIFY_TIMEOUT}"
log "✅ Rollback complete → ${TAG}"
