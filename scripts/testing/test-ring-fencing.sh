#!/bin/bash

# Ring-Fencing Security Test Script
# Tests that users cannot access routes outside their privileges

API_URL="${API_URL:-http://localhost:8000}"
FRONTEND_URL="${FRONTEND_URL:-https://mediqzy.com}"

echo "🔒 RING-FENCING SECURITY TEST"
echo "=============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test credentials
ADMIN_EMAIL="admin@mediczy.com"
ADMIN_PASS="Admin123"

DOCTOR_EMAIL="doctor@mediczy.com"
DOCTOR_PASS="Doctor123"

USER_EMAIL="user@mediczy.com"
USER_PASS="User123"

CLINIC_EMAIL="clinic@mediczy.com"
CLINIC_PASS="Clinic123"

TEAM_EMAIL="team@mediczy.com"
TEAM_PASS="Team123"

# Counter for tests
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test() {
    local test_name=$1
    local expected=$2
    local result=$3
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$result" = "$expected" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo "  Expected: $expected, Got: $result"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Test 1: Admin login
echo ""
echo "Test 1: Admin Authentication"
echo "----------------------------"
ADMIN_RESPONSE=$(curl -s -X POST "$API_URL/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | jq -r '.token // empty')

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    run_test "Admin login successful" "success" "success"
else
    run_test "Admin login successful" "success" "failed"
    echo "Response: $ADMIN_RESPONSE"
fi

# Test 2: Admin can access admin endpoints
echo ""
echo "Test 2: Admin Accessing Admin Endpoints"
echo "----------------------------------------"
ADMIN_USERS_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

ADMIN_USERS_STATUS=$(echo "$ADMIN_USERS_RESPONSE" | tail -n1)
run_test "Admin can access /api/users" "200" "$ADMIN_USERS_STATUS"

# Test 3: Doctor login
echo ""
echo "Test 3: Doctor Authentication"
echo "-----------------------------"
DOCTOR_RESPONSE=$(curl -s -X POST "$API_URL/api/doctors/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DOCTOR_EMAIL\",\"password\":\"$DOCTOR_PASS\"}")

DOCTOR_TOKEN=$(echo $DOCTOR_RESPONSE | jq -r '.token // empty')

if [ -n "$DOCTOR_TOKEN" ] && [ "$DOCTOR_TOKEN" != "null" ]; then
    run_test "Doctor login successful" "success" "success"
else
    run_test "Doctor login successful" "success" "failed"
fi

# Test 4: Doctor CANNOT access admin endpoints
echo ""
echo "Test 4: Ring-Fencing - Doctor Cannot Access Admin Routes"
echo "--------------------------------------------------------"
DOCTOR_ADMIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/users" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

DOCTOR_ADMIN_STATUS=$(echo "$DOCTOR_ADMIN_RESPONSE" | tail -n1)
run_test "Doctor blocked from /api/users" "403" "$DOCTOR_ADMIN_STATUS"

# Test 5: Doctor CAN access doctor endpoints
echo ""
echo "Test 5: Doctor Accessing Own Endpoints"
echo "--------------------------------------"
DOCTOR_OWN_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/doctor/profile" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

DOCTOR_OWN_STATUS=$(echo "$DOCTOR_OWN_RESPONSE" | tail -n1)
if [ "$DOCTOR_OWN_STATUS" = "200" ] || [ "$DOCTOR_OWN_STATUS" = "404" ]; then
    run_test "Doctor can access /api/doctor/*" "allowed" "allowed"
else
    run_test "Doctor can access /api/doctor/*" "allowed" "blocked"
fi

# Test 6: User login
echo ""
echo "Test 6: Regular User Authentication"
echo "-----------------------------------"
USER_RESPONSE=$(curl -s -X POST "$API_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\"}")

USER_TOKEN=$(echo $USER_RESPONSE | jq -r '.token // empty')

if [ -n "$USER_TOKEN" ] && [ "$USER_TOKEN" != "null" ]; then
    run_test "User login successful" "success" "success"
else
    run_test "User login successful" "success" "failed"
fi

# Test 7: User CANNOT access admin endpoints
echo ""
echo "Test 7: Ring-Fencing - User Cannot Access Admin Routes"
echo "------------------------------------------------------"
USER_ADMIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/admin/users" \
  -H "Authorization: Bearer $USER_TOKEN")

USER_ADMIN_STATUS=$(echo "$USER_ADMIN_RESPONSE" | tail -n1)
run_test "User blocked from /api/admin/*" "403" "$USER_ADMIN_STATUS"

# Test 8: User CANNOT access doctor endpoints
echo ""
echo "Test 8: Ring-Fencing - User Cannot Access Doctor Routes"
echo "-------------------------------------------------------"
USER_DOCTOR_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/doctors/appointments" \
  -H "Authorization: Bearer $USER_TOKEN")

USER_DOCTOR_STATUS=$(echo "$USER_DOCTOR_RESPONSE" | tail -n1)
run_test "User blocked from /api/doctors/appointments" "403" "$USER_DOCTOR_STATUS"

# Test 9: Clinic login
echo ""
echo "Test 9: Clinic Authentication"
echo "-----------------------------"
CLINIC_RESPONSE=$(curl -s -X POST "$API_URL/api/clinic/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$CLINIC_EMAIL\",\"password\":\"$CLINIC_PASS\"}")

CLINIC_TOKEN=$(echo $CLINIC_RESPONSE | jq -r '.token // empty')

if [ -n "$CLINIC_TOKEN" ] && [ "$CLINIC_TOKEN" != "null" ]; then
    run_test "Clinic login successful" "success" "success"
else
    run_test "Clinic login successful" "success" "failed"
fi

# Test 10: Clinic CANNOT access admin endpoints
echo ""
echo "Test 10: Ring-Fencing - Clinic Cannot Access Admin Routes"
echo "---------------------------------------------------------"
CLINIC_ADMIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/admin/dashboard" \
  -H "Authorization: Bearer $CLINIC_TOKEN")

CLINIC_ADMIN_STATUS=$(echo "$CLINIC_ADMIN_RESPONSE" | tail -n1)
run_test "Clinic blocked from /api/admin/*" "403" "$CLINIC_ADMIN_STATUS"

# Test 11: Clinic CAN access clinic endpoints
echo ""
echo "Test 11: Clinic Accessing Own Endpoints"
echo "---------------------------------------"
CLINIC_OWN_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/clinic/dashboard/stats" \
  -H "Authorization: Bearer $CLINIC_TOKEN")

CLINIC_OWN_STATUS=$(echo "$CLINIC_OWN_RESPONSE" | tail -n1)
if [ "$CLINIC_OWN_STATUS" = "200" ] || [ "$CLINIC_OWN_STATUS" = "404" ]; then
    run_test "Clinic can access /api/clinic/*" "allowed" "allowed"
else
    run_test "Clinic can access /api/clinic/*" "allowed" "blocked"
fi

# Test 12: No token - should be rejected
echo ""
echo "Test 12: Ring-Fencing - No Token Rejected"
echo "-----------------------------------------"
NO_TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/admin/users")

NO_TOKEN_STATUS=$(echo "$NO_TOKEN_RESPONSE" | tail -n1)
run_test "Request without token rejected" "401" "$NO_TOKEN_STATUS"

# Test 13: Invalid token - should be rejected
echo ""
echo "Test 13: Ring-Fencing - Invalid Token Rejected"
echo "----------------------------------------------"
INVALID_TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/admin/users" \
  -H "Authorization: Bearer invalid_token_12345")

INVALID_TOKEN_STATUS=$(echo "$INVALID_TOKEN_RESPONSE" | tail -n1)
run_test "Request with invalid token rejected" "401" "$INVALID_TOKEN_STATUS"

# Test 14: Session info endpoint
echo ""
echo "Test 14: Session Info Endpoint"
echo "------------------------------"
if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    SESSION_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/auth/session-info" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    SESSION_STATUS=$(echo "$SESSION_RESPONSE" | tail -n1)
    run_test "Session info accessible" "200" "$SESSION_STATUS"
fi

# Test 15: Universal logout endpoint
echo ""
echo "Test 15: Universal Logout Endpoint"
echo "----------------------------------"
if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    LOGOUT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/auth/logout" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    LOGOUT_STATUS=$(echo "$LOGOUT_RESPONSE" | tail -n1)
    run_test "Logout endpoint accessible" "200" "$LOGOUT_STATUS"
fi

# Summary
echo ""
echo "=============================="
echo "TEST SUMMARY"
echo "=============================="
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! Ring-fencing is working correctly.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed. Review the output above.${NC}"
    exit 1
fi
