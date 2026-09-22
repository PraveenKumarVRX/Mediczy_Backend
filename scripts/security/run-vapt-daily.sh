#!/usr/bin/env bash
set -u

PROJECT_ROOT="/home/ubuntu/Mediczy"
SERVER_DIR="$PROJECT_ROOT/server"
REPORT_DIR="$PROJECT_ROOT/reports/vapt"
LOG_DIR="$PROJECT_ROOT/logs/vapt"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
REPORT_FILE="$REPORT_DIR/vapt-report-${TIMESTAMP}.md"
PID_FILE="$LOG_DIR/vapt-server.pid"

API_URL="${API_URL:-http://127.0.0.1:8000}"
REPORT_EMAIL="${REPORT_EMAIL:-sk@mysmarthealth.in}"
FORWARDED_IP="${FORWARDED_IP:-10.88.44.10}"
USER_EMAIL="${USER_EMAIL:-user@mediczy.com}"
USER_PASS="${USER_PASS:-}"

mkdir -p "$REPORT_DIR" "$LOG_DIR"

# ── Self-healing: a previous run's test server can be left running if that run was killed
# uncatchably (SIGKILL, an OOM kill, the host itself restarting mid-run) — a plain `trap ... EXIT`
# does not fire in that case, so the leak can't be prevented, only detected and swept up next time.
# Found in production on 2026-09-22: one instance from 2026-09-17 ran undetected for 5.5 days,
# holding ~500MB RAM and 53 connections, and silently duplicating every cron job the app runs
# against the real database — this is what that incident's investigation led to.
reap_stale_instance() {
  local stale_pid=""
  if [[ -f "$PID_FILE" ]]; then
    stale_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  fi
  # Belt-and-suspenders: even with no (or a stale) PID file, find anything still carrying this
  # script's own marker. VAPT_TEST_INSTANCE=1 is an environment variable, not an argument, so it
  # is in /proc/<pid>/environ, not the command line — `pgrep -f` cannot see it; grep environ directly.
  local matched_pids="" pid
  for pid in $(pgrep -f 'node index\.js' 2>/dev/null || true); do
    if tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep -qx 'VAPT_TEST_INSTANCE=1'; then
      matched_pids="$matched_pids $pid"
    fi
  done
  local all_pids
  all_pids="$(printf '%s\n%s\n' "$stale_pid" "$matched_pids" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u || true)"
  if [[ -z "$all_pids" ]]; then
    rm -f "$PID_FILE"
    return 0
  fi
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) reaping stale VAPT test instance(s): $(echo "$all_pids" | tr '\n' ' ')" >> "$LOG_DIR/cron.log"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill -TERM "$pid" 2>/dev/null || true
  done <<< "$all_pids"
  # Give a graceful shutdown a few seconds (the app registers real SIGTERM handlers), then force.
  for _ in $(seq 1 5); do
    sleep 1
    still_alive="false"
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      kill -0 "$pid" 2>/dev/null && still_alive="true"
    done <<< "$all_pids"
    [[ "$still_alive" == "false" ]] && break
  done
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill -KILL "$pid" 2>/dev/null || true
  done <<< "$all_pids"
  rm -f "$PID_FILE"
}
reap_stale_instance

STARTED_BY_SCRIPT=0
SERVER_PID=""

cleanup() {
  if [[ "$STARTED_BY_SCRIPT" -eq 1 ]] && [[ -n "$SERVER_PID" ]]; then
    kill -TERM "$SERVER_PID" >/dev/null 2>&1 || true
    for _ in $(seq 1 5); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 1
    done
    kill -0 "$SERVER_PID" 2>/dev/null && kill -KILL "$SERVER_PID" >/dev/null 2>&1 || true
    rm -f "$PID_FILE"
  fi
}
# EXIT alone does not run on SIGKILL (uncatchable) or if this script's own parent/session is torn
# down abruptly — reap_stale_instance() above is the real backstop for that case, not this trap.
# Explicit INT/TERM/HUP are also trapped so an operator- or systemd-issued termination signal cleans
# up right away — but a trap handler for a *signal* does not itself end the script (unlike the
# untrapped default, which would), so terminate_now must call exit explicitly, or this script would
# clean up its child and then carry on running the rest of the VAPT suite regardless of the signal.
terminate_now() { cleanup; exit 143; }
trap cleanup EXIT
trap terminate_now INT TERM HUP

is_api_up() {
  code="$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" || true)"
  [[ "$code" == "200" ]]
}

if ! is_api_up; then
  START_LOG="$LOG_DIR/server-start-${TIMESTAMP}.log"
  (
    cd "$SERVER_DIR"
    # VAPT_TEST_INSTANCE=1 is this instance's marker (see reap_stale_instance above) — it does
    # nothing at runtime, it exists purely so a future run can recognise and reap this one if it
    # leaks. `exec` replaces this subshell with the node process itself, so $! below is the real
    # server PID, not a wrapper subshell's PID — killing a wrapper subshell does not reliably kill
    # the child it wraps in a non-interactive (job-control-off) script, which is what actually let
    # the 2026-09-17 instance survive its own cleanup() trap.
    VAPT_TEST_INSTANCE=1 \
    NODE_ENV=production \
    PORT=8000 \
    MQTT_TCP_PORT=18833 \
    MQTT_WS_PORT=88833 \
    DISABLE_KAFKA=true \
    POSTGRES_SSL=true \
    exec node index.js >"$START_LOG" 2>&1
  ) &
  SERVER_PID="$!"
  STARTED_BY_SCRIPT=1
  echo "$SERVER_PID" > "$PID_FILE"

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
