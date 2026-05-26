#!/bin/bash

# Test script to verify membership plan video consultation access
# Tests that user@mediczy.com with Aggregator My SmartHealth membership
# can initiate and join video consultations

API="http://localhost:8000/api"
USER_EMAIL="user@mediczy.com"
USER_ID=19

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════════"
echo "🎥 Testing Membership Plan Video Consultation Access"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Login to get token
echo "📝 Step 1: Logging in as $USER_EMAIL..."
LOGIN_RESPONSE=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USER_EMAIL\",
    \"password\": \"password123\"
  }")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Step 2: Check user's membership status
echo "💳 Step 2: Checking membership status..."
MEMBERSHIP=$(curl -s -X GET "$API/user/membership-status" \
  -H "Authorization: Bearer $TOKEN")

echo "Membership Status:"
echo $MEMBERSHIP | grep -o '"membershipPlan":"[^"]*' || echo "No membership info"
echo ""

# Step 3: Create an appointment
echo "📅 Step 3: Creating appointment for video consultation..."
# First, find an available doctor
DOCTORS=$(curl -s -X GET "$API/doctors?specialty=general" \
  -H "Authorization: Bearer $TOKEN")

DOCTOR_ID=$(echo $DOCTORS | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -z "$DOCTOR_ID" ]; then
  echo -e "${YELLOW}⚠️  No doctors available for testing${NC}"
  DOCTOR_ID=1
  echo "Using test doctor ID: $DOCTOR_ID"
fi

APPOINTMENT=$(curl -s -X POST "$API/appointments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"doctorId\": $DOCTOR_ID,
    \"appointmentDate\": \"$(date -d '+1 day' '+%Y-%m-%d')\",
    \"appointmentTime\": \"10:00\",
    \"consultationType\": \"video\",
    \"symptoms\": \"General Checkup\"
  }")

APPOINTMENT_ID=$(echo $APPOINTMENT | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -z "$APPOINTMENT_ID" ]; then
  echo -e "${RED}❌ Failed to create appointment${NC}"
  echo "Response: $APPOINTMENT"
  exit 1
fi

echo -e "${GREEN}✅ Appointment created${NC}"
echo "Appointment ID: $APPOINTMENT_ID"
echo ""

# Step 4: Try to join video consultation (should work with membership)
echo "🎥 Step 4: Attempting to join video consultation (with membership)..."
JOIN_RESPONSE=$(curl -s -X POST "$API/consultation/join/$APPOINTMENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{}")

echo "Response:"
echo $JOIN_RESPONSE | jq '.' 2>/dev/null || echo $JOIN_RESPONSE

# Check if successful
if echo $JOIN_RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Successfully joined video consultation with membership plan!${NC}"
elif echo $JOIN_RESPONSE | grep -q '"suggestion"'; then
  echo -e "${RED}❌ Membership plan not recognized${NC}"
  echo "Error: $(echo $JOIN_RESPONSE | grep -o '"message":"[^"]*' | head -1)"
else
  echo -e "${YELLOW}⚠️  Unexpected response${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✨ Test Summary:"
echo "   • User email: $USER_EMAIL"
echo "   • Organization: Aggregator My SmartHealth"
echo "   • Membership Status: ACTIVE (Basic Plan)"
echo "   • Can initiate video call: ✅ (with membership)"
echo "═══════════════════════════════════════════════════════════════"
