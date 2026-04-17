#!/bin/bash
# LiveKit Watchdog — runs every 5 minutes via cron
# Checks livekit health and self-heals if down, sends email alert

ALERT_EMAIL="sk@mysmarthealth.in"
SMTP_HOST="smtppro.zoho.in"
SMTP_PORT="465"
SMTP_USER="care@mysmarthealth.in"
SMTP_PASS="Mayden@2025"
SMTP_FROM="Mediqzy Monitoring <care@mysmarthealth.in>"
LOG="/home/ubuntu/Mediczy/logs/livekit-watchdog.log"
LOCK="/tmp/livekit-watchdog.lock"
PM2="PM2_HOME=/home/ubuntu/.pm2 /usr/bin/pm2"
HOSTNAME=$(hostname)

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $1" | tee -a "$LOG"; }

send_alert() {
    local SUBJECT="$1"
    local BODY="$2"
    curl -s --ssl-reqd \
      --url "smtps://$SMTP_HOST:$SMTP_PORT" \
      --user "$SMTP_USER:$SMTP_PASS" \
      --mail-from "$SMTP_USER" \
      --mail-rcpt "$ALERT_EMAIL" \
      --upload-file - <<EOF
From: $SMTP_FROM
To: $ALERT_EMAIL
Subject: $SUBJECT
Content-Type: text/plain; charset=UTF-8
Date: $(date -R)
Message-ID: <watchdog-$(date +%s)@$HOSTNAME>

$BODY
EOF
}

# Prevent concurrent runs
if [[ -f "$LOCK" ]]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
    [[ $LOCK_AGE -lt 300 ]] && exit 0
fi
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Health check: HTTP + port
HTTP_OK=false
PORT_OK=false

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:7880 2>/dev/null)
[[ "$HTTP_CODE" == "200" ]] && HTTP_OK=true

ss -tlnp 2>/dev/null | grep -q ":7881" && PORT_OK=true

if $HTTP_OK && $PORT_OK; then
    # Healthy — no action needed
    exit 0
fi

# Unhealthy — log and restart
log "LiveKit unhealthy (HTTP=$HTTP_CODE port_7881=$PORT_OK) — attempting restart"

eval "$PM2 restart livekit" >> "$LOG" 2>&1
sleep 10

# Re-check after restart
HTTP_CODE2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:7880 2>/dev/null)
if [[ "$HTTP_CODE2" == "200" ]]; then
    log "LiveKit recovered after restart"
    send_alert "⚠️ Mediqzy LiveKit Restarted - $HOSTNAME" \
"LiveKit was down but has been automatically recovered.

Server: $HOSTNAME (13.234.17.52)
Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
Detection: HTTP $HTTP_CODE, port_7881=$PORT_OK
Recovery: Restarted, now responding HTTP 200

No action needed — monitoring continues."
else
    log "LiveKit still down after restart (HTTP=$HTTP_CODE2) — CRITICAL"
    send_alert "🔴 CRITICAL: Mediqzy LiveKit DOWN - $HOSTNAME" \
"LiveKit is DOWN and could not be auto-recovered.

Server: $HOSTNAME (13.234.17.52)
Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
Detection: HTTP $HTTP_CODE, port_7881=$PORT_OK
Recovery: Restart attempted, still HTTP $HTTP_CODE2

IMMEDIATE ACTION REQUIRED.
Run: pm2 restart livekit && pm2 logs livekit --lines 30"
fi

# Keep 30 days of watchdog logs
find "$(dirname "$LOG")" -name "livekit-watchdog*.log" -mtime +30 -delete 2>/dev/null
