#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         MEDICZY PRODUCTION LOGIN VERIFICATION                    ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="${BASE_URL:-https://app.mediqzy.com}"
PASSED=0
FAILED=0
WARNINGS=0

test_login() {
    local name=$1
    local email=$2
    local password=$3
    local endpoint=$4
    
    echo -e "${BLUE}Testing: $name${NC}"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        TOKEN=$(echo "$BODY" | jq -r '.token // empty')
        if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
            echo -e "  ${GREEN}✓ Login successful (HTTP $HTTP_CODE)${NC}"
            echo "  Token: ${TOKEN:0:20}..."
            PASSED=$((PASSED + 1))
            
            # Check for security warnings
            if echo "$BODY" | jq -e '.message | contains("fallback")' > /dev/null 2>&1; then
                echo -e "  ${YELLOW}⚠ Warning: Using fallback JWT secret${NC}"
                WARNINGS=$((WARNINGS + 1))
            fi
        else
            echo -e "  ${RED}✗ No token received${NC}"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "  ${RED}✗ Login failed (HTTP $HTTP_CODE)${NC}"
        echo "  Response: $(echo "$BODY" | jq -c '.' 2>/dev/null || echo "$BODY")"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

echo "═══════════════════════════════════════════════════════════════════"
echo "  DATABASE-BACKED AUTHENTICATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

test_login "User/Patient" "user@mediczy.com" "User123" "/api/users/login"
test_login "Doctor" "doctor@mediczy.com" "Doctor123" "/api/doctors/login"
test_login "Admin" "admin@mediczy.com" "Admin123" "/api/admin/login"
test_login "Team Member" "team@mediczy.com" "Team123" "/api/team/login"
test_login "Nurse" "nurse@mediczy.com" "Nurse123" "/api/nurse/login"
test_login "Doctor Assistant" "assistant@mediczy.com" "Assistant123" "/api/assistant/login"

echo "═══════════════════════════════════════════════════════════════════"
echo "  MOCK DATA AUTHENTICATION (NEEDS DATABASE MIGRATION)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

test_login "Corporate" "corporate@mediczy.com" "Corporate123" "/api/corporate/login"
test_login "Hospital" "hospital@mediczy.com" "Hospital123" "/api/hospital/login"
test_login "Clinic" "clinic@mediczy.com" "Clinic123" "/api/clinic/login"
test_login "Laboratory" "lab@mediczy.com" "Lab@123" "/api/lab/login"
test_login "Pharmacy" "pharmacy@mediczy.com" "Pharmacy123" "/api/pharmacy/login"
test_login "Ambulance" "ambulance@mediczy.com" "Ambulance123" "/api/ambulance/login"
test_login "Homecare" "homecare@mediczy.com" "Homecare123" "/api/homecare/login"

echo "═══════════════════════════════════════════════════════════════════"
TOTAL=$((PASSED + FAILED))
SUCCESS_RATE=$(( PASSED * 100 / TOTAL ))

echo -e "RESULTS: ${GREEN}$PASSED Passed${NC}, ${RED}$FAILED Failed${NC}, ${YELLOW}$WARNINGS Warnings${NC}"
echo "Success Rate: $SUCCESS_RATE%"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ PRODUCTION WARNINGS DETECTED${NC}"
    echo "  - JWT_SECRET environment variable not set (using fallback)"
    echo "  - Set JWT_SECRET before deploying to production"
    echo ""
fi

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL LOGINS WORKING - READY FOR PRODUCTION${NC}"
    exit 0
else
    echo -e "${RED}✗ SOME LOGINS FAILED - FIX BEFORE PRODUCTION${NC}"
    exit 1
fi
