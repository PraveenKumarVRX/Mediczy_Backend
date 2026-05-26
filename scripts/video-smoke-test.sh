#!/bin/bash
# Video Call Daily Smoke Test
# Runs at 2 AM daily, emails sk@mysmarthealth.in on failure
# Tests: infrastructure, auth, token generation, TURN, WSS

API="http://localhost:8888"
ALERT_EMAIL="sk@mysmarthealth.in"
SMTP_HOST="smtppro.zoho.in"
SMTP_PORT="465"
SMTP_USER="care@mysmarthealth.in"
SMTP_PASS="Mayden@2025"
SMTP_FROM="Mediqzy Monitoring <care@mysmarthealth.in>"
LOG_DIR="/home/ubuntu/Mediczy/logs"
LOG_FILE="$LOG_DIR/video-smoke-$(date +%Y%m%d-%H%M%S).log"
HOSTNAME=$(hostname)
SERVER_IP="13.127.125.93"

mkdir -p "$LOG_DIR"

PASS=0
FAIL=0
WARNINGS=0
FAILURES=""

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $1" | tee -a "$LOG_FILE"; }
pass() { log "✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { log "❌ FAIL: $1"; FAIL=$((FAIL+1)); FAILURES="${FAILURES}\n❌ $1"; }
warn() { log "⚠️  WARN: $1"; WARNINGS=$((WARNINGS+1)); }

log "=========================================="
log "VIDEO CALL SMOKE TEST STARTED"
log "=========================================="

# --- 1. LiveKit Server ---
log "--- Infrastructure ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:7880 2>/dev/null)
[[ "$CODE" == "200" ]] && pass "LiveKit HTTP (7880): $CODE" || fail "LiveKit HTTP (7880): $CODE"

# TURN ports
ss -ulnp 2>/dev/null | grep -q ":3478" && pass "TURN UDP 3478 listening" || fail "TURN UDP 3478 NOT listening"
ss -tlnp 2>/dev/null | grep -q ":5349" && pass "TURN TLS 5349 listening" || fail "TURN TLS 5349 NOT listening"
ss -tlnp 2>/dev/null | grep -q ":7881" && pass "RTC TCP 7881 listening" || fail "RTC TCP 7881 NOT listening"

# Video API health
HEALTH=$(curl -s --max-time 10 "$API/api/video/health" 2>/dev/null)
echo "$HEALTH" | grep -q '"success":true' && pass "Video API health: OK" || fail "Video API health endpoint down"

# PM2 processes
for PROC in livekit-server mediczy-server; do
    STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
procs = json.load(sys.stdin)
for p in procs:
    if p['name'] == '$PROC':
        print(p['pm2_env']['status'])
        break
" 2>/dev/null)
    [[ "$STATUS" == "online" ]] && pass "PM2 $PROC: online" || fail "PM2 $PROC: $STATUS"
done

# --- 2. Authentication ---
log "--- Authentication ---"
USER_RESP=$(curl -s --max-time 10 -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediczy.com","password":"User123"}' 2>/dev/null)
USER_TOKEN=$(echo "$USER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
[[ -n "$USER_TOKEN" && ${#USER_TOKEN} -gt 50 ]] && pass "User login: OK" || fail "User login failed"

DOC_RESP=$(curl -s --max-time 10 -X POST "$API/api/doctors/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@mediczy.com","password":"Doctor123"}' 2>/dev/null)
DOC_TOKEN=$(echo "$DOC_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
[[ -n "$DOC_TOKEN" && ${#DOC_TOKEN} -gt 50 ]] && pass "Doctor login: OK" || fail "Doctor login failed"

# --- 3. Video System ---
log "--- Video System ---"
if [[ -n "$USER_TOKEN" ]]; then
    TEST_RESP=$(curl -s --max-time 10 "$API/api/video/test" \
      -H "Authorization: Bearer $USER_TOKEN" 2>/dev/null)
    echo "$TEST_RESP" | grep -q '"success":true' && pass "Video system test: operational" || fail "Video system test endpoint failed"

    # Check ICE servers contain server IP (not domain that goes through Cloudflare)
    ICE_OK=$(echo "$TEST_RESP" | python3 -c "
import sys,json
d = json.load(sys.stdin)
ice = d.get('config',{}).get('iceServers',[])
turn_entries = [s for s in ice if 'turn:' in s.get('urls','')]
has_ip = any('$SERVER_IP' in s.get('urls','') for s in turn_entries)
print('OK' if has_ip and len(turn_entries) > 0 else 'BAD')
" 2>/dev/null)
    [[ "$ICE_OK" == "OK" ]] && pass "ICE config: TURN uses server IP" || fail "ICE config: TURN not using server IP $SERVER_IP"
fi

# --- 4. Token Generation ---
log "--- Token Generation ---"
if [[ -n "$USER_TOKEN" ]]; then
    # Find most recent joinable video appointment
    APT_ID=$(curl -s --max-time 10 "$API/api/appointments/my" \
      -H "Authorization: Bearer $USER_TOKEN" 2>/dev/null | python3 -c "
import sys,json
data = json.load(sys.stdin)
appts = data if isinstance(data, list) else data.get('data', data.get('appointments', data.get('rows', [])))
if isinstance(appts, list):
    joinable = {"scheduled", "confirmed", "accepted", "in-progress", "rescheduled"}
    for a in sorted(appts, key=lambda x: x.get("id",0), reverse=True):
        is_video = a.get("consultationType") == "video" or a.get("type") == "video"
        status = str(a.get("status", "")).lower()
        if is_video and status in joinable:
            print(a.get("id") or a.get("appointmentId",""))
            break
" 2>/dev/null)

    if [[ -n "$APT_ID" ]]; then
        JOIN_RESP=$(curl -s --max-time 10 "$API/api/consultation/video/join/$APT_ID" \
          -H "Authorization: Bearer $USER_TOKEN" 2>/dev/null)
        HAS_TOKEN=$(echo "$JOIN_RESP" | python3 -c "
import sys,json
d = json.load(sys.stdin)
lk = (d.get('video',{}) or {}).get('livekit',{}) or {}
t = lk.get('token','') or d.get('token','')
s = lk.get('serverUrl','') or d.get('serverUrl','')
if t and s:
    print(f'OK serverUrl={s} token_len={len(t)}')
else:
    print(f'FAIL: {d.get(\"message\",\"no token\")}')
" 2>/dev/null)
        if echo "$HAS_TOKEN" | grep -q "^OK"; then
            pass "Video join token: $HAS_TOKEN"
        else
            fail "Video join token: $HAS_TOKEN"
        fi
    else
        warn "No video appointment found for token test"
    fi
fi

# --- 5. TURN TLS Handshake ---
log "--- TURN Connectivity ---"
TLS_OK=$(echo | timeout 5 openssl s_client -connect $SERVER_IP:5349 -servername video.mediqzy.com 2>/dev/null | grep -c "CONNECTED")
[[ "$TLS_OK" -ge 1 ]] && pass "TURN TLS handshake: OK" || fail "TURN TLS handshake failed on port 5349"

# --- Summary ---
log "=========================================="
log "RESULTS: $PASS passed | $FAIL failed | $WARNINGS warnings"
log "=========================================="

# Clean up old logs (keep 30 days)
find "$LOG_DIR" -name "video-smoke-*.log" -mtime +30 -delete 2>/dev/null

# Send alert email if failures
if [[ $FAIL -gt 0 ]]; then
    log "SENDING ALERT EMAIL to $ALERT_EMAIL"
    
    SUBJECT="🔴 Mediqzy Video Call Alert - $FAIL failure(s) detected"
    BODY="Video Call Smoke Test Report
Server: $HOSTNAME ($SERVER_IP)
Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
Results: $PASS passed | $FAIL FAILED | $WARNINGS warnings

FAILURES:
$(echo -e "$FAILURES")

---
Full log: $LOG_FILE

This is an automated monitoring alert from Mediqzy."

    # Send via SMTP using curl
    curl -s --ssl-reqd \
      --url "smtps://$SMTP_HOST:$SMTP_PORT" \
      --user "$SMTP_USER:$SMTP_PASS" \
      --mail-from "$SMTP_USER" \
      --mail-rcpt "$ALERT_EMAIL" \
      --upload-file - <<EMAIL_EOF
From: $SMTP_FROM
To: $ALERT_EMAIL
Subject: $SUBJECT
Content-Type: text/plain; charset=UTF-8
Date: $(date -R)
Message-ID: <smoke-$(date +%s)@$HOSTNAME>

$BODY
EMAIL_EOF

    MAIL_EXIT=$?
    [[ $MAIL_EXIT -eq 0 ]] && log "Alert email sent successfully" || log "Failed to send alert email (exit: $MAIL_EXIT)"
else
    log "All checks passed - no alert needed"
fi

exit $FAIL
