#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
ENV_FILE="$ROOT_DIR/.env"
LOG_DIR="/var/log/mediczy"

if [ -f "$ENV_FILE" ]; then
	BASE_URL_LINE=$(grep -E '^BASE_URL=' "$ENV_FILE" | tail -n1 || true)
	POSTGRES_PRIMARY_PORT_LINE=$(grep -E '^POSTGRES_PRIMARY_PORT=' "$ENV_FILE" | tail -n1 || true)
	POSTGRES_PORT_LINE=$(grep -E '^POSTGRES_PORT=' "$ENV_FILE" | tail -n1 || true)
	if [ -n "$BASE_URL_LINE" ]; then
		export BASE_URL="${BASE_URL_LINE#BASE_URL=}"
	fi
	if [ -n "$POSTGRES_PRIMARY_PORT_LINE" ]; then
		export POSTGRES_PORT="${POSTGRES_PRIMARY_PORT_LINE#POSTGRES_PRIMARY_PORT=}"
	elif [ -n "$POSTGRES_PORT_LINE" ]; then
		export POSTGRES_PORT="${POSTGRES_PORT_LINE#POSTGRES_PORT=}"
	fi
fi

mkdir -p "$LOG_DIR"

export BASE_URL="${BASE_URL:-http://127.0.0.1:8888}"
if [ -z "${POSTGRES_PORT:-}" ] || [ "${POSTGRES_PORT}" = "6432" ]; then
	export POSTGRES_PORT="5432"
else
	export POSTGRES_PORT
fi
export LOG_DIR

(
	cd "$ROOT_DIR/server"
	node "./sanity-check.js" >> "$LOG_DIR/daily-sanity-check.log" 2>&1
)

bash "$ROOT_DIR/scripts/testing/smoke-test.sh" >> "$LOG_DIR/daily-smoke-test.log" 2>&1
