#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/scripts/testing/.gpu-capacity.env"
LOG_ROOT="$ROOT_DIR/logs/perf"
TS="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$LOG_ROOT/$TS"

MODE="${1:-precheck}"

mkdir -p "$RUN_DIR/raw"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BASE_URL="${BASE_URL:-http://localhost:8888}"
SIB_URL="${SIB_URL:-http://localhost:8001}"
SOAK_MINUTES="${SOAK_MINUTES:-240}"

summary() {
  echo "# GPU Capacity Run Summary" > "$RUN_DIR/summary.md"
  echo "" >> "$RUN_DIR/summary.md"
  echo "- Timestamp: $TS" >> "$RUN_DIR/summary.md"
  echo "- Mode: $MODE" >> "$RUN_DIR/summary.md"
  echo "- Base URL: $BASE_URL" >> "$RUN_DIR/summary.md"
  echo "- SIB URL: $SIB_URL" >> "$RUN_DIR/summary.md"
}

run_precheck() {
  {
    echo "== PM2 Status =="
    pm2 status --no-color || true
    echo
    echo "== API Health =="
    curl -sS "$BASE_URL/api/health" || true
    echo
    echo "== SIB Health =="
    curl -sS "$SIB_URL/health" || true
    echo
    echo "== LiveKit Health =="
    curl -sS http://localhost:7880 || true
    echo
  } > "$RUN_DIR/raw/precheck.txt"

  echo "Precheck completed. See $RUN_DIR/raw/precheck.txt"
}

run_ramp() {
  cat > "$RUN_DIR/raw/ramp-plan.txt" <<EOF
Ramp levels to execute manually with your chosen load tool:
- 25% for 10m
- 50% for 10m
- 75% for 15m
- 100% for 20m
- 125% for 10m (optional)

Recommended tool:
- npx autocannon (endpoint-wise)

Reference runbook:
- docs/testing/GPU_CAPACITY_VALIDATION_RUNBOOK.md
EOF
  echo "Ramp plan scaffolded. See $RUN_DIR/raw/ramp-plan.txt"
}

run_burst() {
  cat > "$RUN_DIR/raw/burst-plan.txt" <<EOF
Burst profile:
- 70% baseline for 5m
- 300% burst for 3m
- 70% recovery for 10m

Track p95/p99 + queue depth every minute.
EOF
  echo "Burst plan scaffolded. See $RUN_DIR/raw/burst-plan.txt"
}

run_soak() {
  cat > "$RUN_DIR/raw/soak-plan.txt" <<EOF
Soak duration: ${SOAK_MINUTES} minutes
Suggested load: 70%-80% of expected peak

Track every 5m:
- p95/p99
- error rate
- queue depth
- fallback count
EOF
  echo "Soak plan scaffolded. See $RUN_DIR/raw/soak-plan.txt"
}

summary

case "$MODE" in
  precheck) run_precheck ;;
  ramp) run_ramp ;;
  burst) run_burst ;;
  soak) run_soak ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Usage: $0 {precheck|ramp|burst|soak}"
    exit 1
    ;;
esac

echo "Run output folder: $RUN_DIR"
