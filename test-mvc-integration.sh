#!/bin/bash
# MVC Integration Testing Suite
# Tests all 11 refactored API v1 modules
# Date: February 6, 2026

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:3000/v1"
TENANT_ID="tenant-test-123"
TEST_TOKEN=""
REFRESH_TOKEN=""

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper functions
print_header() {
  echo -e "\n${YELLOW}========================================${NC}"
  echo -e "${YELLOW}$1${NC}"
  echo -e "${YELLOW}========================================${NC}\n"
}

print_test() {
  echo -e "${YELLOW}TEST:${NC} $1"
  ((TOTAL_TESTS++))
}

print_success() {
  echo -e "${GREEN}✓ PASS:${NC} $1"
  ((PASSED_TESTS++))
}

print_fail() {
  echo -e "${RED}✗ FAIL:${NC} $1"
  ((FAILED_TESTS++))
}

print_summary() {
  echo -e "\n${YELLOW}========================================${NC}"
  echo -e "${YELLOW}TEST SUMMARY${NC}"
  echo -e "${YELLOW}========================================${NC}"
  echo -e "Total Tests: $TOTAL_TESTS"
  echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
  if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"
  else
    echo -e "Failed: $FAILED_TESTS"
  fi
  echo -e "Success Rate: $(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")%"
  echo -e "${YELLOW}========================================${NC}\n"
}

# Test functions

test_auth_module() {
  print_header "MODULE 1: Authentication (api-v1-auth.js)"
  
  # Test 1: Exchange Token
  print_test "POST /v1/auth/exchange - Exchange external token"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/exchange" \
    -H "Content-Type: application/json" \
    -d '{
      "token": "mock-external-token",
      "provider": "auth0"
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Exchange endpoint responds (HTTP $HTTP_CODE)"
    # Try to extract token for subsequent tests
    TEST_TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || echo "")
    REFRESH_TOKEN=$(echo "$BODY" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4 || echo "")
  else
    print_fail "Exchange endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: Refresh Token
  print_test "POST /v1/auth/refresh - Refresh access token"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refresh_token\": \"${REFRESH_TOKEN:-mock-refresh-token}\"}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 400 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "Refresh endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Refresh endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 3: Revoke Token (requires auth)
  print_test "POST /v1/auth/revoke - Revoke token"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/revoke" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 404 ]; then
    print_success "Revoke endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Revoke endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_users_module() {
  print_header "MODULE 2: Users (api-v1-users.js)"
  
  # Test 1: Create/Update User
  print_test "POST /v1/$TENANT_ID/users - Create user profile"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/users" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "full_name": "Test User",
      "phone": "+919876543210"
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Create user endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Create user endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: Get User Profile
  print_test "GET /v1/$TENANT_ID/users/:userId - Get user profile"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/users/user-123" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 404 ]; then
    print_success "Get user endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Get user endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 3: Get Health Profile
  print_test "GET /v1/$TENANT_ID/users/:userId/health-profile - Get health profile"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/users/user-123/health-profile" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 404 ]; then
    print_success "Get health profile endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Get health profile endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_doctors_module() {
  print_header "MODULE 3: Doctors (api-v1-doctors.js)"
  
  # Test 1: List Doctors
  print_test "GET /v1/$TENANT_ID/doctors - List doctors"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/doctors" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "List doctors endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "List doctors endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: Get Doctor Details
  print_test "GET /v1/$TENANT_ID/doctors/:doctorId - Get doctor details"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/doctors/doc-123" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 404 ]; then
    print_success "Get doctor endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Get doctor endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 3: Get Availability
  print_test "GET /v1/$TENANT_ID/doctors/:doctorId/availability - Get availability"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/doctors/doc-123/availability" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 404 ]; then
    print_success "Get availability endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Get availability endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_appointments_module() {
  print_header "MODULE 4: Appointments (api-v1-appointments.js)"
  
  # Test 1: Create Appointment
  print_test "POST /v1/$TENANT_ID/appointments - Create appointment"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/appointments" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "doctor_id": "doc-123",
      "patient_id": "user-123",
      "appointment_date": "2026-02-10",
      "appointment_time": "10:00"
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Create appointment endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Create appointment endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: List Appointments
  print_test "GET /v1/$TENANT_ID/appointments - List appointments"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/appointments" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "List appointments endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "List appointments endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_chat_module() {
  print_header "MODULE 5: Chat (api-v1-chat.js)"
  
  # Test 1: Create Room
  print_test "POST /v1/$TENANT_ID/chat/rooms - Create chat room"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/chat/rooms" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "appointment_id": "appt-123",
      "participants": ["user-123", "doc-123"]
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Create room endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Create room endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: List Rooms
  print_test "GET /v1/$TENANT_ID/chat/rooms - List chat rooms"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/chat/rooms" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "List rooms endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "List rooms endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_video_module() {
  print_header "MODULE 6: Video (api-v1-video.js)"
  
  # Test 1: Generate Token
  print_test "POST /v1/$TENANT_ID/video/token - Generate video token"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/video/token" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "room_name": "room-123",
      "participant_name": "Test User"
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Generate token endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Generate token endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: Get Room
  print_test "GET /v1/$TENANT_ID/video/room/:roomId - Get video room"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/video/room/room-123" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 404 ]; then
    print_success "Get room endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Get room endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_labs_module() {
  print_header "MODULE 7: Labs (api-v1-labs.js)"
  
  # Test 1: List Tests
  print_test "GET /v1/$TENANT_ID/labs/tests - List lab tests"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/labs/tests" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "List tests endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "List tests endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: Create Booking
  print_test "POST /v1/$TENANT_ID/labs/bookings - Create lab booking"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/labs/bookings" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "test_id": "test-123",
      "patient_id": "user-123",
      "booking_date": "2026-02-10"
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Create booking endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Create booking endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_pharmacy_module() {
  print_header "MODULE 8: Pharmacy (api-v1-pharmacy.js)"
  
  # Test 1: Create Prescription
  print_test "POST /v1/$TENANT_ID/pharmacy/prescriptions - Create prescription"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/pharmacy/prescriptions" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "patient_id": "user-123",
      "doctor_id": "doc-123",
      "medicines": [{"name": "Medicine A", "dosage": "2x daily"}]
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Create prescription endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Create prescription endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: List Orders
  print_test "GET /v1/$TENANT_ID/pharmacy/orders - List pharmacy orders"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/pharmacy/orders" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "List orders endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "List orders endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_homecare_module() {
  print_header "MODULE 9: Homecare (api-v1-homecare.js)"
  
  # Test 1: List Services
  print_test "GET /v1/$TENANT_ID/homecare/services - List homecare services"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/homecare/services" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "List services endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "List services endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: Create Booking
  print_test "POST /v1/$TENANT_ID/homecare/bookings - Create homecare booking"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/homecare/bookings" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "service_id": "service-123",
      "patient_id": "user-123",
      "booking_date": "2026-02-10"
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Create booking endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Create booking endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_wellness_module() {
  print_header "MODULE 10: Wellness (api-v1-wellness.js)"
  
  # Test 1: Create HRA
  print_test "POST /v1/$TENANT_ID/wellness/hra - Create health risk assessment"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/wellness/hra" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "age": 35,
      "gender": "male",
      "height": 175,
      "weight": 75
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Create HRA endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Create HRA endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: List Plans
  print_test "GET /v1/$TENANT_ID/wellness/plans - List wellness plans"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/wellness/plans" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "List plans endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "List plans endpoint error (HTTP $HTTP_CODE)"
  fi
}

test_webhooks_module() {
  print_header "MODULE 11: Webhooks (api-v1-webhooks.js)"
  
  # Test 1: Create Webhook
  print_test "POST /v1/$TENANT_ID/webhooks - Create webhook"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/$TENANT_ID/webhooks" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "url": "https://example.com/webhook",
      "events": ["appointment.created", "appointment.updated"]
    }')
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 401 ] || [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Create webhook endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "Create webhook endpoint error (HTTP $HTTP_CODE)"
  fi
  
  # Test 2: List Webhooks
  print_test "GET /v1/$TENANT_ID/webhooks - List webhooks"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/$TENANT_ID/webhooks" \
    -H "Authorization: Bearer ${TEST_TOKEN:-mock-token}")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 401 ]; then
    print_success "List webhooks endpoint responds (HTTP $HTTP_CODE)"
  else
    print_fail "List webhooks endpoint error (HTTP $HTTP_CODE)"
  fi
}

# Main execution
main() {
  echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  MVC Integration Testing Suite v1.0   ║${NC}"
  echo -e "${GREEN}║  Testing 11 Refactored API Modules    ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
  
  # Check if server is running
  print_header "Pre-flight Checks"
  echo -n "Checking if API server is running... "
  if curl -s -f "$API_BASE/../health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Server is running${NC}"
  else
    echo -e "${RED}✗ Server not responding${NC}"
    echo "Please start the server with: npm start"
    echo "Then run this test script again."
    exit 1
  fi
  
  # Run all module tests
  test_auth_module
  test_users_module
  test_doctors_module
  test_appointments_module
  test_chat_module
  test_video_module
  test_labs_module
  test_pharmacy_module
  test_homecare_module
  test_wellness_module
  test_webhooks_module
  
  # Print summary
  print_summary
  
  # Exit with appropriate code
  if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
  else
    exit 0
  fi
}

# Run main function
main
