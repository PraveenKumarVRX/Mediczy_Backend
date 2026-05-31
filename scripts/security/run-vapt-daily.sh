#!/usr/bin/env bash
set -u

PROJECT_ROOT="/home/ubuntu/Mediczy"
SERVER_DIR="$PROJECT_ROOT/server"
REPORT_DIR="$PROJECT_ROOT/reports/vapt"
LOG_DIR="$PROJECT_ROOT/logs/vapt"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
REPORT_FILE="$REPORT_DIR/vapt-report-${TIMESTAMP}.md"

API_URL="${API_URL:-http://127.0.0.1:8000}"
REPORT_EMAIL="${REPORT_EMAIL:-sk@mysmarthealth.in}"
FORWARDED_IP="${FORWARDED_IP:-10.88.44.10}"
USER_EMAIL="${USER_EMAIL:-user@mediczy.com}"
USER_PASS="${USER_PASS:-}"

mkdir -p "$REPORT_DIR" "$LOG_DIR"

STARTED_BY_SCRIPT=0
SERVER_PID=""

cleanup() {
  if [[ "$STARTED_BY_SCRIPT" -eq 1 ]] && [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

is_api_up() {
  code="$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" || true)"
  [[ "$code" == "200" ]]
}

if ! is_api_up; then
  START_LOG="$LOG_DIR/server-start-${TIMESTAMP}.log"
  (
    cd "$SERVER_DIR"
    NODE_ENV=production \
    PORT=8000 \
    MQTT_TCP_PORT=18833 \
    MQTT_WS_PORT=88833 \
    DISABLE_KAFKA=true \
    POSTGRES_SSL=true \
    node index.js >"$START_LOG" 2>&1
  ) &
  SERVER_PID="$!"
  STARTED_BY_SCRIPT=1

  for _ in $(seq 1 60); do
    if is_api_up; then
      break
    fi
    sleep 1
  done
fi

{
  echo "# Mediczy Daily VAPT Report"
  echo
  echo "- Timestamp (UTC): $TIMESTAMP"
  echo "- Host: $(hostname)"
  echo "- API URL: $API_URL"
  echo "- Report Email: $REPORT_EMAIL"
  echo
  if is_api_up; then
    echo "- API Health: UP"
  else
    echo "- API Health: DOWN"
  fi
  echo
} > "$REPORT_FILE"

run_section() {
  local title="$1"
  local cmd="$2"

  echo "## $title" >> "$REPORT_FILE"
  echo >> "$REPORT_FILE"
  echo '```text' >> "$REPORT_FILE"
  echo "$ $cmd" >> "$REPORT_FILE"

  set +e
  output="$(bash -lc "$cmd" 2>&1)"
  status=$?
  set -e

  echo "$output" >> "$REPORT_FILE"
  echo "Exit Code: $status" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  echo >> "$REPORT_FILE"
}

set -e

run_section "Ring-Fencing Security" "cd '$PROJECT_ROOT' && API_URL='$API_URL' FORWARDED_IP='$FORWARDED_IP' USER_EMAIL='$USER_EMAIL' USER_PASS='$USER_PASS' STRICT_MODE=false ./scripts/testing/test-ring-fencing.sh"
run_section "Comprehensive Login Security" "cd '$PROJECT_ROOT' && ./scripts/testing/test-comprehensive-login-security.sh"
run_section "Smoke Security Checks" "cd '$PROJECT_ROOT' && BASE_URL='$API_URL' ./scripts/testing/smoke-test.sh"
run_section "Dependency Audit (High+)" "cd '$SERVER_DIR' && npm audit --omit=dev --audit-level=high"
run_section "Endpoint Status Probes" "for p in /health /swagger.json /api-docs /docs /api/circuit-breakers/health /api/circuit-breakers/status /metrics; do code=\$(curl -s -o /dev/null -w '%{http_code}' '$API_URL'\$p); echo \"\$p -> \$code\"; done"

run_section "Email Delivery" "cd '$SERVER_DIR' && node scripts/qa/send-vapt-report-email.mjs --report '$REPORT_FILE' --to '$REPORT_EMAIL' --subject 'Mediczy Daily VAPT Report - $TIMESTAMP'"

echo "VAPT report created: $REPORT_FILE"
