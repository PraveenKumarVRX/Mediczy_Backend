#!/usr/bin/env bash
# Daily AI Scribe functional test runner
# Invoked by cron:  0 6 * * * /home/ubuntu/Mediczy/server/tests/run-scribe-test.sh >> /home/ubuntu/Mediczy/logs/scribe-cron.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SERVER_DIR/../logs"
mkdir -p "$LOG_DIR"

echo "========================================"
echo "  Scribe Functional Test — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

# Load environment inside cron (cron doesn't source .env)
if [[ -f "$SERVER_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SERVER_DIR/.env"
  set +a
fi

cd "$SERVER_DIR"

# Run test (server uses "type": "module" — Node 22 handles ESM natively)
exec node "$SCRIPT_DIR/scribe-functional.test.js"
