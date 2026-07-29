#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  MEDICZY AUTHENTICATION SYSTEM - COMPLETE VERIFICATION         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

test_auth() {
    local name=$1
    local email=$2
    local password=$3
    local login_endpoint=$4
    local verify_endpoint=$5
    
    echo -e "${BLUE}Testing $name...${NC}"
    
    # Login
    TOKEN=$(curl -s -X POST "http://localhost:8000$login_endpoint" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}" | jq -r '.token')
    
    if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
        echo "  ✓ Login successful"
        
        # Verify token
        VERIFY=$(curl -s -X GET "http://localhost:8000$verify_endpoint" \
            -H "Authorization: Bearer $TOKEN" | jq -r '.success')
        
        if [ "$VERIFY" = "true" ]; then
            echo -e "  ${GREEN}✓ Token verification successful${NC}"
            PASS=$((PASS + 1))
        else
            echo -e "  ${RED}✗ Token verification failed${NC}"
            FAIL=$((FAIL + 1))
        fi
    else
        echo -e "  ${RED}✗ Login failed${NC}"
        FAIL=$((FAIL + 1))
    fi
    echo ""
}

# Test all user types
test_auth "User/Patient" "user@mediczy.com" "User123" "/api/users/login" "/api/users/profile"
test_auth "Doctor" "doctor@mediczy.com" "Doctor123" "/api/doctors/login" "/api/doctors/profile"
test_auth "Admin" "admin@mediczy.com" "Admin123" "/api/admin/login" "/api/admin/verify"
test_auth "Team" "team@mediczy.com" "Team123" "/api/team/login" "/api/team/verify"
test_auth "Nurse" "nurse@mediczy.com" "Nurse123" "/api/nurse/login" "/api/nurse/verify"
test_auth "Assistant" "assistant@mediczy.com" "Assistant123" "/api/assistant/login" "/api/assistant/verify"
test_auth "Corporate" "corporate@mediczy.com" "Corporate123" "/api/corporate/login" "/api/corporate/verify"
test_auth "Hospital" "hospital@mediczy.com" "Hospital123" "/api/hospital/login" "/api/hospital/verify"
test_auth "Clinic" "clinic@mediczy.com" "Clinic123" "/api/clinic/login" "/api/clinic/verify"
test_auth "Laboratory" "lab@mediczy.com" "Lab@123" "/api/lab/login" "/api/lab/verify"
test_auth "Pharmacy" "pharmacy@mediczy.com" "Pharmacy123" "/api/pharmacy/login" "/api/pharmacy/verify"
test_auth "Ambulance" "ambulance@mediczy.com" "Ambulance123" "/api/ambulance/login" "/api/ambulance/verify"
test_auth "Homecare" "homecare@mediczy.com" "Homecare123" "/api/homecare/login" "/api/homecare/verify"

echo "════════════════════════════════════════════════════════════════"
echo -e "RESULTS: ${GREEN}$PASS Passed${NC}, ${RED}$FAIL Failed${NC}"
echo "Success Rate: $(( PASS * 100 / (PASS + FAIL) ))%"
echo "════════════════════════════════════════════════════════════════"

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ ALL AUTHENTICATION TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    exit 1
fi
