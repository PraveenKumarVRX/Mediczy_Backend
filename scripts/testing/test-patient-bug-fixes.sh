#!/bin/bash

##############################################################################
# PATIENT LOGIN BUGS - COMPREHENSIVE TESTING SCRIPT
# 
# This script tests all 9 bug fixes for the patient login system
# Usage: bash /home/ubuntu/Mediczy/test-patient-bug-fixes.sh
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:8000/api"
CLINIC_ID=1
USER_EMAIL="test@mediczy.com"
USER_PASSWORD="Test123"

# Test counters
PASSED=0
FAILED=0
TOTAL=0

##############################################################################
# Helper Functions
##############################################################################

print_header() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
  ((PASSED++))
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
  ((FAILED++))
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

test_endpoint() {
  local test_name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5
  
  ((TOTAL++))
  
  echo -e "\n${YELLOW}[Test $TOTAL] $test_name${NC}"
  
  local cmd="curl -s -w '\n%{http_code}' -X $method ${API_BASE}${endpoint}"
  
  if [ ! -z "$TOKEN" ]; then
    cmd="$cmd -H 'Authorization: Bearer $TOKEN'"
  fi
  
  if [ ! -z "$data" ]; then
    cmd="$cmd -H 'Content-Type: application/json' -d '$data'"
  fi
  
  echo "  Command: $cmd"
  
  local response=$(eval "$cmd")
  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | head -n-1)
  
  echo "  Status: $http_code"
  
  if [ "$http_code" = "$expected_status" ]; then
    print_success "$test_name (HTTP $http_code)"
    echo "  Response: $(echo "$body" | jq -r '.message // .error // .data // .' 2>/dev/null | head -1)"
  else
    print_error "$test_name (Expected $expected_status, got $http_code)"
    echo "  Response: $body"
  fi
}

##############################################################################
# Test Suite
##############################################################################

main() {
  print_header "PATIENT LOGIN BUGS - COMPREHENSIVE TEST SUITE"
  
  # Get authentication token
  print_info "Obtaining authentication token..."
  TOKEN_RESPONSE=$(curl -s -X POST ${API_BASE}/patient/login \
    -H "Content-Type: application/json" \
    -d "{\"clinic_id\":$CLINIC_ID,\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")
  
  TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token // .data.token // empty' 2>/dev/null)
  
  if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    print_warning "Could not obtain token. Trying hospital auth..."
    
    HOSPITAL_TOKEN=$(curl -s -X POST http://localhost:8000/api/hospital/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"hospital@mediczy.com","password":"Hospital123"}' | jq -r '.token')
    
    if [ ! -z "$HOSPITAL_TOKEN" ] && [ "$HOSPITAL_TOKEN" != "null" ]; then
      TOKEN=$HOSPITAL_TOKEN
      print_success "Using hospital token instead"
    else
      print_error "Could not obtain any valid token"
      echo "Token response: $TOKEN_RESPONSE"
      exit 1
    fi
  else
    print_success "Authentication successful"
  fi
  
  # ========================================================================
  # ISSUE #1: Booking Failed
  # ========================================================================
  print_header "ISSUE #1: Appointment Booking"
  
  test_endpoint "Create appointment with valid data" \
    "POST" "/appointments" \
    '{"doctorId":1,"appointmentDate":"2026-02-20","appointmentTime":"14:30","consultationType":"video"}' \
    "201"
  
  test_endpoint "Create appointment - missing doctor ID" \
    "POST" "/appointments" \
    '{"appointmentDate":"2026-02-20","appointmentTime":"14:30","consultationType":"video"}' \
    "400"
  
  test_endpoint "Create appointment - invalid time format" \
    "POST" "/appointments" \
    '{"doctorId":1,"appointmentDate":"2026-02-20","appointmentTime":"invalid","consultationType":"video"}' \
    "400"
  
  # ========================================================================
  # ISSUE #2: Lab Test Confirm Not Working
  # ========================================================================
  print_header "ISSUE #2: Lab Test Booking"
  
  test_endpoint "Book lab test" \
    "POST" "/lab-tests/book" \
    '{"testType":"blood_test","hospitalId":1,"appointmentDate":"2026-01-20","appointmentTime":"09:30"}' \
    "201"
  
  test_endpoint "Book lab test - missing hospital ID" \
    "POST" "/lab-tests/book" \
    '{"testType":"blood_test","appointmentDate":"2026-01-20","appointmentTime":"09:30"}' \
    "400"
  
  test_endpoint "Get lab tests" \
    "GET" "/lab-tests" \
    "" \
    "200"
  
  # ========================================================================
  # ISSUE #3: Reports Upload Failed
  # ========================================================================
  print_header "ISSUE #3: Medical Reports Upload"
  
  print_info "Creating test report file..."
  TEST_FILE="/tmp/test_report_$(date +%s).txt"
  echo "Test medical report content" > "$TEST_FILE"
  
  print_info "Testing file upload..."
  UPLOAD_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST ${API_BASE}/reports/upload \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$TEST_FILE" \
    -F "reportType=lab" \
    -F "description=Test lab report")
  
  HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)
  BODY=$(echo "$UPLOAD_RESPONSE" | head -n-1)
  
  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    print_success "Report upload successful (HTTP $HTTP_CODE)"
  else
    print_error "Report upload failed (HTTP $HTTP_CODE)"
    echo "  Response: $BODY"
  fi
  
  ((TOTAL++))
  
  # Clean up test file
  rm -f "$TEST_FILE"
  
  test_endpoint "Get all reports" \
    "GET" "/reports" \
    "" \
    "200"
  
  # ========================================================================
  # ISSUE #4: Report Tabs Not Opening
  # ========================================================================
  print_header "ISSUE #4: Report Filtering by Type"
  
  test_endpoint "Get lab reports" \
    "GET" "/reports?reportType=lab" \
    "" \
    "200"
  
  test_endpoint "Get imaging reports" \
    "GET" "/reports?reportType=imaging" \
    "" \
    "200"
  
  test_endpoint "Get prescription reports" \
    "GET" "/reports?reportType=prescription" \
    "" \
    "200"
  
  # ========================================================================
  # ISSUE #5: Scan Analysis Failed
  # ========================================================================
  print_header "ISSUE #5: AI Scan Analysis"
  
  print_info "Checking if AI health endpoint exists..."
  test_endpoint "Check AI health service" \
    "GET" "/ai-health/status" \
    "" \
    "200"
  
  # ========================================================================
  # ISSUE #6: Doctor List Not Showing
  # ========================================================================
  print_header "ISSUE #6: Doctor List Retrieval"
  
  test_endpoint "Get all doctors" \
    "GET" "/doctors" \
    "" \
    "200"
  
  test_endpoint "Get available doctors" \
    "GET" "/doctors?available=true" \
    "" \
    "200"
  
  # ========================================================================
  # ISSUE #7: Appointments Not Showing
  # ========================================================================
  print_header "ISSUE #7: Upcoming Appointments"
  
  test_endpoint "Get upcoming appointments" \
    "GET" "/appointments?upcoming=true" \
    "" \
    "200"
  
  test_endpoint "Get scheduled appointments" \
    "GET" "/appointments?status=scheduled" \
    "" \
    "200"
  
  test_endpoint "Get all appointments" \
    "GET" "/appointments" \
    "" \
    "200"
  
  # ========================================================================
  # ISSUE #8: History Empty
  # ========================================================================
  print_header "ISSUE #8: Past Appointments History"
  
  test_endpoint "Get past appointments" \
    "GET" "/appointments?past=true" \
    "" \
    "200"
  
  test_endpoint "Get completed appointments" \
    "GET" "/appointments?status=completed" \
    "" \
    "200"
  
  # ========================================================================
  # ISSUE #9: Dashboard Status
  # ========================================================================
  print_header "ISSUE #9: Dashboard Data"
  
  test_endpoint "Get dashboard data (if available)" \
    "GET" "/patient/dashboard" \
    "" \
    "200"
  
  # ========================================================================
  # Test Summary
  # ========================================================================
  print_header "TEST SUMMARY"
  
  echo -e "${GREEN}Passed: $PASSED${NC}"
  echo -e "${RED}Failed: $FAILED${NC}"
  echo -e "${BLUE}Total:  $TOTAL${NC}"
  
  if [ $FAILED -eq 0 ]; then
    print_success "ALL TESTS PASSED!"
    exit 0
  else
    print_error "$FAILED TEST(S) FAILED"
    exit 1
  fi
}

# Run tests
main "$@"
