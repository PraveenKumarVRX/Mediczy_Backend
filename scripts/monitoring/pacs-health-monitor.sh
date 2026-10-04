#!/usr/bin/env bash
#
# PACS / imaging health monitor + alert.
#
# Written after the 2026-09-21 outage, in which DICOM ingest stopped for 13 days and nobody
# noticed. Each check below maps to something that actually failed then:
#
#   ingest freshness   -> no instance had arrived since 2026-09-21 03:07
#   wireguard peer     -> the site's tunnel (peer 10.99.0.3) died 2026-09-21 20:21
#   storage read-back  -> 351k instances were archived to MinIO and DELETED from S3, so Orthanc
#                         answered "object not found" and every webhook push 500'd
#   orthanc / bridge   -> would catch the simpler case of the PACS itself being down
#
# Alerts by SMTP, reusing the credentials the other monitoring scripts read from
# scripts/video-smoke-test.sh. Flap control: mails on the transition into trouble, again every
# REMIND_HOURS while still broken, and once on recovery — not on every run.
#
# Exit: 0 healthy, 1 warnings only, 2 critical.
#
# Cron (hourly):
#   0 * * * * /usr/bin/flock -n /tmp/pacs-health.lock /bin/bash \
#     /home/ubuntu/Mediczy/scripts/monitoring/pacs-health-monitor.sh \
#     >> /home/ubuntu/Mediczy/logs/pacs-health.log 2>&1
set -uo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
SMTP_REF="$ROOT_DIR/scripts/video-smoke-test.sh"
STATE_FILE="${PACS_MONITOR_STATE:-/var/tmp/pacs-health-state}"
LOG_PREFIX="[pacs-health]"

INGEST_MAX_HOURS="${INGEST_MAX_HOURS:-24}"     # alert if no DICOM for this long
WG_MAX_MINUTES="${WG_MAX_MINUTES:-60}"         # alert if the imaging peer handshake is older
WG_IMAGING_PEER="${WG_IMAGING_PEER:-10.99.0.3}"
REMIND_HOURS="${REMIND_HOURS:-24}"             # re-send while still broken
ORTHANC_HTTP="${ORTHANC_HTTP:-http://localhost:8042}"

CRIT=(); WARN=(); INFO=()
add_crit() { CRIT+=("$1"); }
add_warn() { WARN+=("$1"); }
add_info() { INFO+=("$1"); }

# ── 1. Orthanc HTTP alive ────────────────────────────────────────────────────────────────────
# 401 counts as alive: Orthanc requires auth, so any HTTP status means the server answered.
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$ORTHANC_HTTP/system" || echo 000)"
if [ "$code" = "000" ]; then
  add_crit "Orthanc HTTP ($ORTHANC_HTTP) is not responding"
else
  add_info "Orthanc HTTP responding (status $code)"
fi

# ── 2. DICOM C-STORE port listening ──────────────────────────────────────────────────────────
if ss -lnt 2>/dev/null | grep -q ':4242 '; then
  add_info "DICOM port 4242 listening"
else
  add_crit "DICOM port 4242 is NOT listening"
fi

# ── 3. bridge container ──────────────────────────────────────────────────────────────────────
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^mediczy-orthanc-bridge$'; then
  add_info "orthanc-bridge container running"
else
  add_warn "orthanc-bridge container is NOT running (instances will not reach the app)"
fi

# ── 4. WireGuard imaging peer ────────────────────────────────────────────────────────────────
# `wg show` needs privilege; if we cannot read it, say so rather than silently passing.
wg_dump="$(sudo -n wg show all dump 2>/dev/null)"
if [ -z "$wg_dump" ]; then
  add_warn "cannot read WireGuard state (sudo -n wg show failed) — peer health unknown"
else
  # dump columns: iface pubkey psk endpoint allowed-ips latest-handshake rx tx keepalive
  peer_line="$(echo "$wg_dump" | awk -v ip="$WG_IMAGING_PEER" '$5 ~ ip {print; exit}')"
  if [ -z "$peer_line" ]; then
    add_warn "WireGuard peer for $WG_IMAGING_PEER not found in config"
  else
    hs="$(echo "$peer_line" | awk '{print $6}')"
    if [ "${hs:-0}" = "0" ]; then
      add_crit "WireGuard peer $WG_IMAGING_PEER has NEVER handshaken"
    else
      age_min=$(( ( $(date +%s) - hs ) / 60 ))
      if [ "$age_min" -gt "$WG_MAX_MINUTES" ]; then
        add_crit "WireGuard peer $WG_IMAGING_PEER last handshake ${age_min} min ago (>${WG_MAX_MINUTES}) — the site tunnel is down, no images can arrive"
      else
        add_info "WireGuard peer $WG_IMAGING_PEER handshake ${age_min} min ago"
      fi
    fi
  fi
fi

# ── 5. ingest freshness + 6. storage read-back (both need the DB helper) ─────────────────────
# NOTE the character class: keys include digits (INSTANCES_24H, INSTANCES_7D). An [A-Z_]+ class
# silently dropped them, which is exactly the kind of quiet omission a monitor must not have.
fresh="$(cd "$ROOT_DIR/server" && node scripts/ssm-env-loader.mjs scripts/ops/pacs-ingest-freshness.mjs 2>/dev/null | grep -E '^[A-Z0-9_]+=')"
# Read values by key instead of eval'ing the block: no quoting hazards, and a missing key yields
# an empty string rather than tripping `set -u` halfway through the checks.
fval() { echo "$fresh" | grep -m1 "^$1=" | cut -d= -f2-; }
if [ -z "$fresh" ]; then
  add_crit "could not read ingest freshness from the database"
else
  DB_OK="$(fval DB_OK)"; DB_ERROR="$(fval DB_ERROR)"
  INSTANCES_TOTAL="$(fval INSTANCES_TOTAL)"; INSTANCES_24H="$(fval INSTANCES_24H)"
  INSTANCES_7D="$(fval INSTANCES_7D)"; NEWEST_INSTANCE_AT="$(fval NEWEST_INSTANCE_AT)"
  HOURS_SINCE_LAST_INSTANCE="$(fval HOURS_SINCE_LAST_INSTANCE)"
  READ_PROBE_INSTANCE="$(fval READ_PROBE_INSTANCE)"
  if [ "${DB_OK:-0}" != "1" ]; then
    add_crit "database check failed: ${DB_ERROR:-unknown}"
  else
    add_info "instances: ${INSTANCES_TOTAL:-?} total, ${INSTANCES_24H:-?} in 24h, ${INSTANCES_7D:-?} in 7d"
    if [ -z "$HOURS_SINCE_LAST_INSTANCE" ] || [ "$HOURS_SINCE_LAST_INSTANCE" -lt 0 ]; then
      add_crit "no DICOM instance has EVER been recorded"
    elif [ "$HOURS_SINCE_LAST_INSTANCE" -gt "$INGEST_MAX_HOURS" ]; then
      add_crit "no DICOM received for ${HOURS_SINCE_LAST_INSTANCE}h (newest ${NEWEST_INSTANCE_AT}, threshold ${INGEST_MAX_HOURS}h)"
    else
      add_info "last DICOM ${HOURS_SINCE_LAST_INSTANCE}h ago (${NEWEST_INSTANCE_AT})"
    fi

    # Read a real instance back through Orthanc. This is the check that catches archived-but-
    # unreadable data, which looks perfectly healthy from the index alone.
    if [ -n "${READ_PROBE_INSTANCE:-}" ] && [ "$READ_PROBE_INSTANCE" != "none" ]; then
      ouser="$(grep -m1 '^ORTHANC_USER=' "$ROOT_DIR/server/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'')"
      opass="$(grep -m1 '^ORTHANC_PASSWORD=' "$ROOT_DIR/server/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'')"
      if [ -n "$ouser" ] && [ -n "$opass" ]; then
        rcode="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -u "$ouser:$opass" \
                   "$ORTHANC_HTTP/instances/$READ_PROBE_INSTANCE/file" || echo 000)"
        if [ "$rcode" = "200" ]; then
          add_info "storage read-back OK (instance $READ_PROBE_INSTANCE)"
        else
          add_crit "storage read-back FAILED (status $rcode) for instance $READ_PROBE_INSTANCE — Orthanc cannot serve stored images"
        fi
      else
        add_warn "ORTHANC_USER/ORTHANC_PASSWORD not readable — skipped storage read-back"
      fi
    fi
  fi
fi

# ── 7. archive destination configured ────────────────────────────────────────────────────────
if grep -qE '^PACS_ARCHIVE_MINIO_ENDPOINT=.+' "$ROOT_DIR/server/.env" 2>/dev/null; then
  add_info "PACS_ARCHIVE_MINIO_* configured"
else
  add_warn "PACS_ARCHIVE_MINIO_* not configured — the S3->MinIO archive cron cannot start"
fi

# ── verdict ──────────────────────────────────────────────────────────────────────────────────
if [ "${#CRIT[@]}" -gt 0 ]; then STATUS=CRITICAL; RC=2
elif [ "${#WARN[@]}" -gt 0 ]; then STATUS=WARNING; RC=1
else STATUS=OK; RC=0; fi

NOW_TS="$(date +%s)"
NOW_H="$(date -u '+%Y-%m-%d %H:%M UTC')"
PREV_STATUS=""; PREV_SENT=0
[ -f "$STATE_FILE" ] && { PREV_STATUS="$(sed -n 1p "$STATE_FILE")"; PREV_SENT="$(sed -n 2p "$STATE_FILE")"; }
PREV_SENT="${PREV_SENT:-0}"

SHOULD_MAIL=0
if [ "$STATUS" != "OK" ] && [ "$PREV_STATUS" = "$STATUS" ]; then
  # still broken: remind only every REMIND_HOURS
  [ $(( (NOW_TS - PREV_SENT) / 3600 )) -ge "$REMIND_HOURS" ] && SHOULD_MAIL=1
elif [ "$STATUS" != "$PREV_STATUS" ]; then
  # any transition, including recovery to OK
  SHOULD_MAIL=1
fi

{
  echo "$LOG_PREFIX $NOW_H status=$STATUS crit=${#CRIT[@]} warn=${#WARN[@]} mail=$SHOULD_MAIL"
  for m in "${CRIT[@]:-}"; do [ -n "$m" ] && echo "  CRITICAL: $m"; done
  for m in "${WARN[@]:-}"; do [ -n "$m" ] && echo "  WARNING:  $m"; done
  for m in "${INFO[@]:-}"; do [ -n "$m" ] && echo "  ok:       $m"; done
} 

if [ "$SHOULD_MAIL" = "1" ]; then
  ALERT_EMAIL="$(grep -m1 '^ALERT_EMAIL=' "$SMTP_REF" | cut -d'"' -f2)"
  SMTP_HOST="$(grep -m1 '^SMTP_HOST=' "$SMTP_REF" | cut -d'"' -f2)"
  SMTP_PORT="$(grep -m1 '^SMTP_PORT=' "$SMTP_REF" | cut -d'"' -f2)"
  SMTP_USER="$(grep -m1 '^SMTP_USER=' "$SMTP_REF" | cut -d'"' -f2)"
  SMTP_PASS="$(grep -m1 '^SMTP_PASS=' "$SMTP_REF" | cut -d'"' -f2)"
  if [ -z "$ALERT_EMAIL" ] || [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASS" ]; then
    echo "$LOG_PREFIX SMTP config missing in $SMTP_REF — alert NOT sent" >&2
  else
    BODY="$(mktemp)"
    {
      echo "From: ${SMTP_USER}"
      echo "To: ${ALERT_EMAIL}"
      if [ "$STATUS" = "OK" ]; then
        echo "Subject: [Mediqzy PACS] RECOVERED - imaging healthy"
      else
        echo "Subject: [Mediqzy PACS] ${STATUS} - ${#CRIT[@]} critical, ${#WARN[@]} warning"
      fi
      echo
      echo "PACS / imaging health check - $NOW_H"
      echo "Status: $STATUS (previous: ${PREV_STATUS:-none})"
      echo
      [ "${#CRIT[@]}" -gt 0 ] && { echo "CRITICAL"; for m in "${CRIT[@]}"; do echo "  - $m"; done; echo; }
      [ "${#WARN[@]}" -gt 0 ] && { echo "WARNINGS"; for m in "${WARN[@]}"; do echo "  - $m"; done; echo; }
      echo "Checks that passed"
      for m in "${INFO[@]:-}"; do [ -n "$m" ] && echo "  - $m"; done
      echo
      echo "Host: $(hostname) / $(hostname -I 2>/dev/null | awk '{print $1}')"
      echo "If the WireGuard peer is down, the remote site must bring its box online;"
      echo "the peer has persistent-keepalive and reconnects on its own."
      echo "Runbook: memory project_pacs_imaging_incident_2026_10_03"
    } > "$BODY"
    if curl -sS --ssl-reqd --url "smtps://${SMTP_HOST}:${SMTP_PORT}" \
         --user "${SMTP_USER}:${SMTP_PASS}" --mail-from "${SMTP_USER}" \
         --mail-rcpt "${ALERT_EMAIL}" --upload-file "$BODY" >/dev/null 2>&1; then
      echo "$LOG_PREFIX alert emailed to $ALERT_EMAIL"
      printf '%s\n%s\n' "$STATUS" "$NOW_TS" > "$STATE_FILE"
    else
      echo "$LOG_PREFIX alert email FAILED to send" >&2
      printf '%s\n%s\n' "$STATUS" "$PREV_SENT" > "$STATE_FILE"
    fi
    rm -f "$BODY"
  fi
else
  printf '%s\n%s\n' "$STATUS" "$PREV_SENT" > "$STATE_FILE"
fi

exit "$RC"
