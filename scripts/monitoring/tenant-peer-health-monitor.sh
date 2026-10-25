#!/usr/bin/env bash
#
# Tenant WireGuard peer health monitor + alert.
#
# Generalized sibling of pacs-health-monitor.sh for the dedicated-tenant peers added via
# scripts/wireguard/wg-add-peer.sh (Medstar's EC2 is the first: 10.99.0.6). Deliberately does NOT
# carry PACS/DICOM-specific checks (ingest freshness, storage read-back) — those stay in the PACS
# monitor, which covers its own peer (10.99.0.3) on its own schedule.
#
# The peer list is read from `wg-list-peers.sh`, not a hand-maintained file, so a newly
# provisioned tenant peer is monitored automatically the moment it's added — it can't drift out
# of sync with the real WireGuard config. An optional scripts/monitoring/tenant-peers.conf
# (name:port) adds an HTTP reachability probe per tenant; a tenant with no line there still gets
# full handshake monitoring, just no HTTP check.
#
# Alerts by SMTP, reusing the credentials other monitoring scripts read from
# scripts/video-smoke-test.sh. Same flap control as pacs-health-monitor.sh: mails on transition
# into trouble, again every REMIND_HOURS while still broken, once on recovery.
#
# Exit: 0 if every peer healthy, 2 if any peer critical (warnings don't raise the exit code).
#
# Cron (hourly, offset from the PACS monitor so they don't contend for the sudo wg lock):
#   5 * * * * /usr/bin/flock -n /tmp/tenant-health.lock /bin/bash \
#     /home/ubuntu/Mediczy/scripts/monitoring/tenant-peer-health-monitor.sh \
#     >> /home/ubuntu/Mediczy/logs/tenant-peer-health.log 2>&1
set -uo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
SMTP_REF="$ROOT_DIR/scripts/video-smoke-test.sh"
PORTS_FILE="${TENANT_PORTS_FILE:-$ROOT_DIR/scripts/monitoring/tenant-peers.conf}"
LOG_PREFIX="[tenant-peer-health]"

WG_MAX_MINUTES="${WG_MAX_MINUTES:-60}"
REMIND_HOURS="${REMIND_HOURS:-24}"

port_for() {
  local name="$1"
  [ -f "$PORTS_FILE" ] || return 0
  awk -F: -v n="$name" '$1==n {print $3; exit}' "$PORTS_FILE"
}

wg_dump="$(sudo -n wg show wg0 dump 2>/dev/null)"
if [ -z "$wg_dump" ]; then
  echo "$LOG_PREFIX $(date -u '+%Y-%m-%d %H:%M UTC') cannot read WireGuard state (sudo -n wg show failed) — skipping this run" >&2
  exit 1
fi

OVERALL_RC=0
NOW_TS="$(date +%s)"
NOW_H="$(date -u '+%Y-%m-%d %H:%M UTC')"

# Parse named peers straight out of wg0.conf's own comments (same convention wg-list-peers.sh
# uses) rather than re-deriving from the dump, so "which peers are tenant peers" has one source
# of truth. Every peer added via wg-add-peer.sh has a "# added by wg-add-peer.sh ... — <name>"
# comment immediately above its PublicKey line; pre-existing, hand-added peers have no such
# comment and are correctly skipped (they're not tenant peers this monitor owns).
declare -A PEER_NAME_BY_PUBKEY
current_name=""
while IFS= read -r line; do
  if [[ "$line" =~ ^#\ added\ by\ wg-add-peer\.sh\ .*\ —\ (.+)$ ]]; then
    current_name="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^PublicKey\ =\ (.+)$ ]] && [ -n "$current_name" ]; then
    PEER_NAME_BY_PUBKEY["${BASH_REMATCH[1]}"]="$current_name"
    current_name=""
  fi
done < <(sudo grep -vE "PrivateKey|PresharedKey" /etc/wireguard/wg0.conf 2>/dev/null)

if [ "${#PEER_NAME_BY_PUBKEY[@]}" -eq 0 ]; then
  echo "$LOG_PREFIX $NOW_H no tenant peers provisioned yet (nothing added via wg-add-peer.sh) — nothing to monitor"
  exit 0
fi

send_alert() {
  local name="$1" status="$2" prev_status="$3"
  shift 3
  local -a crit=() warn=() info=()
  local mode="none"
  for arg in "$@"; do
    case "$arg" in
      __CRIT__) mode=crit ;;
      __WARN__) mode=warn ;;
      __INFO__) mode=info ;;
      *) case "$mode" in crit) crit+=("$arg");; warn) warn+=("$arg");; info) info+=("$arg");; esac ;;
    esac
  done
  ALERT_EMAIL="$(grep -m1 '^ALERT_EMAIL=' "$SMTP_REF" | cut -d'"' -f2)"
  SMTP_HOST="$(grep -m1 '^SMTP_HOST=' "$SMTP_REF" | cut -d'"' -f2)"
  SMTP_PORT="$(grep -m1 '^SMTP_PORT=' "$SMTP_REF" | cut -d'"' -f2)"
  SMTP_USER="$(grep -m1 '^SMTP_USER=' "$SMTP_REF" | cut -d'"' -f2)"
  SMTP_PASS="$(grep -m1 '^SMTP_PASS=' "$SMTP_REF" | cut -d'"' -f2)"
  if [ -z "$ALERT_EMAIL" ] || [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASS" ]; then
    echo "$LOG_PREFIX SMTP config missing in $SMTP_REF — alert NOT sent for $name" >&2
    return 1
  fi
  BODY="$(mktemp)"
  {
    echo "From: ${SMTP_USER}"
    echo "To: ${ALERT_EMAIL}"
    if [ "$status" = "OK" ]; then
      echo "Subject: [Mediqzy tenant VPN] RECOVERED - $name healthy"
    else
      echo "Subject: [Mediqzy tenant VPN] ${status} - $name"
    fi
    echo
    echo "Tenant WireGuard peer health check - $NOW_H"
    echo "Peer: $name"
    echo "Status: $status (previous: ${prev_status:-none})"
    echo
    [ "${#crit[@]}" -gt 0 ] && { echo "CRITICAL"; for m in "${crit[@]}"; do echo "  - $m"; done; echo; }
    [ "${#warn[@]}" -gt 0 ] && { echo "WARNINGS"; for m in "${warn[@]}"; do echo "  - $m"; done; echo; }
    echo "Checks that passed"
    for m in "${info[@]:-}"; do [ -n "$m" ] && echo "  - $m"; done
  } > "$BODY"
  curl -sS --ssl-reqd --max-time 20 --url "smtps://${SMTP_HOST}:${SMTP_PORT}" \
    --user "${SMTP_USER}:${SMTP_PASS}" --mail-from "${SMTP_USER}" \
    --mail-rcpt "${ALERT_EMAIL}" --upload-file "$BODY" >/dev/null 2>&1
  local rc=$?
  rm -f "$BODY"
  return $rc
}

for pubkey in "${!PEER_NAME_BY_PUBKEY[@]}"; do
  name="${PEER_NAME_BY_PUBKEY[$pubkey]}"
  peer_line="$(echo "$wg_dump" | awk -v pk="$pubkey" '$1==pk {print; exit}')"
  CRIT=(); WARN=(); INFO=()

  if [ -z "$peer_line" ]; then
    CRIT+=("peer $name not found in live wg show output")
  else
    ip="$(echo "$peer_line" | awk '{print $4}' | grep -oE '10\.99\.0\.[0-9]+' | head -1)"
    hs="$(echo "$peer_line" | awk '{print $5}')"
    if [ "${hs:-0}" = "0" ]; then
      CRIT+=("peer $name ($ip) has NEVER handshaken")
    else
      age_min=$(( (NOW_TS - hs) / 60 ))
      if [ "$age_min" -gt "$WG_MAX_MINUTES" ]; then
        CRIT+=("peer $name ($ip) last handshake ${age_min} min ago (>${WG_MAX_MINUTES}) — tunnel is down")
      else
        INFO+=("peer $name ($ip) handshake ${age_min} min ago")
      fi
    fi

    port="$(port_for "$name")"
    if [ -n "$port" ] && [ -n "$ip" ]; then
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://${ip}:${port}/" || echo 000)"
      if [ "$code" = "000" ]; then
        CRIT+=("$name app not responding over the tunnel at ${ip}:${port}")
      else
        INFO+=("$name app responding over the tunnel at ${ip}:${port} (status $code)")
      fi
    fi
  fi

  if [ "${#CRIT[@]}" -gt 0 ]; then STATUS=CRITICAL; RC=2
  elif [ "${#WARN[@]}" -gt 0 ]; then STATUS=WARNING; RC=1
  else STATUS=OK; RC=0; fi
  [ "$RC" -gt "$OVERALL_RC" ] && OVERALL_RC="$RC"

  STATE_FILE="/var/tmp/tenant-health-state-${name}"
  PREV_STATUS=""; PREV_SENT=0
  [ -f "$STATE_FILE" ] && { PREV_STATUS="$(sed -n 1p "$STATE_FILE")"; PREV_SENT="$(sed -n 2p "$STATE_FILE")"; }
  PREV_SENT="${PREV_SENT:-0}"

  SHOULD_MAIL=0
  if [ "$STATUS" != "OK" ] && [ "$PREV_STATUS" = "$STATUS" ]; then
    [ $(( (NOW_TS - PREV_SENT) / 3600 )) -ge "$REMIND_HOURS" ] && SHOULD_MAIL=1
  elif [ "$STATUS" != "$PREV_STATUS" ]; then
    SHOULD_MAIL=1
  fi

  echo "$LOG_PREFIX $NOW_H peer=$name status=$STATUS crit=${#CRIT[@]} warn=${#WARN[@]} mail=$SHOULD_MAIL"
  for m in "${CRIT[@]:-}"; do [ -n "$m" ] && echo "  CRITICAL: $m"; done
  for m in "${WARN[@]:-}"; do [ -n "$m" ] && echo "  WARNING:  $m"; done
  for m in "${INFO[@]:-}"; do [ -n "$m" ] && echo "  ok:       $m"; done

  if [ "$SHOULD_MAIL" = "1" ]; then
    if send_alert "$name" "$STATUS" "$PREV_STATUS" \
        __CRIT__ "${CRIT[@]:-}" __WARN__ "${WARN[@]:-}" __INFO__ "${INFO[@]:-}"; then
      echo "$LOG_PREFIX alert emailed for $name"
      printf '%s\n%s\n' "$STATUS" "$NOW_TS" > "$STATE_FILE"
    else
      echo "$LOG_PREFIX alert email FAILED to send for $name" >&2
      printf '%s\n%s\n' "$STATUS" "$PREV_SENT" > "$STATE_FILE"
    fi
  else
    printf '%s\n%s\n' "$STATUS" "$PREV_SENT" > "$STATE_FILE"
  fi
done

exit "$OVERALL_RC"
