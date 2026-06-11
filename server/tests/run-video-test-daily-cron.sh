#!/usr/bin/env bash
# Wrapper for scheduled LiveKit Cloud video E2E checks.
# Loads credentials from an env file, runs the daily test, and optionally alerts on failure.

set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
SERVER_DIR="$ROOT_DIR/server"
TEST_SCRIPT="$SERVER_DIR/tests/run-video-test-daily.sh"
LOG_DIR="$ROOT_DIR/logs"
WRAPPER_LOG="$LOG_DIR/video-test-cron-wrapper.log"

# Override with: VIDEO_TEST_ENV_FILE=/path/to/env
ENV_FILE="${VIDEO_TEST_ENV_FILE:-/etc/mediczy/video-test.env}"
# Optional webhook (Slack/Teams/Discord): VIDEO_TEST_ALERT_WEBHOOK=https://...
ALERT_WEBHOOK="${VIDEO_TEST_ALERT_WEBHOOK:-}"

mkdir -p "$LOG_DIR"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*" | tee -a "$WRAPPER_LOG"
}

if [[ ! -x "$TEST_SCRIPT" ]]; then
  log "ERROR: Test script not executable: $TEST_SCRIPT"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: Env file not found: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${VIDEO_TEST_PATIENT_EMAIL:-}" || -z "${VIDEO_TEST_PATIENT_PASSWORD:-}" || -z "${VIDEO_TEST_DOCTOR_EMAIL:-}" || -z "${VIDEO_TEST_DOCTOR_PASSWORD:-}" ]]; then
  log "ERROR: Missing required VIDEO_TEST_* credentials in $ENV_FILE"
  exit 1
fi

log "START: Running daily LiveKit Cloud video E2E"
set +e
bash "$TEST_SCRIPT"
EXIT_CODE=$?
set -e

if [[ "$EXIT_CODE" -eq 0 ]]; then
  log "SUCCESS: Daily video E2E passed"
  exit 0
fi

log "FAIL: Daily video E2E failed (exit=$EXIT_CODE)"

if [[ -n "$ALERT_WEBHOOK" ]]; then
  curl -sS -X POST \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"Mediczy daily LiveKit cloud video test FAILED on $(hostname)\"}" \
    "$ALERT_WEBHOOK" >/dev/null 2>&1 || true
  log "ALERT: Failure webhook attempted"
fi

exit "$EXIT_CODE"
