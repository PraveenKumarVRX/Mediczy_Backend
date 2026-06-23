#!/bin/sh
# Poll Orthanc for new instances and forward to Mediczy HyperGrid STOW-RS.
# For production, prefer Orthanc Lua webhook → POST /api/orthanc/webhook

ORTHANC_URL="${ORTHANC_URL:-http://orthanc:8042}"
MEDICZY_API_URL="${MEDICZY_API_URL:-http://host.docker.internal:8888}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-30}"
AUTH="-u orthanc:orthanc"
SECRET_HDR=""
[ -n "$ORTHANC_WEBHOOK_SECRET" ] && SECRET_HDR="-H x-orthanc-secret: $ORTHANC_WEBHOOK_SECRET"

echo "[orthanc-bridge] polling $ORTHANC_URL → $MEDICZY_API_URL every ${POLL_INTERVAL_SEC}s"

LAST_CHANGE=0

while true; do
  CHANGE=$(curl -sf $AUTH "$ORTHANC_URL/system" | sed -n 's/.*"LastChange"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
  if [ -n "$CHANGE" ] && [ "$CHANGE" != "$LAST_CHANGE" ]; then
    echo "[orthanc-bridge] change detected ($CHANGE)"
    INSTANCES=$(curl -sf $AUTH "$ORTHANC_URL/instances?since=$LAST_CHANGE" 2>/dev/null || curl -sf $AUTH "$ORTHANC_URL/instances")
    for ID in $INSTANCES; do
      [ -z "$ID" ] && continue
      ID=$(echo "$ID" | tr -d '[],"')
      curl -sf -X POST $SECRET_HDR \
        -H "Content-Type: application/json" \
        -d "{\"Event\":\"NewInstance\",\"ID\":\"$ID\"}" \
        "$MEDICZY_API_URL/api/orthanc/webhook" && echo " synced $ID" || echo " failed $ID"
    done
    LAST_CHANGE=$CHANGE
  fi
  sleep "$POLL_INTERVAL_SEC"
done
