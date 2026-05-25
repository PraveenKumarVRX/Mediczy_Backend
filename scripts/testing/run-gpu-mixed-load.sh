#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/scripts/testing/.gpu-capacity.env"
LOG_ROOT="$ROOT_DIR/logs/perf"
TS="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$LOG_ROOT/$TS"

mkdir -p "$RUN_DIR/raw"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BASE_URL="${BASE_URL:-http://localhost:8888}"
PROFILE="${PROFILE:-clinic-peak}"
VOICE_RPS_TARGET="${VOICE_RPS_TARGET:-25}"
RFQ_RPS_TARGET="${RFQ_RPS_TARGET:-4}"
MIXED_DURATION_SECONDS="${MIXED_DURATION_SECONDS:-600}"
DOCTOR_TOKEN="${DOCTOR_TOKEN:-}"
CRM_TOKEN="${CRM_TOKEN:-}"

VOICE_PAYLOAD_FILE="$ROOT_DIR/scripts/testing/payloads/voice-agent.json"
CRM_PAYLOAD_FILE="$ROOT_DIR/scripts/testing/payloads/crm-rfq.json"

if [[ ! -f "$VOICE_PAYLOAD_FILE" ]]; then
  echo "Missing voice payload: $VOICE_PAYLOAD_FILE"
  exit 1
fi

if [[ ! -f "$CRM_PAYLOAD_FILE" ]]; then
  echo "Missing CRM payload: $CRM_PAYLOAD_FILE"
  exit 1
fi

if [[ -z "$DOCTOR_TOKEN" ]]; then
  echo "DOCTOR_TOKEN is required in scripts/testing/.gpu-capacity.env"
  exit 1
fi

if [[ -z "$CRM_TOKEN" ]]; then
  echo "CRM_TOKEN is required in scripts/testing/.gpu-capacity.env"
  exit 1
fi

case "$PROFILE" in
  clinic-peak)
    VOICE_WEIGHT=45
    RFQ_WEIGHT=10
    ;;
  backoffice-heavy)
    VOICE_WEIGHT=10
    RFQ_WEIGHT=35
    ;;
  emergency-spike)
    VOICE_WEIGHT=60
    RFQ_WEIGHT=5
    ;;
  *)
    echo "Unknown PROFILE: $PROFILE"
    echo "Use one of: clinic-peak, backoffice-heavy, emergency-spike"
    exit 1
    ;;
esac

# Convert target RPS to worker count. Each worker performs about 1 req/sec.
voice_workers=$(( VOICE_RPS_TARGET * VOICE_WEIGHT / 100 ))
rfq_workers=$(( RFQ_RPS_TARGET * RFQ_WEIGHT / 100 ))

if (( voice_workers < 1 )); then voice_workers=1; fi
if (( rfq_workers < 1 )); then rfq_workers=1; fi

VOICE_URL="$BASE_URL/api/voice-assistant/agent"
RFQ_URL="$BASE_URL/api/crm/rfqs"

echo "# Mixed Load Run Summary" > "$RUN_DIR/summary.md"
echo "" >> "$RUN_DIR/summary.md"
echo "- Timestamp: $TS" >> "$RUN_DIR/summary.md"
echo "- Profile: $PROFILE" >> "$RUN_DIR/summary.md"
echo "- Base URL: $BASE_URL" >> "$RUN_DIR/summary.md"
echo "- Duration (s): $MIXED_DURATION_SECONDS" >> "$RUN_DIR/summary.md"
echo "- Voice workers: $voice_workers" >> "$RUN_DIR/summary.md"
echo "- CRM RFQ workers: $rfq_workers" >> "$RUN_DIR/summary.md"

start_epoch="$(date +%s)"
end_epoch=$(( start_epoch + MIXED_DURATION_SECONDS ))

VOICE_OK_FILE="$RUN_DIR/raw/voice-ok.log"
VOICE_ERR_FILE="$RUN_DIR/raw/voice-err.log"
RFQ_OK_FILE="$RUN_DIR/raw/rfq-ok.log"
RFQ_ERR_FILE="$RUN_DIR/raw/rfq-err.log"

touch "$VOICE_OK_FILE" "$VOICE_ERR_FILE" "$RFQ_OK_FILE" "$RFQ_ERR_FILE"

worker_voice() {
  while [[ "$(date +%s)" -lt "$end_epoch" ]]; do
    code="$(curl -sS -o /tmp/voice-mixed-load.out -w "%{http_code}" \
      -X POST "$VOICE_URL" \
      -H "Authorization: Bearer $DOCTOR_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary "@$VOICE_PAYLOAD_FILE" || true)"
    if [[ "$code" == "200" ]]; then
      echo "$code" >> "$VOICE_OK_FILE"
    else
      echo "$code" >> "$VOICE_ERR_FILE"
    fi
    sleep 1
  done
}

worker_rfq() {
  while [[ "$(date +%s)" -lt "$end_epoch" ]]; do
    code="$(curl -sS -o /tmp/rfq-mixed-load.out -w "%{http_code}" \
      -X POST "$RFQ_URL" \
      -H "Authorization: Bearer $CRM_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary "@$CRM_PAYLOAD_FILE" || true)"
    if [[ "$code" == "201" || "$code" == "200" ]]; then
      echo "$code" >> "$RFQ_OK_FILE"
    else
      echo "$code" >> "$RFQ_ERR_FILE"
    fi
    sleep 1
  done
}

pids=()

for _ in $(seq 1 "$voice_workers"); do
  worker_voice &
  pids+=("$!")
done

for _ in $(seq 1 "$rfq_workers"); do
  worker_rfq &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

voice_ok_count="$(wc -l < "$VOICE_OK_FILE" | tr -d ' ')"
voice_err_count="$(wc -l < "$VOICE_ERR_FILE" | tr -d ' ')"
rfq_ok_count="$(wc -l < "$RFQ_OK_FILE" | tr -d ' ')"
rfq_err_count="$(wc -l < "$RFQ_ERR_FILE" | tr -d ' ')"

echo "" >> "$RUN_DIR/summary.md"
echo "## Results" >> "$RUN_DIR/summary.md"
echo "- Voice success: $voice_ok_count" >> "$RUN_DIR/summary.md"
echo "- Voice errors: $voice_err_count" >> "$RUN_DIR/summary.md"
echo "- RFQ success: $rfq_ok_count" >> "$RUN_DIR/summary.md"
echo "- RFQ errors: $rfq_err_count" >> "$RUN_DIR/summary.md"

echo "Mixed load completed."
echo "Run output folder: $RUN_DIR"
