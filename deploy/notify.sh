#!/usr/bin/env bash
#
# Deployment notification helper.
#
# Sends a short status line to Slack (SLACK_WEBHOOK_URL) and/or a generic
# webhook (WEBHOOK_ALERT_URL — the same generic alert sink the backend already
# reads from its .env). It is a no-op that exits 0 when neither is configured,
# so CD can call it unconditionally.
#
# Usage:
#   deploy/notify.sh <success|failure|info> "<message>"
set -uo pipefail

STATUS="${1:-info}"
MESSAGE="${2:-}"
ENVIRONMENT="${DEPLOY_ENV:-unknown}"

emoji="ℹ️"
case "${STATUS}" in
  success) emoji="✅" ;;
  failure) emoji="🔴" ;;
esac

text="${emoji} NEPA deploy [${ENVIRONMENT}] ${STATUS}: ${MESSAGE}"
# Minimal JSON string escaping (backslash + double-quote).
escaped="$(printf '%s' "${text}" | sed 's/\\/\\\\/g; s/"/\\"/g')"

sent=0
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  if curl -fsS -X POST -H 'Content-type: application/json' \
       --data "{\"text\":\"${escaped}\"}" "${SLACK_WEBHOOK_URL}" >/dev/null; then
    sent=1
  fi
fi
if [ -n "${WEBHOOK_ALERT_URL:-}" ]; then
  if curl -fsS -X POST -H 'Content-type: application/json' \
       --data "{\"status\":\"${STATUS}\",\"environment\":\"${ENVIRONMENT}\",\"message\":\"${escaped}\"}" \
       "${WEBHOOK_ALERT_URL}" >/dev/null; then
    sent=1
  fi
fi

if [ "${sent}" -eq 1 ]; then
  echo "notification sent: ${text}"
else
  echo "no webhook configured — notification skipped: ${text}"
fi
exit 0
