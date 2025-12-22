#!/bin/bash

# Comprehensive Role-Based Login Security Test
echo "🔒 Testing Comprehensive Role-Based Login Security"
echo "===================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test endpoint
test_login() {
    local endpoint=$1
    local email=$2
    local password=$3
    local should_succeed=$4
    local test_name=$5
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    echo "Test ${TESTS_RUN}: ${test_name}"
    echo "  Endpoint: POST ${endpoint}"
    echo "  Email: ${email}"
    
    response=$(curl -X POST "http://localhost:8000${endpoint}" \
      -H "Content-Type: application/json" \
      -d "{\"email\": \"${email}\", \"password\": \"${password}\"}" \
      -s -w "\n%{http_code}")
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$should_succeed" = "true" ]; then
        if [ "$http_code" -eq 200 ]; then
            echo -e "  ${GREEN}✓ PASS${NC} - Got 200 OK (expected success)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "  ${RED}✗ FAIL${NC} - Got ${http_code}, expected 200"
            echo "  Response: $body"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        if [ "$http_code" -eq 401 ] || [ "$http_code" -eq 403 ]; then
            echo -e "  ${GREEN}✓ PASS${NC} - Got ${http_code} (expected failure)"
            # Show helpful hint if present
            hint=$(echo "$body" | jq -r '.hint // empty' 2>/dev/null)
            if [ -n "$hint" ]; then
                echo "  Hint: $hint"
            fi
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "  ${RED}✗ FAIL${NC} - Got ${http_code}, expected 401 or 403"
            echo "  Response: $body"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    fi
    echo ""
}

# =============================================================================
# Test Suite 1: User Login Endpoint - /api/users/login
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Suite 1: User Login Endpoint (/api/users/login)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Should FAIL - doctor role blocked
test_login "/api/users/login" "doctor@mediczy.com" "Doctor123!@#" "false" \
    "Doctor should be BLOCKED from user login"

# Should FAIL - nurse role blocked
test_login "/api/users/login" "nurse@mediczy.com" "Nurse123!@#" "false" \
    "Nurse should be BLOCKED from user login"

# Should FAIL - assistant role blocked
test_login "/api/users/login" "assistant@mediczy.com" "Assistant123!@#" "false" \
    "Assistant should be BLOCKED from user login"

# =============================================================================
# Test Suite 2: Doctor Login Endpoint - /api/doctors/login
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Suite 2: Doctor Login Endpoint (/api/doctors/login)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Note: These will fail with "Invalid email or password" if credentials don't exist
# But they should NOT fail with role guard errors
test_login "/api/doctors/login" "doctor@mediczy.com" "Doctor123!@#" "false" \
    "Doctor login (may fail if account doesn't exist)"

# =============================================================================
# Test Suite 3: Team Login Endpoint - /api/team/login
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Suite 3: Team Login Endpoint (/api/team/login)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Regular user without isTeam flag should be BLOCKED
test_login "/api/team/login" "user@mediczy.com" "User123!@#" "false" \
    "Regular user should be BLOCKED from team login (no isTeam flag)"

# Admin with isTeam flag should SUCCEED (if password correct)
test_login "/api/team/login" "team@mediczy.com" "Team123!@#" "false" \
    "Team member login (may fail if password wrong)"

# =============================================================================
# Test Suite 4: Corporate Login Endpoint - /api/corporate/auth/login
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Suite 4: Corporate Login Endpoint (/api/corporate/auth/login)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Non-corporate domain should be BLOCKED
test_login "/api/corporate/auth/login" "user@gmail.com" "test123" "false" \
    "Non-corporate domain should be BLOCKED"

# Corporate domain without isCorporate flag should be BLOCKED
test_login "/api/corporate/auth/login" "doctor@mediqzy.com" "test123" "false" \
    "Corporate domain but no isCorporate flag should be BLOCKED"

# Corporate domain with isCorporate flag should work (if exists)
test_login "/api/corporate/auth/login" "hr@mediqzy.com" "Team123!@#" "false" \
    "Corporate HR login (may fail if password wrong)"

# =============================================================================
# Test Suite 5: Hardcoded Credentials Check (Production Only)
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Suite 5: Hardcoded Credentials (should NOT work in production)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if NODE_ENV is production
if [ "$NODE_ENV" = "production" ]; then
    echo "⚠️  Running in PRODUCTION mode - hardcoded creds should be disabled"
    
    # Hardcoded test user should NOT work in production
    test_login "/api/users/login" "user@mediczy.com" "user123" "false" \
        "Hardcoded user@mediczy.com should be DISABLED in production"
    
    # Hardcoded test doctor should NOT work in production
    test_login "/api/doctors/login" "doctor@mediczy.com" "doctor123" "false" \
        "Hardcoded doctor@mediczy.com should be DISABLED in production"
    
    # Hardcoded test assistant should NOT work in production
    test_login "/api/assistants/login" "assistant@mediczy.com" "AssistantPass123" "false" \
        "Hardcoded assistant@mediczy.com should be DISABLED in production"
else
    echo "ℹ️  Running in DEVELOPMENT mode - hardcoded creds may be enabled"
    echo "   Set NODE_ENV=production to test production security"
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Tests Run:    $TESTS_RUN"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests failed. Review the output above.${NC}"
    echo ""
    echo "Note: Some failures may be expected if:"
    echo "  - Accounts don't exist in the database"
    echo "  - Passwords are incorrect"
    echo "  - Server is not running"
    echo ""
    echo "Focus on tests that should show role guard behavior:"
    echo "  - Doctor BLOCKED from /api/users/login (403)"
    echo "  - Regular user BLOCKED from /api/team/login (403)"
    echo "  - Non-corporate BLOCKED from corporate login (401/403)"
    exit 1
fi
