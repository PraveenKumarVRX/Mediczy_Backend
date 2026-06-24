#!/usr/bin/env bash
# Run Hospital OS demo on native PostgreSQL + Redis + Node (no Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_URL="${API_URL:-http://localhost:8000}"
BASE_URL="${BASE_URL:-http://localhost:9443}"

echo "==> Mediqzy Hospital OS — local demo (no Docker)"
echo "    API:  $API_URL"
echo "    UI:   $BASE_URL"

# Start native services if available
if command -v service >/dev/null 2>&1; then
  sudo service postgresql start 2>/dev/null || true
  sudo service redis-server start 2>/dev/null || true
fi

echo "==> Bootstrapping database + dummy data..."
cd "$ROOT/server"
node scripts/demo/bootstrap-hospital-os-db.mjs

echo "==> Starting backend (tmux: hospital-api)..."
SESSION_API="hospital-api"
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_API" 2>/dev/null || \
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_API" -c "$ROOT/server" -- "${SHELL:-bash}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_API:0.0" "cd $ROOT/server && npm run dev" C-m

echo "==> Starting frontend (tmux: hospital-ui)..."
SESSION_UI="hospital-ui"
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_UI" 2>/dev/null || \
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_UI" -c "$ROOT/client" -- "${SHELL:-bash}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_UI:0.0" "cd $ROOT/client && npm run dev" C-m

echo "==> Waiting for servers..."
for i in $(seq 1 30); do
  curl -sf "$API_URL/health" >/dev/null 2>&1 && curl -sf "$BASE_URL/" >/dev/null 2>&1 && break
  sleep 2
done

echo "==> Verifying demo flow..."
cd "$ROOT/tests"
node scripts/verify-hospital-os-flow.mjs

if [[ "${RECORD:-1}" == "1" ]]; then
  echo "==> Recording FULL Hospital OS demo (all flows)..."
  mkdir -p /opt/cursor/artifacts/hospital-os-demo
  LIVE_MODE=1 BASE_URL="$BASE_URL" API_URL="$API_URL" \
    DEMO_OUTPUT_DIR=/opt/cursor/artifacts/hospital-os-demo \
    node "$ROOT/tests/scripts/record-hospital-os-full-demo.mjs" || \
  LIVE_MODE=1 BASE_URL="$BASE_URL" API_URL="$API_URL" \
    DEMO_OUTPUT_DIR=/opt/cursor/artifacts/hospital-os-demo \
    node "$ROOT/scripts/demo/record-hospital-os-full-demo.mjs"
  echo "✅ Full demo: /opt/cursor/artifacts/hospital-os-demo/mediqzy-hospital-os-full-demo.mp4"
fi

echo ""
echo "Demo URLs:"
echo "  Kiosk:     $BASE_URL/kiosk/checkin"
echo "  Queue:     $BASE_URL/display/queue?zone=opd-waiting"
echo "  Hospital:  $BASE_URL/hospital/login  (hospital@mediczy.com / Hospital123)"
echo "  Workspace: $BASE_URL/hmis/patient/1/workspace"
echo "  Discharge: $BASE_URL/hmis/admission/1/discharge"
