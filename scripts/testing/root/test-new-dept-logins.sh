#!/bin/bash

# Automated test for all new department login endpoints
API_BASE="http://localhost:8888"
EMAIL="staff@example.com"
PASSWORD="password"

ENDPOINTS=(
  "/api/asset/login"
  "/api/biomedical/login"
  "/api/blood-bank/login"
  "/api/consent/login"
  "/api/cssd/login"
  "/api/dietary/login"
  "/api/finance/login"
  "/api/infection-control/login"
  "/api/mortuary/login"
  "/api/procurement/login"
  "/api/queue/login"
  "/api/accounts/login"
  "/api/hr/login"
  "/api/it-edp/login"
  "/api/mrd/login"
  "/api/insurance-desk/login"
  "/api/ot/login"
  "/api/icu/login"
  "/api/quality/login"
  "/api/security/login"
  "/api/tpa/login"
  "/api/psu/login"
  "/api/insurer/login"
  "/api/ngo/login"
)

PASSED=0
FAILED=0

for endpoint in "${ENDPOINTS[@]}"; do
  echo -n "Testing $endpoint ... "
  response=$(curl -s -X POST "$API_BASE$endpoint" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
    -w "\n%{http_code}")
  http_status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  success=$(echo "$body" | jq -r '.success // empty')
  token=$(echo "$body" | jq -r '.token // empty')
  if [ "$success" = "true" ] && [ -n "$token" ]; then
    echo "✅ PASSED"
    PASSED=$((PASSED+1))
  else
    echo "❌ FAILED ($http_status)"
    echo "   Response: $body"
    FAILED=$((FAILED+1))
  fi
  echo
  sleep 0.5
done

echo "==============================="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "==============================="
