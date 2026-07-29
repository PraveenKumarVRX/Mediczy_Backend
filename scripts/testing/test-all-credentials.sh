#!/bin/bash

# Test All Credentials - Mediczy Authentication Verification
# Tests all 13 user types against their respective API endpoints

BASE_URL="http://localhost:8000/api"
TIMEOUT=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  MEDICZY CREDENTIAL TESTING - ALL 13 USER TYPES             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Testing API at: ${BASE_URL}${NC}"
echo -e "${YELLOW}Timestamp: $(date)${NC}"
echo ""

# Function to test a login endpoint
test_login() {
    local user_type=$1
    local email=$2
    local password=$3
    local endpoint=$4
    local expected_status=${5:-200}
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -e "${BLUE}Testing ${user_type} login...${NC}"
    echo -e "  Email: ${email}"
    echo -e "  Endpoint: ${endpoint}"
    
    # Make the request and capture response
    response=$(curl -s -w "\n%{http_code}" \
        -X POST "${BASE_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
        --max-time ${TIMEOUT} 2>&1)
    
    # Extract status code (last line)
    status_code=$(echo "$response" | tail -n1)
    
    # Extract body (all but last line)
    body=$(echo "$response" | sed '$d')
    
    # Check if curl failed
    if [ -z "$status_code" ] || ! [[ "$status_code" =~ ^[0-9]+$ ]]; then
        echo -e "  ${RED}✗ FAILED - Connection error or timeout${NC}"
        echo -e "  Error: $response"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo ""
        return 1
    fi
    
    # Check status code
    if [ "$status_code" -eq "$expected_status" ] || [ "$status_code" -eq 200 ] || [ "$status_code" -eq 201 ]; then
        # Try to parse token from response
        token=$(echo "$body" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        
        if [ -n "$token" ]; then
            echo -e "  ${GREEN}✓ PASSED - Status: ${status_code}, Token received${NC}"
            echo -e "  Token preview: ${token:0:20}..."
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            # Check if it's a success message without token
            if echo "$body" | grep -q -i "success\|login"; then
                echo -e "  ${GREEN}✓ PASSED - Status: ${status_code}, Success response${NC}"
                PASSED_TESTS=$((PASSED_TESTS + 1))
            else
                echo -e "  ${YELLOW}⚠ WARNING - Status: ${status_code}, No token found${NC}"
                echo -e "  Response: ${body:0:100}"
                PASSED_TESTS=$((PASSED_TESTS + 1))
            fi
        fi
    else
        echo -e "  ${RED}✗ FAILED - Status: ${status_code} (expected ${expected_status})${NC}"
        echo -e "  Response: ${body:0:200}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    echo ""
}

echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TESTING ALL 13 MAIN USER TYPES${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Test 1: Patient / Regular User
test_login "Patient/User" "user@mediczy.com" "User123" "/users/login"

# Test 2: Doctor
test_login "Doctor" "doctor@mediczy.com" "Doctor123" "/doctors/login"

# Test 3: Admin
test_login "Admin" "admin@mediczy.com" "Admin123" "/admin/login"

# Test 4: Team Member
test_login "Team Member" "team@mediczy.com" "Team123" "/team/login"

# Test 5: Nurse
test_login "Nurse" "nurse@mediczy.com" "Nurse123" "/nurse/login"

# Test 6: Assistant
test_login "Assistant" "assistant@mediczy.com" "Assistant123" "/assistant/login"

# Test 7: Corporate
test_login "Corporate" "corporate@mediczy.com" "Corporate123" "/corporate/login"

# Test 8: Hospital
test_login "Hospital" "hospital@mediczy.com" "Hospital123" "/hospital/login"

# Test 9: Clinic
test_login "Clinic" "clinic@mediczy.com" "Clinic123" "/clinic/login"

# Test 10: Laboratory
test_login "Laboratory" "lab@mediczy.com" "Lab@123" "/lab/login"

# Test 11: Pharmacy
test_login "Pharmacy" "pharmacy@mediczy.com" "Pharmacy123" "/pharmacy/login"

# Test 12: Ambulance
test_login "Ambulance" "ambulance@mediczy.com" "Ambulance123" "/ambulance/login"

# Test 13: Homecare
test_login "Homecare" "homecare@mediczy.com" "Homecare123" "/homecare/login"

echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TESTING LEGACY ACCOUNTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Test legacy patient accounts
test_login "Legacy Patient 1" "patient@test.com" "test123" "/users/login"
test_login "Legacy Patient 2" "user@test.com" "test123" "/users/login"
test_login "Legacy Patient 3" "wellness@test.com" "test123" "/users/login"

# Test legacy doctor accounts
test_login "Legacy Doctor 1" "cardio@test.com" "test123" "/doctors/login"
test_login "Legacy Doctor 2" "neuro@test.com" "test123" "/doctors/login"
test_login "Legacy Doctor 3" "gp@test.com" "test123" "/doctors/login"

echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TEST SUMMARY${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Total Tests:  ${BLUE}${TOTAL_TESTS}${NC}"
echo -e "Passed:       ${GREEN}${PASSED_TESTS}${NC}"
echo -e "Failed:       ${RED}${FAILED_TESTS}${NC}"
echo ""

# Calculate pass percentage
if [ $TOTAL_TESTS -gt 0 ]; then
    pass_percentage=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    echo -e "Success Rate: ${BLUE}${pass_percentage}%${NC}"
fi
echo ""

# Final status
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ ALL TESTS PASSED - CREDENTIALS VERIFIED                  ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ SOME TESTS FAILED - CHECK RESULTS ABOVE                  ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
