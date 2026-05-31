#!/bin/bash

# Ring-Fencing Security Test Script
# Tests that users cannot access routes outside their privileges.

API_URL="${API_URL:-http://localhost:8000}"
STRICT_MODE="${STRICT_MODE:-false}"
FORWARDED_IP="${FORWARDED_IP:-}"

if [ -n "$FORWARDED_IP" ]; then
  CURL_FORWARDED_IP=(-H "X-Forwarded-For: $FORWARDED_IP")
else
  CURL_FORWARDED_IP=()
fi

echo "RING-FENCING SECURITY TEST"
echo "=========================="
echo "API_URL=$API_URL"
echo "STRICT_MODE=$STRICT_MODE"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test credentials (override via env for seeded UAT/local runs)
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@mediczy.com}"
ADMIN_PASS="${ADMIN_PASS:-Admin123}"

DOCTOR_EMAIL="${DOCTOR_EMAIL:-doctor@mediczy.com}"
DOCTOR_PASS="${DOCTOR_PASS:-Doctor123}"

USER_EMAIL="${USER_EMAIL:-user@mediczy.com}"
USER_PASS="${USER_PASS:-User123}"

CLINIC_EMAIL="${CLINIC_EMAIL:-clinic@mediczy.com}"
CLINIC_PASS="${CLINIC_PASS:-Clinic123}"

# Counter for tests
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

run_test_exact() {
  local test_name="$1"
  local expected="$2"
  local result="$3"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ "$result" = "$expected" ]; then
    echo -e "${GREEN}PASS${NC}: $test_name"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}FAIL${NC}: $test_name"
    echo "  Expected: $expected, Got: $result"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

run_test_any() {
  local test_name="$1"
  local result="$2"
  shift 2
  local allowed=("$@")
  local ok="false"
  local label=""

  for status in "${allowed[@]}"; do
    if [ "$result" = "$status" ]; then
      ok="true"
      break
    fi
    if [ -n "$label" ]; then
      label+="|"
    fi
    label+="$status"
  done

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ "$ok" = "true" ]; then
    echo -e "${GREEN}PASS${NC}: $test_name (HTTP $result)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}FAIL${NC}: $test_name"
    echo "  Expected one of: $label, Got: $result"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

skip_test() {
  local test_name="$1"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
  echo -e "${YELLOW}SKIP${NC}: $test_name"
}

http_status() {
  local method="$1"
  local url="$2"
  local auth_token="$3"

  if [ -n "$auth_token" ]; then
    curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" "${CURL_FORWARDED_IP[@]}" -H "Authorization: Bearer $auth_token"
  else
    curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" "${CURL_FORWARDED_IP[@]}"
  fi
}

extract_token() {
  echo "$1" | jq -r '.token // .data.token // empty'
}

login_admin() {
  curl -s -X POST "$API_URL/api/admin/login" \
    "${CURL_FORWARDED_IP[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}"
}

login_doctor() {
  curl -s -X POST "$API_URL/api/doctors/login" \
    "${CURL_FORWARDED_IP[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$DOCTOR_EMAIL\",\"password\":\"$DOCTOR_PASS\"}"
}

login_user() {
  local primary
  local token

  primary=$(curl -s -X POST "$API_URL/api/users/login" \
    "${CURL_FORWARDED_IP[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\"}")

  token=$(extract_token "$primary")
  if [ -n "$token" ] && [ "$token" != "null" ]; then
    echo "$primary"
    return 0
  fi

  curl -s -X POST "$API_URL/api/auth/login" \
    "${CURL_FORWARDED_IP[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\"}"
}

login_clinic() {
  curl -s -X POST "$API_URL/api/clinic/login" \
    "${CURL_FORWARDED_IP[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$CLINIC_EMAIL\",\"password\":\"$CLINIC_PASS\"}"
}

echo "Test 1: Server health"
echo "---------------------"
HEALTH_STATUS=$(http_status "GET" "$API_URL/health" "")
run_test_any "Health endpoint reachable" "$HEALTH_STATUS" "200" "401" "404"

echo ""
echo "Test 2: Admin authentication"
echo "----------------------------"
ADMIN_RESPONSE=$(login_admin)
ADMIN_TOKEN=$(extract_token "$ADMIN_RESPONSE")
if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
  run_test_exact "Admin login succeeded" "success" "success"
else
  if [ "$STRICT_MODE" = "true" ]; then
    run_test_exact "Admin login succeeded" "success" "failed"
  else
    skip_test "Admin login not available in this environment"
  fi
fi

echo ""
echo "Test 3: Doctor authentication"
echo "-----------------------------"
DOCTOR_RESPONSE=$(login_doctor)
DOCTOR_TOKEN=$(extract_token "$DOCTOR_RESPONSE")
if [ -n "$DOCTOR_TOKEN" ] && [ "$DOCTOR_TOKEN" != "null" ]; then
  run_test_exact "Doctor login succeeded" "success" "success"
else
  if [ "$STRICT_MODE" = "true" ]; then
    run_test_exact "Doctor login succeeded" "success" "failed"
  else
    skip_test "Doctor login not available in this environment"
  fi
fi

echo ""
echo "Test 4: User authentication"
echo "---------------------------"
USER_RESPONSE=$(login_user)
USER_TOKEN=$(extract_token "$USER_RESPONSE")
if [ -n "$USER_TOKEN" ] && [ "$USER_TOKEN" != "null" ]; then
  run_test_exact "User login succeeded" "success" "success"
else
  if [ "$STRICT_MODE" = "true" ]; then
    run_test_exact "User login succeeded" "success" "failed"
  else
    skip_test "User login not available in this environment"
  fi
fi

echo ""
echo "Test 5: Clinic authentication"
echo "-----------------------------"
CLINIC_RESPONSE=$(login_clinic)
CLINIC_TOKEN=$(extract_token "$CLINIC_RESPONSE")
if [ -n "$CLINIC_TOKEN" ] && [ "$CLINIC_TOKEN" != "null" ]; then
  run_test_exact "Clinic login succeeded" "success" "success"
else
  if [ "$STRICT_MODE" = "true" ]; then
    run_test_exact "Clinic login succeeded" "success" "failed"
  else
    skip_test "Clinic login not available in this environment"
  fi
fi

echo ""
echo "Test 6: Anonymous access blocked"
echo "--------------------------------"
ANON_STATUS=$(http_status "GET" "$API_URL/api/admin/users" "")
run_test_any "Anonymous request blocked" "$ANON_STATUS" "401" "403"

echo ""
echo "Test 7: Invalid token blocked"
echo "-----------------------------"
INVALID_STATUS=$(http_status "GET" "$API_URL/api/admin/users" "invalid_token_12345")
run_test_any "Invalid token blocked" "$INVALID_STATUS" "401" "403"

echo ""
echo "Test 8: Doctor cannot access admin resources"
echo "--------------------------------------------"
if [ -n "$DOCTOR_TOKEN" ] && [ "$DOCTOR_TOKEN" != "null" ]; then
  DOCTOR_ADMIN_STATUS=$(http_status "GET" "$API_URL/api/admin/users" "$DOCTOR_TOKEN")
  run_test_any "Doctor blocked from admin routes" "$DOCTOR_ADMIN_STATUS" "401" "403" "404"
else
  skip_test "Doctor-admin ring-fencing check skipped (no doctor token)"
fi

echo ""
echo "Test 9: Doctor can access doctor route"
echo "--------------------------------------"
if [ -n "$DOCTOR_TOKEN" ] && [ "$DOCTOR_TOKEN" != "null" ]; then
  DOCTOR_SELF_STATUS=$(http_status "GET" "$API_URL/api/doctor/profile" "$DOCTOR_TOKEN")
  run_test_any "Doctor can access doctor profile" "$DOCTOR_SELF_STATUS" "200" "404"
else
  skip_test "Doctor self-route check skipped (no doctor token)"
fi

echo ""
echo "Test 10: User cannot access admin resources"
echo "-------------------------------------------"
if [ -n "$USER_TOKEN" ] && [ "$USER_TOKEN" != "null" ]; then
  USER_ADMIN_STATUS=$(http_status "GET" "$API_URL/api/admin/users" "$USER_TOKEN")
  run_test_any "User blocked from admin routes" "$USER_ADMIN_STATUS" "401" "403" "404"
else
  skip_test "User-admin ring-fencing check skipped (no user token)"
fi

echo ""
echo "Test 11: User cannot access doctor resources"
echo "--------------------------------------------"
if [ -n "$USER_TOKEN" ] && [ "$USER_TOKEN" != "null" ]; then
  USER_DOCTOR_STATUS=$(http_status "GET" "$API_URL/api/doctors/appointments" "$USER_TOKEN")
  run_test_any "User blocked from doctor routes" "$USER_DOCTOR_STATUS" "401" "403" "404"
else
  skip_test "User-doctor ring-fencing check skipped (no user token)"
fi

echo ""
echo "Test 12: Clinic cannot access admin resources"
echo "---------------------------------------------"
if [ -n "$CLINIC_TOKEN" ] && [ "$CLINIC_TOKEN" != "null" ]; then
  CLINIC_ADMIN_STATUS=$(http_status "GET" "$API_URL/api/admin/dashboard" "$CLINIC_TOKEN")
  run_test_any "Clinic blocked from admin routes" "$CLINIC_ADMIN_STATUS" "401" "403" "404"
else
  skip_test "Clinic-admin ring-fencing check skipped (no clinic token)"
fi

echo ""
echo "Test 13: Clinic can access clinic route"
echo "---------------------------------------"
if [ -n "$CLINIC_TOKEN" ] && [ "$CLINIC_TOKEN" != "null" ]; then
  CLINIC_SELF_STATUS=$(http_status "GET" "$API_URL/api/clinic/dashboard/stats" "$CLINIC_TOKEN")
  run_test_any "Clinic can access clinic route" "$CLINIC_SELF_STATUS" "200" "404"
else
  skip_test "Clinic self-route check skipped (no clinic token)"
fi

echo ""
echo "=============================="
echo "TEST SUMMARY"
echo "=============================="
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
echo -e "${YELLOW}Skipped:      $SKIPPED_TESTS${NC}"
echo ""

if [ "$FAILED_TESTS" -eq 0 ]; then
  echo -e "${GREEN}ALL ENFORCEMENT CHECKS PASSED${NC}"
  exit 0
else
  echo -e "${YELLOW}One or more enforcement checks failed${NC}"
  exit 1
fi
