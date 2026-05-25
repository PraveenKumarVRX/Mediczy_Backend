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

# Load server env for Redis credentials and other runtime settings.
if [ -f "$SERVER_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$SERVER_DIR/.env"
  set +a
fi

mkdir -p "$LOG_DIR"

echo "═══════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "  Video E2E Test — $(date '+%Y-%m-%d %H:%M:%S %Z')" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════" | tee -a "$LOG_FILE"

# Ensure backend is running
if ! curl -sf http://localhost:8888/api/health > /dev/null 2>&1; then
  echo "❌ Backend not responding on :8888. Aborting." | tee -a "$LOG_FILE"
  exit 1
fi

cd "$SERVER_DIR"

# Ensure LiveKit is running
if ! curl -sf http://localhost:7880 > /dev/null 2>&1; then
  echo "❌ LiveKit not responding on :7880. Aborting." | tee -a "$LOG_FILE"
  exit 1
fi

# Clear local credential-stuffing guard counters for cron-run localhost checks.
# This avoids false negatives when prior failed attempts temporarily block ::1/127.0.0.1.
node --input-type=module >/dev/null 2>&1 <<'NODE' || true
import Redis from 'ioredis';
const r = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false,
  maxRetriesPerRequest: 1,
});
const ips = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const levels = ['short', 'medium', 'long'];
const keys = new Set();
for (const ip of ips) {
  keys.add(`csguard:blocked:${ip}`);
  for (const level of levels) keys.add(`csguard:fails:${level}:${ip}`);

  // express-rate-limit (Redis store) keys for authLimiter
  const patterns = [
    `rl:*${ip}*`,
    `rl:*ip:${ip}*`,
  ];
  for (const pattern of patterns) {
    const matched = await r.keys(pattern).catch(() => []);
    for (const key of matched) keys.add(key);
  }
}
if (keys.size > 0) await r.del(...Array.from(keys)).catch(() => {});
await r.quit().catch(() => {});
NODE

# Run the E2E test
set +e
NODE_OUTPUT=$(node tests/video-e2e-test.mjs 2>&1)
TEST_EXIT_CODE=$?
set -e
echo "$NODE_OUTPUT" | tee -a "$LOG_FILE"

if [ "$TEST_EXIT_CODE" -eq 0 ]; then
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
