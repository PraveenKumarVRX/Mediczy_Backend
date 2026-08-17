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
# Kept as a single header VALUE (not a "-H value" pair) and always quoted at
# the call site below — the previous "-H x-orthanc-secret: $SECRET" form,
# used unquoted in the curl call, got word-split on the space inside the
# header value, so curl sent "x-orthanc-secret:" with an empty value no
# matter what the real secret was. Every webhook call 401'd silently.
SECRET_HDR_VALUE="x-orthanc-secret: ${ORTHANC_WEBHOOK_SECRET:-}"

STATE_FILE="${STATE_FILE:-/state/since.txt}"
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null

echo "[orthanc-bridge] polling $ORTHANC_URL → $MEDICZY_API_URL every ${POLL_INTERVAL_SEC}s (user=$ORTHANC_USER)"

# Resume from the last processed change sequence instead of re-walking the
# entire Orthanc history from 0 on every container restart — with tens of
# thousands of already-synced instances, a from-scratch replay can take
# hours before it even reaches genuinely new changes, which looks like a
# stalled/broken sync even though it's just re-confirming old ground.
if [ -f "$STATE_FILE" ]; then
  SINCE="$(cat "$STATE_FILE" 2>/dev/null)"
  case "$SINCE" in ''|*[!0-9]*) SINCE=0 ;; esac
  echo "[orthanc-bridge] resuming from saved cursor: $SINCE"
else
  SINCE=0
fi

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
      curl -sf -X POST -H "$SECRET_HDR_VALUE" \
        -H "Content-Type: application/json" \
        -d "{\"Event\":\"NewInstance\",\"ID\":\"$ID\"}" \
        "$MEDICZY_API_URL/api/orthanc/webhook" >/dev/null \
        && echo "[orthanc-bridge] synced $ID" \
        || echo "[orthanc-bridge] failed $ID" >&2
    done

    NEW_LAST=$(echo "$RESP" | sed -n 's/.*"Last"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
    DONE=$(echo "$RESP" | sed -n 's/.*"Done"[[:space:]]*:[[:space:]]*\([a-z]*\).*/\1/p' | head -1)
    [ -n "$NEW_LAST" ] && SINCE="$NEW_LAST" && echo "$SINCE" > "$STATE_FILE" 2>/dev/null
    [ -z "$DONE" ] && DONE="true"
  done
  sleep "$POLL_INTERVAL_SEC"
done
