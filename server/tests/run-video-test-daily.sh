#!/bin/bash
# ─────────────────────────────────────────────────────────
# Mediczy Daily Video Call E2E Test
# Runs the full patient↔doctor video consultation test
# and logs results. Designed for cron scheduling.
#
# Setup:
#   chmod +x /home/ubuntu/Mediczy/server/tests/run-video-test-daily.sh
#   # Add to crontab (runs daily at 6:00 AM IST = 00:30 UTC):
#   crontab -e
#   30 0 * * * /home/ubuntu/Mediczy/server/tests/run-video-test-daily.sh
#
# Manual run:
#   /home/ubuntu/Mediczy/server/tests/run-video-test-daily.sh
# ─────────────────────────────────────────────────────────

set -euo pipefail

LOG_DIR="/home/ubuntu/Mediczy/logs"
LOG_FILE="$LOG_DIR/video-e2e-test-$(date +%Y%m%d).log"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

mkdir -p "$LOG_DIR"

echo "═══════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "  Video E2E Test — $(date '+%Y-%m-%d %H:%M:%S %Z')" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════" | tee -a "$LOG_FILE"

# Ensure backend is running
if ! curl -sf http://localhost:8888/api/health > /dev/null 2>&1; then
  echo "❌ Backend not responding on :8888. Aborting." | tee -a "$LOG_FILE"
  exit 1
fi

# Ensure LiveKit is running
if ! curl -sf http://localhost:7880 > /dev/null 2>&1; then
  echo "❌ LiveKit not responding on :7880. Aborting." | tee -a "$LOG_FILE"
  exit 1
fi

# Run the E2E test
cd "$SERVER_DIR"
NODE_OUTPUT=$(node tests/video-e2e-test.mjs 2>&1) || true
echo "$NODE_OUTPUT" | tee -a "$LOG_FILE"

# Extract result line
RESULT_LINE=$(echo "$NODE_OUTPUT" | grep "RESULTS:" || echo "")

if echo "$RESULT_LINE" | grep -q "0 failed"; then
  echo "" | tee -a "$LOG_FILE"
  echo "✅ DAILY VIDEO TEST PASSED — $(date '+%H:%M:%S')" | tee -a "$LOG_FILE"
  EXIT_CODE=0
else
  echo "" | tee -a "$LOG_FILE"
  echo "❌ DAILY VIDEO TEST FAILED — $(date '+%H:%M:%S')" | tee -a "$LOG_FILE"
  echo "   Review: $LOG_FILE" | tee -a "$LOG_FILE"
  EXIT_CODE=1
fi

# Rotate logs: keep last 30 days
find "$LOG_DIR" -name "video-e2e-test-*.log" -mtime +30 -delete 2>/dev/null || true

exit $EXIT_CODE
