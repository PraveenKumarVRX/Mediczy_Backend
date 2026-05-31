#!/bin/bash
# Video Call Daily Smoke Test
# Runs at 2 AM daily, emails sk@mysmarthealth.in on failure
# Updated 2026-05-30: LiveKit Cloud, RDS, direct nginx→PM2 routing

API="http://localhost:8888"
PUBLIC_API="https://app.mediqzy.com"
LIVEKIT_CLOUD="msh-kw9tvxa9.livekit.cloud"
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

# Load test credentials from root .env
TEST_USER_EMAIL="user@mediczy.com"
TEST_USER_PASSWORD="Mayden@9921"
TEST_DOCTOR_EMAIL="doctor@mediczy.com"
TEST_DOCTOR_PASSWORD="Doctor123"
[[ -f /home/ubuntu/Mediczy/.env ]] && source <(grep -E '^TEST_|^BASE_URL' /home/ubuntu/Mediczy/.env 2>/dev/null)

mkdir -p "$LOG_DIR"

PASS=0
FAIL=0
WARNINGS=0
FAILURES=""

log()  { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $1" | tee -a "$LOG_FILE"; }
pass() { log "✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { log "❌ FAIL: $1"; FAIL=$((FAIL+1)); FAILURES="${FAILURES}\n❌ $1"; }
warn() { log "⚠️  WARN: $1"; WARNINGS=$((WARNINGS+1)); }

log "=========================================="
log "VIDEO CALL SMOKE TEST STARTED"
log "=========================================="

# ── 1. Infrastructure ────────────────────────────────────────────────────────
log "--- Infrastructure ---"

# PM2 processes (livekit-server removed — now using LiveKit Cloud)
for PROC in mediczy-server mediczy-worker sib-brain offline-scribe; do
    STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p['name'] == '$PROC':
            print(p['pm2_env']['status'])
            break
    else:
        print('not_found')
except:
    print('error')
" 2>/dev/null)
    [[ "$STATUS" == "online" ]] && pass "PM2 $PROC: online" || fail "PM2 $PROC: $STATUS"
done

# nginx
ss -tlnp | grep -q ":80 " && pass "nginx port 80: listening" || fail "nginx port 80: not listening"
ss -tlnp | grep -q ":443 " && pass "nginx port 443: listening" || fail "nginx port 443: not listening"

# ── 2. LiveKit Cloud ─────────────────────────────────────────────────────────
log "--- LiveKit Cloud ---"

# Reachability via HTTPS
LK_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://$LIVEKIT_CLOUD" 2>/dev/null)
[[ "$LK_CODE" =~ ^[2-4] ]] && pass "LiveKit Cloud reachable: HTTP $LK_CODE" || fail "LiveKit Cloud unreachable: HTTP $LK_CODE"

# ── 3. API Health ────────────────────────────────────────────────────────────
log "--- API Health ---"

# Backend health via localhost
HEALTH=$(curl -s --max-time 10 "$API/api/health" 2>/dev/null)
echo "$HEALTH" | grep -q '"status"' && pass "API health (localhost): OK" || fail "API health (localhost): down"

# Public endpoint reachable via nginx
PUB_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PUBLIC_API/api/health" 2>/dev/null)
[[ "$PUB_CODE" == "200" ]] && pass "Public API via nginx: HTTP $PUB_CODE" || fail "Public API via nginx: HTTP $PUB_CODE"

# Video API health
VID_HEALTH=$(curl -s --max-time 10 "$API/api/video/health" 2>/dev/null)
echo "$VID_HEALTH" | grep -q '"success":true' && pass "Video API health: OK" || warn "Video API health: check response"

# SIB health
SIB_HEALTH=$(curl -s --max-time 10 "http://localhost:8001/health" 2>/dev/null)
echo "$SIB_HEALTH" | grep -q '"status":"healthy"' && pass "SIB (AI brain): healthy" || warn "SIB (AI brain): not responding"

# ── 4. Database ──────────────────────────────────────────────────────────────
log "--- Database (RDS) ---"

# Quick connectivity check via pg_isready
PG_READY=$(pg_isready -h mediczy-uat.cloqkwiey4k0.ap-south-1.rds.amazonaws.com -p 5432 -U mediczy_helper -d mediczy_ai 2>/dev/null)
echo "$PG_READY" | grep -q "accepting connections" && pass "RDS mediczy-uat: accepting connections" || fail "RDS mediczy-uat: not accepting connections"

# ── 5. Authentication ────────────────────────────────────────────────────────
log "--- Authentication ---"

USER_RESP=$(curl -s --max-time 10 -X POST "$API/api/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"$TEST_USER_PASSWORD\"}" 2>/dev/null)
USER_TOKEN=$(echo "$USER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','') or d.get('data',{}).get('token',''))" 2>/dev/null)
[[ -n "$USER_TOKEN" && ${#USER_TOKEN} -gt 50 ]] && pass "User login ($TEST_USER_EMAIL): OK" || fail "User login ($TEST_USER_EMAIL) failed — $(echo $USER_RESP | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"message\",\"unknown\"))' 2>/dev/null)"

DOC_RESP=$(curl -s --max-time 10 -X POST "$API/api/doctors/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_DOCTOR_EMAIL\",\"password\":\"$TEST_DOCTOR_PASSWORD\"}" 2>/dev/null)
DOC_TOKEN=$(echo "$DOC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','') or d.get('data',{}).get('token',''))" 2>/dev/null)
[[ -n "$DOC_TOKEN" && ${#DOC_TOKEN} -gt 50 ]] && pass "Doctor login ($TEST_DOCTOR_EMAIL): OK" || fail "Doctor login ($TEST_DOCTOR_EMAIL) failed"

# ── 6. Video Token (LiveKit Cloud) ───────────────────────────────────────────
log "--- Video Token Generation ---"

if [[ -n "$USER_TOKEN" ]]; then
    APT_ID=$(curl -s --max-time 10 "$API/api/appointments/my" \
      -H "Authorization: Bearer $USER_TOKEN" 2>/dev/null | python3 -c "
import sys,json
try:
    data = json.load(sys.stdin)
    appts = data if isinstance(data, list) else data.get('data', data.get('appointments', data.get('rows', [])))
    if isinstance(appts, list):
        joinable = {'scheduled','confirmed','accepted','in-progress','rescheduled'}
        for a in sorted(appts, key=lambda x: x.get('id',0), reverse=True):
            is_video = a.get('consultationType') == 'video' or a.get('type') == 'video'
            if is_video and str(a.get('status','')).lower() in joinable:
                print(a.get('id') or a.get('appointmentId',''))
                break
except: pass
" 2>/dev/null)

    if [[ -n "$APT_ID" ]]; then
        JOIN_RESP=$(curl -s --max-time 10 "$API/api/consultation/video/join/$APT_ID" \
          -H "Authorization: Bearer $USER_TOKEN" 2>/dev/null)
        SERVER_URL=$(echo "$JOIN_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
lk=(d.get('video',{}) or {}).get('livekit',{}) or {}
print(lk.get('serverUrl','') or d.get('serverUrl',''))
" 2>/dev/null)
        HAS_TOKEN=$(echo "$JOIN_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
lk=(d.get('video',{}) or {}).get('livekit',{}) or {}
t=lk.get('token','') or d.get('token','')
s=lk.get('serverUrl','') or d.get('serverUrl','')
if t and s:
    cloud = 'livekit.cloud' in s
    print(f'OK serverUrl={s} cloud={cloud} token_len={len(t)}')
else:
    print(f'FAIL: {d.get(\"message\",\"no token\")}')
" 2>/dev/null)
        if echo "$HAS_TOKEN" | grep -q "^OK"; then
            echo "$HAS_TOKEN" | grep -q "cloud=True" && \
                pass "Video token: LiveKit Cloud — $HAS_TOKEN" || \
                fail "Video token generated but not pointing to LiveKit Cloud: $HAS_TOKEN"
        else
            fail "Video token: $HAS_TOKEN"
        fi
    else
        warn "No joinable video appointment found — token test skipped"
    fi
else
    warn "User login failed — video token test skipped"
fi

# ── 7. OTP (Doctor Registration) ─────────────────────────────────────────────
log "--- OTP Delivery ---"

OTP_RESP=$(curl -s --max-time 15 -X POST "$API/api/doctors/send-email-otp" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-test-otp@example.com"}' 2>/dev/null)
echo "$OTP_RESP" | grep -q '"success":true' && pass "Doctor email OTP send: OK" || fail "Doctor email OTP send failed — $(echo $OTP_RESP | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"message\",\"unknown\"))' 2>/dev/null)"

# ── Summary ───────────────────────────────────────────────────────────────────
log "=========================================="
log "RESULTS: $PASS passed | $FAIL failed | $WARNINGS warnings"
log "=========================================="

# Clean up old logs (keep 30 days)
find "$LOG_DIR" -name "video-smoke-*.log" -mtime +30 -delete 2>/dev/null

# Send alert email only on failures
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
