#!/usr/bin/env bash
#
# NEPA rolling deployment with an automatic health gate and rollback.
#
# Pulls the requested image tag, applies it in place (docker compose --wait
# blocks on container healthchecks), then runs the repo's own
# backend/scripts/verify-deployment.sh against the end-to-end /health endpoint.
# If either step fails it restores the previously-running image tag and exits
# non-zero, so a bad release never lingers.
#
# Usage:
#   deploy/deploy.sh <environment> <image_tag>
# Environment overrides:
#   COMPOSE_FILE      compose file (default docker-compose.prod.yml)
#   FRONTEND_PORT     published edge port (default 8080)
#   HEALTH_URL        override the health-gate URL entirely
#   VERIFY_TIMEOUT    seconds to hold the health gate open (default 90)
#   ROLLBACK_TAG      explicit fallback tag if none can be auto-detected
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENVIRONMENT="${1:-${DEPLOY_ENV:-staging}}"
NEW_TAG="${2:-${IMAGE_TAG:-latest}}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
HEALTH_URL="${HEALTH_URL:-http://localhost:${FRONTEND_PORT}/health}"
VERIFY_TIMEOUT="${VERIFY_TIMEOUT:-90}"

log() { printf '%s [deploy] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# The compose env_file expects a root .env on the host; load it so both this
# script's guards and compose's ${VAR} interpolation see the same values.
if [ ! -f .env ]; then
  log "ERROR: .env not found next to ${COMPOSE_FILE}"
  log "Copy deploy/.env.${ENVIRONMENT}.example → .env and fill in secrets."
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# Never bring the stack up with a blank database password.
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set — refusing to deploy}"

# Discover the currently-running tag so we can roll back to it.
PREV_TAG="$(docker inspect --format '{{ index .Config.Labels "nepa.image.tag" }}' nepa-backend 2>/dev/null || true)"
PREV_TAG="${PREV_TAG:-${ROLLBACK_TAG:-}}"
log "environment=${ENVIRONMENT} new_tag=${NEW_TAG} previous_tag=${PREV_TAG:-<none>}"

apply() {
  local tag="$1"
  export IMAGE_TAG="${tag}"
  log "Pulling images @ ${tag}"
  docker compose -f "${COMPOSE_FILE}" pull --quiet backend frontend || true
  log "Applying update @ ${tag} (waiting for healthchecks)"
  docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --wait
}

health_gate() {
  log "Health gate → ${HEALTH_URL} (${VERIFY_TIMEOUT}s)"
  bash backend/scripts/verify-deployment.sh "${HEALTH_URL}" "${VERIFY_TIMEOUT}"
}

if apply "${NEW_TAG}" && health_gate; then
  log "✅ Deployment healthy @ ${NEW_TAG}"
  exit 0
fi

log "❌ Deployment @ ${NEW_TAG} failed the health gate"
if [ -n "${PREV_TAG}" ] && [ "${PREV_TAG}" != "${NEW_TAG}" ]; then
  log "↩️  Rolling back to ${PREV_TAG}"
  if apply "${PREV_TAG}" && health_gate; then
    log "✅ Rolled back to ${PREV_TAG}; service restored (the new release was rejected)"
    exit 1
  fi
  log "🔥 Rollback to ${PREV_TAG} ALSO failed — manual intervention required"
  exit 2
fi

log "No previous tag to roll back to — leaving the stack up for inspection"
exit 1
