#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${CRM_API_BASE_URL:-http://localhost:8888}"
ROUTES=(
  "/api/crm/v2/funnel"
  "/api/crm/worldclass/dashboards/business-head"
  "/api/crm/growth/dashboard"
  "/api/crm/communication-hub/dashboard"
)

for route in "${ROUTES[@]}"; do
  status=""
  for attempt in $(seq 1 15); do
    status="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_URL}${route}" || true)"
    [[ "$status" == "401" ]] && break
    [[ "$attempt" -lt 15 ]] && sleep 2
  done
  if [[ "$status" != "401" ]]; then
    echo "CRM API contract failed: ${route} returned HTTP ${status:-unavailable}; expected 401 for an unauthenticated request." >&2
    exit 1
  fi
  echo "✓ ${route} is mounted (401 unauthenticated)"
done
