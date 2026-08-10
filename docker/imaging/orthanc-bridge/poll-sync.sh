#!/bin/sh
# Poll Orthanc for new instances and forward to Mediczy HyperGrid STOW-RS.
# For production, prefer Orthanc Lua webhook → POST /api/orthanc/webhook
#
# Uses Orthanc's /changes API (sequence-based change feed), not /system —
# /system has no "LastChange" field, so a naive grep against it never matches.

ORTHANC_URL="${ORTHANC_URL:-http://orthanc:8042}"
MEDICZY_API_URL="${MEDICZY_API_URL:-http://host.docker.internal:8888}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-30}"
ORTHANC_USER="${ORTHANC_USER:-pacs}"

if [ -z "${ORTHANC_PASSWORD:-}" ]; then
  echo "[orthanc-bridge] FATAL: ORTHANC_PASSWORD is required (no default credentials)" >&2
  exit 1
fi

AUTH="-u ${ORTHANC_USER}:${ORTHANC_PASSWORD}"
SECRET_HDR=""
[ -n "$ORTHANC_WEBHOOK_SECRET" ] && SECRET_HDR="-H x-orthanc-secret: $ORTHANC_WEBHOOK_SECRET"

echo "[orthanc-bridge] polling $ORTHANC_URL → $MEDICZY_API_URL every ${POLL_INTERVAL_SEC}s (user=$ORTHANC_USER)"

SINCE=0

while true; do
  DONE=false
  while [ "$DONE" != "true" ]; do
    RESP=$(curl -sf $AUTH "$ORTHANC_URL/changes?since=$SINCE&limit=100")
    if [ -z "$RESP" ]; then
      echo "[orthanc-bridge] /changes query failed, will retry next cycle" >&2
      break
    fi

    IDS=$(echo "$RESP" | awk -F'"' '
      $2=="ChangeType" { ct=$4 }
      $2=="ID" { id=$4 }
      /^[[:space:]]*\}/ { if (ct=="NewInstance" && id!="") print id; ct=""; id="" }
    ')

    for ID in $IDS; do
      curl -sf -X POST $SECRET_HDR \
        -H "Content-Type: application/json" \
        -d "{\"Event\":\"NewInstance\",\"ID\":\"$ID\"}" \
        "$MEDICZY_API_URL/api/orthanc/webhook" >/dev/null \
        && echo "[orthanc-bridge] synced $ID" \
        || echo "[orthanc-bridge] failed $ID" >&2
    done

    NEW_LAST=$(echo "$RESP" | sed -n 's/.*"Last"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
    DONE=$(echo "$RESP" | sed -n 's/.*"Done"[[:space:]]*:[[:space:]]*\([a-z]*\).*/\1/p' | head -1)
    [ -n "$NEW_LAST" ] && SINCE="$NEW_LAST"
    [ -z "$DONE" ] && DONE="true"
  done
  sleep "$POLL_INTERVAL_SEC"
done
