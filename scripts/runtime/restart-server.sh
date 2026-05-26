#!/usr/bin/env bash
# restart-server.sh — Safe PM2 restart that always picks up .env changes
# Usage: ./restart-server.sh [service-name]
# If no service name given, restarts mediczy-server only.
set -euo pipefail

SERVICE="${1:-mediczy-server}"
ENV_FILE="$(cd "$(dirname "$0")" && pwd)/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2; exit 1
fi

# Source .env into this shell so pm2 --update-env picks them up
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

echo "▶  Restarting $SERVICE (POSTGRES_PORT=${POSTGRES_PORT}, REDIS_URL=${REDIS_URL})"
pm2 restart "$SERVICE" --update-env

# Wait for the process to be online
echo "⏳ Waiting for $SERVICE to be online..."
for i in $(seq 1 15); do
  STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
for p in procs:
    if p['name'] == '$SERVICE':
        print(p['pm2_env']['status'])
        break
" 2>/dev/null || echo "unknown")
  if [[ "$STATUS" == "online" ]]; then
    echo "✅ $SERVICE is online"
    break
  fi
  sleep 1
done

# Quick health probe (only for mediczy-server)
if [[ "$SERVICE" == "mediczy-server" ]]; then
  PORT="${PORT:-8888}"
  echo "🔍 Health check on http://localhost:${PORT}/api/health ..."
  sleep 5
  HEALTH=$(curl -sf --max-time 5 "http://localhost:${PORT}/api/health" 2>/dev/null || echo '{"status":"unreachable"}')
  STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
  if [[ "$STATUS" == "healthy" ]]; then
    echo "✅ Health: healthy"
  else
    echo "⚠️  Health: $STATUS"
    echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
  fi
fi

pm2 save --force
