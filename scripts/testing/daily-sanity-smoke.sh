#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
ENV_FILE="$ROOT_DIR/.env"
LOG_DIR="/var/log/mediczy"

if [ -f "$ENV_FILE" ]; then
	# shellcheck disable=SC1090
	set -a
	source "$ENV_FILE"
	set +a
fi

mkdir -p "$LOG_DIR"

export BASE_URL="${BASE_URL:-http://127.0.0.1:8888}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export LOG_DIR

node "$ROOT_DIR/server/sanity-check.js" >> "$LOG_DIR/daily-sanity-check.log" 2>&1
bash "$ROOT_DIR/scripts/testing/smoke-test.sh" >> "$LOG_DIR/daily-smoke-test.log" 2>&1
