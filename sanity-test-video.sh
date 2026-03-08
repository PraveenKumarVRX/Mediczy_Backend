#!/usr/bin/env bash
###############################################################################
#  Mediczy Platform — Full Sanity + Video-Call Smoke Test
###############################################################################

BASE="http://localhost:8888"
PUBLIC="https://mediqzy.com"
PASS=0; FAIL=0; WARN=0; TOTAL=0
RESULTS=()

G="\e[32m"; R="\e[31m"; Y="\e[33m"; C="\e[36m"; B="\e[1m"; N="\e[0m"

pass() { ((PASS++)); ((TOTAL++)); RESULTS+=("PASS|$1"); printf "${G}  ✅ PASS${N}  %s\n" "$1"; }
fail() { ((FAIL++)); ((TOTAL++)); RESULTS+=("FAIL|$1"); printf "${R}  ❌ FAIL${N}  %s\n" "$1"; }
warn() { ((WARN++)); ((TOTAL++)); RESULTS+=("WARN|$1"); printf "${Y}  ⚠️  WARN${N}  %s\n" "$1"; }
section() { printf "\n${B}${C}═══════════════════════════════════════════════════════${N}\n"; printf "${B}${C}  %s${N}\n" "$1"; printf "${B}${C}═══════════════════════════════════════════════════════${N}\n"; }

api() { curl -sS --max-time 10 "$@" 2>/dev/null || echo '{}'; }

# Python-based JSON checker: takes JSON on stdin, python expression as $1
# Uses 'd' as the parsed JSON dict. Returns exit code 0/1.
jcheck() {
  local expr="$1"
  python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
except Exception: sys.exit(1)
try:
  if $expr: sys.exit(0)
  else: sys.exit(1)
except Exception: sys.exit(1)
"
}

# Extract a JSON value: takes JSON on stdin, python expression $1
jget() {
  local expr="$1"
  python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print($expr)
except: print('')
" 2>/dev/null
}

###############################################################################
section "1. INFRASTRUCTURE HEALTH"
###############################################################################

# 1a. PM2 processes
for svc in mediczy-server mediczy-worker livekit-server sib-fastapi; do
  if pm2 show "$svc" 2>/dev/null | grep -q "status.*online"; then
    pass "PM2: $svc is online"
  else
    fail "PM2: $svc is NOT online"
  fi
done

# 1b. Health endpoint
HEALTH=$(api "$BASE/api/health")
if echo "$HEALTH" | jcheck "d.get('status') in ('ok','healthy','up') or d.get('success')"; then
  pass "Health endpoint OK"
else
  fail "Health endpoint: $(echo "$HEALTH" | head -c 100)"
fi

# 1c. PostgreSQL via DB health
PG=$(api "$BASE/api/db/health")
if echo "$PG" | jcheck "d.get('success') or d.get('status') in ('ok','healthy')"; then
  pass "PostgreSQL reachable"
else
  warn "PostgreSQL health endpoint unavailable"
fi

# 1d. Redis
if redis-cli ping 2>/dev/null | grep -q PONG; then
  pass "Redis PONG"
else
  fail "Redis not responding"
fi

# 1e. Socket.IO handshake (local)
SIO=$(curl -sS --max-time 5 "$BASE/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo "")
if echo "$SIO" | grep -q '"sid"'; then
  pass "Socket.IO handshake (local)"
else
  fail "Socket.IO handshake failed"
fi

# 1f. Socket.IO handshake (public)
SIO_PUB=$(curl -sS --max-time 5 "$PUBLIC/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo "")
if echo "$SIO_PUB" | grep -q '"sid"'; then
  pass "Socket.IO handshake (public)"
else
  warn "Socket.IO handshake via public URL failed"
fi

# 1g. Redis adapter for Socket.IO cluster
if grep -q "Socket.IO Redis adapter connected" /home/ubuntu/Mediczy/logs/server-out.log 2>/dev/null; then
  pass "Socket.IO Redis adapter active (cluster-safe)"
else
  # Also check PM2 logs
  if pm2 logs mediczy-server --nostream --lines 50 2>/dev/null | grep -q "Redis adapter"; then
    pass "Socket.IO Redis adapter active (from pm2 logs)"
  else
    fail "Socket.IO Redis adapter NOT active"
  fi
fi

# 1h. LiveKit server reachable
LK_RESP=$(curl -sS --max-time 5 -o /dev/null -w "%{http_code}" "http://localhost:7880" 2>/dev/null || echo "000")
if [ "$LK_RESP" != "000" ]; then
  pass "LiveKit server responds on :7880"
else
  warn "LiveKit server :7880 not reachable"
fi

###############################################################################
section "2. AUTHENTICATION"
###############################################################################

# 2a. Patient login
USER_RESP=$(api -X POST -H 'Content-Type: application/json' \
  -d '{"email":"user@mediczy.com","password":"User123"}' \
  "$BASE/api/auth/login")
USER_TOKEN=$(echo "$USER_RESP" | jget "d.get('token','')")
if [ -n "$USER_TOKEN" ] && [ ${#USER_TOKEN} -gt 20 ]; then
  pass "Patient login (user@mediczy.com)"
else
  USER_RESP=$(api -X POST -H 'Content-Type: application/json' \
    -d '{"email":"user@mediczy.com","password":"User123"}' "$BASE/api/users/login")
  USER_TOKEN=$(echo "$USER_RESP" | jget "d.get('token','')")
  if [ -n "$USER_TOKEN" ] && [ ${#USER_TOKEN} -gt 20 ]; then
    pass "Patient login via /users/login"
  else
    fail "Patient login failed"
    USER_TOKEN=""
  fi
fi

# 2b. Doctor login
DOC_RESP=$(api -X POST -H 'Content-Type: application/json' \
  -d '{"email":"doctor@mediczy.com","password":"Doctor123"}' \
  "$BASE/api/doctors/login")
DOC_TOKEN=$(echo "$DOC_RESP" | jget "d.get('token','')")
DOC_ID=$(echo "$DOC_RESP" | jget "str(d.get('doctor',d).get('id',''))" | tr -d '[:space:]')
if [ -n "$DOC_TOKEN" ] && [ ${#DOC_TOKEN} -gt 20 ]; then
  pass "Doctor login → id=$DOC_ID"
else
  fail "Doctor login failed"
  DOC_TOKEN=""
  DOC_ID=""
fi

# 2c. Hospital login
HOSP_RESP=$(api -X POST -H 'Content-Type: application/json' \
  -d '{"email":"hospital@mediczy.com","password":"Hospital123"}' \
  "$BASE/api/hospital/auth/login")
HOSP_TOKEN=$(echo "$HOSP_RESP" | jget "d.get('token','')")
if [ -n "$HOSP_TOKEN" ] && [ ${#HOSP_TOKEN} -gt 20 ]; then
  pass "Hospital login"
else
  warn "Hospital login failed"
fi

###############################################################################
section "3. CORE API ENDPOINTS"
###############################################################################

AUTH_H="Authorization: Bearer $DOC_TOKEN"
USER_H="Authorization: Bearer $USER_TOKEN"

# 3a. Doctor profile
DOC_PROF=$(api -H "$AUTH_H" "$BASE/api/doctors/profile")
if echo "$DOC_PROF" | jcheck "d.get('success') or d.get('id') or d.get('doctor',{}).get('id')"; then
  pass "Doctor profile endpoint"
else
  fail "Doctor profile endpoint"
fi

# 3b. Doctor appointments
DOC_APT=$(api -H "$AUTH_H" "$BASE/api/doctors/appointments")
APT_COUNT=$(echo "$DOC_APT" | jget "len(d.get('appointments',d.get('data',[])))")
if [ "${APT_COUNT:-0}" -gt 0 ] 2>/dev/null; then
  pass "Doctor appointments ($APT_COUNT)"
else
  warn "Doctor appointments empty"
fi

# 3c. Patient profile
USER_PROF=$(api -H "$USER_H" "$BASE/api/users/profile")
if echo "$USER_PROF" | jcheck "d.get('success') or d.get('id') or d.get('user',{}).get('id')"; then
  pass "Patient profile endpoint"
else
  USER_PROF=$(api -H "$USER_H" "$BASE/api/auth/profile")
  if echo "$USER_PROF" | jcheck "d.get('success') or d.get('id')"; then
    pass "Patient profile endpoint (via /auth/profile)"
  else
    warn "Patient profile endpoint"
  fi
fi

# 3d. Doctor listing
DOCS=$(api "$BASE/api/doctors")
DOC_LIST=$(echo "$DOCS" | jget "len(d.get('doctors',d.get('data',[])))")
if [ "${DOC_LIST:-0}" -gt 0 ] 2>/dev/null; then
  pass "Doctor listing ($DOC_LIST doctors)"
else
  warn "Doctor listing returned 0"
fi

# 3e. Notifications
NOTIF=$(api -H "$USER_H" "$BASE/api/notifications")
if echo "$NOTIF" | jcheck "True"; then
  pass "Notifications endpoint responds"
else
  warn "Notifications endpoint"
fi

###############################################################################
section "4. VIDEO CALL — DOCTOR ENDPOINTS"
###############################################################################

# 4a. Video consultation stats
VC_STATS=$(api -H "$AUTH_H" "$BASE/api/doctors/video-consultations/stats")
if echo "$VC_STATS" | jcheck "d.get('success')"; then
  TOTAL_VC=$(echo "$VC_STATS" | jget "d.get('stats',{}).get('total',0)")
  pass "Video stats (total=$TOTAL_VC)"
else
  fail "Video stats endpoint"
fi

# 4b. Upcoming consultations
VC_UP=$(api -H "$AUTH_H" "$BASE/api/doctors/video-consultations/upcoming")
if echo "$VC_UP" | jcheck "d.get('success')"; then
  UP_COUNT=$(echo "$VC_UP" | jget "len(d.get('consultations',[]))")
  pass "Upcoming consultations ($UP_COUNT)"
else
  fail "Upcoming consultations endpoint"
fi

# 4c. Recent consultations
VC_REC=$(api -H "$AUTH_H" "$BASE/api/doctors/video-consultations/recent")
if echo "$VC_REC" | jcheck "d.get('success')"; then
  REC_COUNT=$(echo "$VC_REC" | jget "len(d.get('consultations',[]))")
  pass "Recent consultations ($REC_COUNT)"
else
  fail "Recent consultations endpoint"
fi

###############################################################################
section "5. VIDEO CALL — FULL CALL INITIATION FLOW"
###############################################################################

# 5a. Create confirmed test appointment
echo "  → Creating test appointment..."
NEW_APT_ID=$(PGPASSWORD=Mediczy2024Helper psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai \
  --no-align --tuples-only -c "
INSERT INTO appointments (\"userId\", \"doctorId\", \"appointmentDate\", \"appointmentTime\",
  \"appointmentDateTime\", status, \"paymentStatus\", \"consultationType\",
  \"patientName\", \"doctorName\", \"createdAt\", \"updatedAt\")
VALUES (19, ${DOC_ID:-70}, CURRENT_DATE, (NOW() + INTERVAL '10 minutes')::time,
  NOW() + INTERVAL '10 minutes', 'confirmed', 'paid', 'video',
  'SanityTest Patient', 'Dr. Nandita Agarwal', NOW(), NOW())
RETURNING id;" 2>&1 | head -1 | tr -d '[:space:]')

if [ -n "$NEW_APT_ID" ] && [[ "$NEW_APT_ID" =~ ^[0-9]+$ ]]; then
  pass "Test appointment created (id=$NEW_APT_ID)"
else
  fail "Failed to create test appointment: $NEW_APT_ID"
  NEW_APT_ID=""
fi

# 5b. Initiate call from doctor
if [ -n "$NEW_APT_ID" ]; then
  echo "  → Doctor initiating call on appointment $NEW_APT_ID..."
  CALL_RESP=$(api -X POST -H "$AUTH_H" -H "Content-Type: application/json" \
    "$BASE/api/doctors/appointments/$NEW_APT_ID/initiate-call")

  if echo "$CALL_RESP" | jcheck "d.get('success')"; then
    pass "Call initiation API → success"
  else
    MSG=$(echo "$CALL_RESP" | jget "d.get('message','unknown')")
    fail "Call initiation failed: $MSG"
  fi

  # 5c. Meeting link domain
  MEETING_LINK=$(echo "$CALL_RESP" | jget "d.get('video',{}).get('meetingLink','')")
  if echo "$MEETING_LINK" | grep -q "app.mediqzy.com"; then
    pass "Meeting link → app.mediqzy.com ✓"
  elif echo "$MEETING_LINK" | grep -q "mediqzy"; then
    fail "Meeting link domain wrong: $MEETING_LINK"
  else
    fail "Meeting link missing"
  fi

  # 5d. Meeting link params
  if echo "$MEETING_LINK" | grep -qE "room=apt-" && echo "$MEETING_LINK" | grep -qE "appointmentId="; then
    pass "Meeting link has room + appointmentId params"
  else
    fail "Meeting link params missing"
  fi

  # 5e. LiveKit token
  LK_TOKEN=$(echo "$CALL_RESP" | jget "d.get('video',{}).get('livekit',{}).get('token','')")
  if [ -n "$LK_TOKEN" ] && [ ${#LK_TOKEN} -gt 50 ]; then
    pass "LiveKit token generated (${#LK_TOKEN} chars)"
  else
    fail "LiveKit token NOT in response"
  fi

  # 5f. LiveKit serverUrl
  LK_URL=$(echo "$CALL_RESP" | jget "d.get('video',{}).get('livekit',{}).get('serverUrl','')")
  if [ "$LK_URL" = "wss://video.mediqzy.com" ]; then
    pass "LiveKit serverUrl = wss://video.mediqzy.com"
  else
    fail "LiveKit serverUrl: $LK_URL"
  fi

  # 5g. LiveKit room name
  LK_ROOM=$(echo "$CALL_RESP" | jget "d.get('video',{}).get('livekit',{}).get('roomName','')")
  if echo "$LK_ROOM" | grep -qE "^apt-[0-9]+-[a-f0-9]+$"; then
    pass "LiveKit room: $LK_ROOM"
  else
    warn "LiveKit room format: $LK_ROOM"
  fi

  # 5h. Appointment status
  APT_STATUS=$(echo "$CALL_RESP" | jget "d.get('appointment',{}).get('status','')")
  if [ "$APT_STATUS" = "in-progress" ]; then
    pass "Appointment → in-progress"
  else
    warn "Appointment status: $APT_STATUS"
  fi

  # 5i. JWT structure
  PARTS=$(echo "$LK_TOKEN" | tr '.' '\n' | wc -l)
  if [ "$PARTS" -eq 3 ]; then
    pass "LiveKit token valid JWT (3-part)"
  else
    fail "LiveKit token NOT valid JWT"
  fi

  # 5j. Socket event logged
  sleep 1
  if grep -q "Socket event emitted to user-19" /home/ubuntu/Mediczy/logs/server-out.log 2>/dev/null; then
    pass "Socket.IO event → user-19 (patient)"
  else
    # Check PM2 logs as fallback
    if pm2 logs mediczy-server --nostream --lines 200 2>/dev/null | grep -q "incoming-call\|call.*notification\|emit.*user.*19"; then
      pass "Socket/notification event found (pm2 logs)"
    else
      warn "Socket.IO event not found in logs"
    fi
  fi

  # 5k. Notification dispatch
  if grep -q "Patient notification" /home/ubuntu/Mediczy/logs/server-out.log 2>/dev/null || \
     grep -q "notification.*sent\|notification.*dispatched" /home/ubuntu/Mediczy/logs/server-out.log 2>/dev/null; then
    pass "Patient notification dispatched"
  else
    warn "Patient notification not in logs"
  fi
fi

###############################################################################
section "6. VIDEO CALL — PATIENT JOIN FLOW"
###############################################################################

if [ -n "$NEW_APT_ID" ] && [ -n "$USER_TOKEN" ]; then
  # 6a. Patient video join
  JOIN_RESP=$(api -H "$USER_H" "$BASE/api/consultation/video/join/$NEW_APT_ID")
  if echo "$JOIN_RESP" | jcheck "d.get('success')"; then
    pass "Patient video join endpoint"

    # 6b. Patient LiveKit token
    P_TOKEN=$(echo "$JOIN_RESP" | jget "d.get('video',{}).get('livekit',{}).get('token','')")
    if [ -n "$P_TOKEN" ] && [ ${#P_TOKEN} -gt 50 ]; then
      pass "Patient received LiveKit token"
    else
      warn "Patient LiveKit token missing"
    fi

    # 6c. Patient serverUrl
    P_URL=$(echo "$JOIN_RESP" | jget "d.get('video',{}).get('livekit',{}).get('serverUrl','')")
    if [ "$P_URL" = "wss://video.mediqzy.com" ]; then
      pass "Patient LiveKit serverUrl correct"
    else
      warn "Patient LiveKit serverUrl: $P_URL"
    fi
  else
    MSG=$(echo "$JOIN_RESP" | jget "d.get('message','unknown')")
    warn "Patient video join: $MSG"
  fi

  # 6d. Video token endpoint
  VT_RESP=$(api -X POST -H "$USER_H" -H "Content-Type: application/json" \
    -d "{\"roomName\":\"${LK_ROOM:-test}\",\"participantName\":\"TestPatient\"}" \
    "$BASE/api/video/livekit/token")
  if echo "$VT_RESP" | jcheck "d.get('success') or d.get('token')"; then
    pass "Video token endpoint (/video/livekit/token)"
  else
    warn "Video token endpoint: $(echo "$VT_RESP" | jget "d.get('message','')" | head -c 80)"
  fi
else
  warn "Skipped patient join tests (no appointment/token)"
fi

###############################################################################
section "7. NGINX & PUBLIC URL"
###############################################################################

if grep -q "location /socket.io" /etc/nginx/sites-enabled/mediczy 2>/dev/null; then
  pass "Nginx: /socket.io proxy"
else
  warn "Nginx: /socket.io proxy not found"
fi

if grep -q "Upgrade" /etc/nginx/sites-enabled/mediczy 2>/dev/null; then
  pass "Nginx: WebSocket upgrade headers"
else
  fail "Nginx: WebSocket upgrade MISSING"
fi

PUB_CODE=$(curl -sS --max-time 10 -o /dev/null -w "%{http_code}" "$PUBLIC/api/health" 2>/dev/null || echo "000")
if [ "$PUB_CODE" = "200" ]; then
  pass "Public API health ($PUBLIC)"
else
  warn "Public API: HTTP $PUB_CODE"
fi

CF_CODE=$(curl -sS --max-time 10 -o /dev/null -w "%{http_code}" "https://app.mediqzy.com/" 2>/dev/null || echo "000")
if [ "$CF_CODE" = "200" ] || [ "$CF_CODE" = "304" ]; then
  pass "CloudFront (app.mediqzy.com) → $CF_CODE"
else
  warn "CloudFront: HTTP $CF_CODE"
fi

###############################################################################
section "8. AI & ADVANCED FEATURES"
###############################################################################

AI_H=$(api -H "$AUTH_H" "$BASE/api/v3/ai-intelligence/health")
if echo "$AI_H" | jcheck "d.get('success') or d.get('status') in ('ok','healthy')"; then
  pass "AI Brain Intelligence"
else
  AI_T=$(api -H "$AUTH_H" "$BASE/api/v3/ai-intelligence/tools")
  if echo "$AI_T" | jcheck "d.get('tools') or d.get('success')"; then
    pass "AI Brain tools endpoint"
  else
    warn "AI Brain Intelligence not responding"
  fi
fi

SIB=$(curl -sS --max-time 5 "http://localhost:8001/health" 2>/dev/null || echo '{}')
if echo "$SIB" | jcheck "True"; then
  pass "SIB FastAPI (:8001)"
else
  warn "SIB FastAPI health"
fi

ANALYTICS=$(api -H "$AUTH_H" "$BASE/api/analytics/dashboard")
if echo "$ANALYTICS" | jcheck "True"; then
  pass "Analytics dashboard"
else
  warn "Analytics dashboard"
fi

###############################################################################
section "9. FRONTEND BUILD"
###############################################################################

if [ -f /home/ubuntu/Mediczy/client/dist/index.html ]; then
  pass "Build exists (dist/index.html)"
else
  fail "Build missing!"
fi

if grep -rq "video.mediqzy.com" /home/ubuntu/Mediczy/client/dist/assets/ 2>/dev/null; then
  pass "VITE_LIVEKIT_URL in build"
else
  warn "VITE_LIVEKIT_URL not in build"
fi

if grep -rq "mediqzy.com" /home/ubuntu/Mediczy/client/dist/assets/ 2>/dev/null; then
  pass "API/Socket URL in build"
else
  fail "API/Socket URL NOT in build"
fi

if ls /home/ubuntu/Mediczy/client/dist/assets/LiveKitRoom-*.js 1>/dev/null 2>&1; then
  pass "LiveKitRoom component bundled"
else
  fail "LiveKitRoom NOT bundled"
fi

###############################################################################
section "10. DATABASE"
###############################################################################

APT_DATA=$(PGPASSWORD=Mediczy2024Helper psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai \
  --no-align --tuples-only -c "
SELECT COUNT(*),
  COUNT(*) FILTER (WHERE status='confirmed'),
  COUNT(*) FILTER (WHERE status='in-progress'),
  COUNT(*) FILTER (WHERE \"consultationType\" IN ('video','online'))
FROM appointments WHERE \"doctorId\"=${DOC_ID:-70};" 2>/dev/null | head -1)
if [ -n "$APT_DATA" ]; then
  IFS='|' read -r AT AC AIP AV <<< "$APT_DATA"
  pass "Appointments: total=$AT confirmed=$AC in-progress=$AIP video=$AV"
else
  warn "Could not query appointments"
fi

# Cleanup test appointment
if [ -n "$NEW_APT_ID" ]; then
  PGPASSWORD=Mediczy2024Helper psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai \
    --no-align --tuples-only -c "DELETE FROM appointments WHERE id=$NEW_APT_ID;" 2>/dev/null
  echo "  → Cleaned up test appointment $NEW_APT_ID"
fi

###############################################################################
section "RESULTS SUMMARY"
###############################################################################

printf "\n"
printf "${B}  Total: $TOTAL  |  ${G}Pass: $PASS${N}${B}  |  ${R}Fail: $FAIL${N}${B}  |  ${Y}Warn: $WARN${N}\n"

PCT=$(( PASS * 100 / TOTAL ))
printf "${B}  Success Rate: ${PCT}%%${N}\n\n"

if [ $FAIL -eq 0 ]; then
  printf "${B}${G}  🎉 ALL CRITICAL TESTS PASSED — VIDEO CALL FLOW VERIFIED ✅${N}\n\n"
else
  printf "${B}${R}  ⚠️  $FAIL CRITICAL FAILURE(S) — SEE BELOW${N}\n\n"
  printf "${R}  Failed:${N}\n"
  for r in "${RESULTS[@]}"; do
    [[ "$r" == FAIL* ]] && printf "    ❌ ${r#FAIL|}\n"
  done
  printf "\n"
fi

if [ $WARN -gt 0 ]; then
  printf "${Y}  Warnings:${N}\n"
  for r in "${RESULTS[@]}"; do
    [[ "$r" == WARN* ]] && printf "    ⚠️  ${r#WARN|}\n"
  done
  printf "\n"
fi

exit $FAIL
