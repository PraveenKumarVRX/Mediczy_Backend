#!/bin/bash
set -e
BASE="http://localhost:8888/api"
PASS=0; FAIL=0
check() { if [ "$1" = "1" ]; then echo "  ✓ $2"; PASS=$((PASS+1)); else echo "  ✗ $2"; FAIL=$((FAIL+1)); fi; }

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║  SMOKE TEST — Equitas Bank Ltd  (Corp #5)     ║"
echo "╚═══════════════════════════════════════════════╝"

# 1. Auth
TOKEN=$(curl -sf -X POST "$BASE/team/login" -H 'Content-Type: application/json' \
  -d '{"email":"parinitha@mysmarthealth.in","password":"Mayden@321"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ -n "$TOKEN" ] && check 1 "Auth login — token ${#TOKEN} chars" || { check 0 "Auth login FAILED"; exit 1; }

# 2. GET corporates — Equitas employeeCount
EMP=$(curl -sf "$BASE/admin/corporates?search=equitas" -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); corps=d.get('data',d.get('corporates',[])); eq=next((c for c in corps if c.get('id')==5),None); print(eq['employeeCount'] if eq else 'NOT_FOUND')" 2>/dev/null)
[ "$EMP" = "2728" ] && check 1 "GET /corporates — Equitas employeeCount=$EMP" || check 0 "GET /corporates — employeeCount=$EMP (expect 2728)"

# 3. GET network partners
NET=$(curl -sf "$BASE/admin/corporate-network/5" -H "Authorization: Bearer $TOKEN")
LABS=$(echo "$NET" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('labs',[])))" 2>/dev/null)
HOSPS=$(echo "$NET" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('hospitals',[])))" 2>/dev/null)
CLINS=$(echo "$NET" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('clinics',[])))" 2>/dev/null)
[ "$LABS" -ge 100 ] 2>/dev/null && check 1 "GET /corporate-network/5 — labs=$LABS hospitals=$HOSPS clinics=$CLINS" || check 0 "GET /corporate-network/5 — labs=$LABS (expect ≥100)"

# 4. POST assign (idempotent upsert on Neuberg branch)
RESP=$(curl -sf -X POST "$BASE/admin/corporate-network-assignments" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"corporateId":5,"partnerId":2287,"partnerType":"lab","employeeIds":"all"}')
SUC=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success'))" 2>/dev/null)
CNT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('assignedCount','?'))" 2>/dev/null)
[ "$SUC" = "True" ] && [ "$CNT" = "2728" ] && check 1 "POST /corporate-network-assignments — success=True assignedCount=$CNT" || check 0 "POST assign — success=$SUC assignedCount=$CNT (expect True/2728)"

# 5. PM2 processes
ONLINE=$(pm2 list 2>&1 | grep -c "online")
[ "$ONLINE" -ge 4 ] && check 1 "PM2 — $ONLINE processes online" || check 0 "PM2 — only $ONLINE online (expect ≥4)"

# Summary
echo ""
echo "  Results: $PASS passed / $FAIL failed"
echo ""
[ "$FAIL" -eq 0 ] && echo "  ALL CHECKS PASSED ✓" || echo "  $FAIL CHECK(S) FAILED ✗"
echo ""
