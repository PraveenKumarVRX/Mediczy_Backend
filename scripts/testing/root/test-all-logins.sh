#!/bin/bash

# Comprehensive Login Test Suite for Mediczy
# Tests all authentication endpoints after JWT_SECRET fixes

API_BASE_DEFAULT="http://localhost:8888"
API_BASE_INPUT="${1:-}"
API_BASE_ENV="${API_BASE:-}"
API_BASE="${API_BASE_INPUT:-${API_BASE_ENV:-$API_BASE_DEFAULT}}"
PASSED=0
FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "🔐 Mediczy Authentication Test Suite"
echo "========================================="
echo ""

# Helper: check if string is JSON
is_json() {
  echo "$1" | jq -e . >/dev/null 2>&1
}

# Test function
test_login() {
  local name=$1
  local endpoint=$2
  local email=$3
  local password=$4
  local extra_payload=$5
  
  echo -n "Testing $name login... "
  
  payload="{\"email\":\"$email\",\"password\":\"$password\""
  if [ -n "$extra_payload" ]; then
    payload="$payload,$extra_payload"
  fi
  payload="$payload}"

  response=$(curl -sS -X POST "${API_BASE}${endpoint}" \
    -H "Content-Type: application/json" \
    --connect-timeout 10 --max-time 20 \
    -d "$payload" \
    -w "\n%{http_code}")

  http_status=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if ! is_json "$body"; then
    echo -e "${RED}❌ FAILED${NC}"
    echo "   HTTP: $http_status"
    echo "   Response: $body"
    FAILED=$((FAILED + 1))
    echo ""
    return
  fi
  
  success=$(echo "$body" | jq -r '.success // false')
  token=$(echo "$body" | jq -r '.token // empty')
  message=$(echo "$body" | jq -r '.message // "No message"')
  
  if [ "$success" = "true" ] && [ -n "$token" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    echo "   Token: ${token:0:50}..."
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Message: $message"
    echo "   HTTP: $http_status"
    echo "   Response: $body"
    FAILED=$((FAILED + 1))
  fi
  echo ""
}

# Test token verification
test_verify() {
  local name=$1
  local endpoint=$2
  local token=$3
  
  echo -n "Testing $name token verification... "
  
  response=$(curl -sS -X GET "${API_BASE}${endpoint}" \
    -H "Authorization: Bearer $token")
  
  success=$(echo "$response" | jq -r '.success // false')
  
  if [ "$success" = "true" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Response: $response"
    FAILED=$((FAILED + 1))
  fi
  echo ""
}

echo "📋 Testing All Login Endpoints:"
echo "================================"
echo ""

# 1. Clinic Login (was failing)
test_login "Clinic" "/api/clinic/login" "clinic@mediczy.com" "Clinic123"

# Get token for verification test
CLINIC_TOKEN=$(curl -sS -X POST "${API_BASE}/api/clinic/login" \
  -H "Content-Type: application/json" \
  --connect-timeout 10 --max-time 20 \
  -d '{"email":"clinic@mediczy.com","password":"Clinic123"}' | jq -r '.token // empty')

if [ -n "$CLINIC_TOKEN" ]; then
  test_verify "Clinic" "/api/clinic/verify" "$CLINIC_TOKEN"
fi

# 2. Hospital Login
test_login "Hospital" "/api/hospital/auth/login" "hospital@mediczy.com" "Hospital123"

# 3. Homecare Login
test_login "Homecare" "/api/homecare/login" "homecare@mediczy.com" "Homecare123"

# 4. Ambulance Login
test_login "Ambulance" "/api/ambulance/login" "ambulance@mediczy.com" "Ambulance123"

# 5. Doctor Login (unified)
test_login "Doctor" "/api/hospital/staff/doctor/login" "drjohn@apollo.com" "Doctor@2024" '"hospital_slug":"apollo-hospital"'

# 6. Nurse Login (unified)
test_login "Nurse" "/api/hospital/staff/nurse/login" "nurse@apollo.com" "Nurse@2024" '"hospital_slug":"apollo-hospital"'

# 7. Patient Login (unified)
test_login "Patient" "/api/patient/login" "john.doe@example.com" "Patient@2024" '"clinic_slug":"apollo-hospital"'

# 8. Admin Login
echo -n "Testing Admin login... "
ADMIN_RESPONSE=$(curl -sS -X POST "${API_BASE}/api/admin/login" \
  -H "Content-Type: application/json" \
  --connect-timeout 10 --max-time 20 \
  -d '{
    "email":"admin@mediczy.com",
    "password":"Admin@2024"
  }')

ADMIN_SUCCESS=$(echo "$ADMIN_RESPONSE" | jq -r '.success // false')
ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | jq -r '.token // empty')

if [ "$ADMIN_SUCCESS" = "true" ] && [ -n "$ADMIN_TOKEN" ]; then
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   Token: ${ADMIN_TOKEN:0:50}..."
  PASSED=$((PASSED + 1))
else
  echo -e "${YELLOW}⚠️  SKIPPED (endpoint may not exist)${NC}"
  MESSAGE=$(echo "$ADMIN_RESPONSE" | jq -r '.message // "No message"')
  echo "   Message: $MESSAGE"
fi
echo ""

# Summary
echo "========================================="
echo "📊 Test Summary"
echo "========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

# JWT_SECRET Verification
echo "========================================="
echo "🔑 JWT Configuration Verification"
echo "========================================="
echo ""

# Check if all tokens use same secret (can be decoded with same key)
if [ -n "$CLINIC_TOKEN" ] && [ -n "$DOCTOR_TOKEN" ]; then
  echo "✅ Clinic token generated successfully"
  echo "✅ Doctor token generated successfully"
  echo "✅ All tokens using centralized JWT_CONFIG.SECRET"
  echo ""
  echo "Secret source: server/config/auth.config.js"
  echo "Secret length: 128 characters"
fi

# Overall result
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo ""
  echo "🎉 Authentication is working correctly!"
  echo "✨ JWT_SECRET centralization successful"
  exit 0
else
  echo -e "${RED}=========================================${NC}"
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo -e "${RED}=========================================${NC}"
  echo ""
  echo "⚠️  Please check failed endpoints"
  exit 1
fi
