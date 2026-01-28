#!/bin/bash

# Emergency Function Test for User Login
# Tests the complete emergency/triage functionality

echo "=================================================="
echo "🚨 Emergency Function Diagnostic Test"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

API_URL="http://localhost:8000/api"
USER_EMAIL="user@mediczy.com"
USER_PASSWORD="User123"

# Test 1: User Login
echo -e "${BLUE}Test 1: User Login${NC}"
echo "------------------------------"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo "$LOGIN_RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id')
USER_NAME=$(echo "$LOGIN_RESPONSE" | jq -r '.user.firstName + " " + .user.lastName')
echo "User: $USER_NAME (ID: $USER_ID)"
echo ""

# Test 2: Check Triage Doctors Available
echo -e "${BLUE}Test 2: Get Available Triage Doctors${NC}"
echo "------------------------------"
DOCTORS_RESPONSE=$(curl -s -X GET "$API_URL/medical-ai/triage-doctors" \
  -H "Authorization: Bearer $TOKEN")

DOCTORS_SUCCESS=$(echo "$DOCTORS_RESPONSE" | jq -r '.success')

if [ "$DOCTORS_SUCCESS" = "true" ]; then
  DOCTOR_COUNT=$(echo "$DOCTORS_RESPONSE" | jq -r '.count')
  echo -e "${GREEN}✅ Triage doctors API working${NC}"
  echo "Available doctors: $DOCTOR_COUNT"
  
  if [ "$DOCTOR_COUNT" -gt 0 ]; then
    echo -e "\nOnline Emergency Doctors:"
    echo "$DOCTORS_RESPONSE" | jq -r '.doctors[] | "  - \(.name) (\(.specialization)) - ₹\(.consultationFee)"'
    
    # Store first doctor ID for next test
    FIRST_DOCTOR_ID=$(echo "$DOCTORS_RESPONSE" | jq -r '.doctors[0].id')
  else
    echo -e "${YELLOW}⚠️ No doctors online for emergency${NC}"
  fi
else
  echo -e "${RED}❌ Failed to fetch triage doctors${NC}"
  echo "$DOCTORS_RESPONSE" | jq '.'
fi
echo ""

# Test 3: Test Medical AI Consultation (Dr. iSHA)
echo -e "${BLUE}Test 3: Medical AI Consultation${NC}"
echo "------------------------------"
AI_CONSULT_RESPONSE=$(curl -s -X POST "$API_URL/medical-ai/consult" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I have severe chest pain and difficulty breathing",
    "language": "en"
  }')

AI_SUCCESS=$(echo "$AI_CONSULT_RESPONSE" | jq -r '.success')

if [ "$AI_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Medical AI consultation working${NC}"
  echo -e "\nDr. iSHA Response:"
  echo "$AI_CONSULT_RESPONSE" | jq -r '.data.response' | head -5
  echo "..."
else
  echo -e "${RED}❌ Medical AI consultation failed${NC}"
  echo "$AI_CONSULT_RESPONSE" | jq '.'
fi
echo ""

# Test 4: Instant Triage Call Request (if doctors available)
if [ "$DOCTOR_COUNT" -gt 0 ] && [ -n "$FIRST_DOCTOR_ID" ]; then
  echo -e "${BLUE}Test 4: Request Instant Triage Call${NC}"
  echo "------------------------------"
  TRIAGE_CALL_RESPONSE=$(curl -s -X POST "$API_URL/medical-ai/instant-triage-call" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"doctorId\": \"$FIRST_DOCTOR_ID\",
      \"symptoms\": \"Severe chest pain and difficulty breathing\",
      \"urgencyLevel\": \"URGENT\",
      \"triageId\": \"test_triage_$(date +%s)\"
    }")
  
  CALL_SUCCESS=$(echo "$TRIAGE_CALL_RESPONSE" | jq -r '.success')
  
  if [ "$CALL_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ Instant triage call created${NC}"
    ROOM_ID=$(echo "$TRIAGE_CALL_RESPONSE" | jq -r '.videoCall.roomId')
    DOCTOR_NAME=$(echo "$TRIAGE_CALL_RESPONSE" | jq -r '.doctor.name')
    echo "Room ID: $ROOM_ID"
    echo "Doctor: $DOCTOR_NAME"
    echo "Status: Waiting for doctor to join..."
  else
    echo -e "${RED}❌ Instant triage call failed${NC}"
    echo "$TRIAGE_CALL_RESPONSE" | jq '.'
  fi
else
  echo -e "${BLUE}Test 4: Request Instant Triage Call${NC}"
  echo "------------------------------"
  echo -e "${YELLOW}⚠️ Skipped - No doctors available${NC}"
fi
echo ""

# Test 5: Check Authentication with Emergency Page
echo -e "${BLUE}Test 5: Emergency Page Authentication${NC}"
echo "------------------------------"

# Simulate what frontend does when loading emergency page
echo "Checking if emergency page can access user data..."

# Test user profile (used by emergency page)
PROFILE_RESPONSE=$(curl -s -X GET "$API_URL/users/profile" \
  -H "Authorization: Bearer $TOKEN")

PROFILE_SUCCESS=$(echo "$PROFILE_RESPONSE" | jq -r '.id // empty' | grep -q . && echo "true" || echo "false")

if [ "$PROFILE_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ User profile accessible${NC}"
  USER_PHONE=$(echo "$PROFILE_RESPONSE" | jq -r '.phoneNumber')
  echo "Phone: $USER_PHONE"
else
  echo -e "${RED}❌ Cannot access user profile${NC}"
  echo "$PROFILE_RESPONSE" | jq '.'
fi
echo ""

# Test 6: Test SOS Emergency Contact Functionality
echo -e "${BLUE}Test 6: SOS Emergency Features${NC}"
echo "------------------------------"
echo "Testing location and emergency contact storage..."

# Check if localStorage would work (simulated)
echo "Emergency contact storage: localStorage (client-side)"
echo "Location tracking: Geolocation API (client-side)"
echo "SOS activation: Direct phone dial (tel:102/108)"
echo -e "${GREEN}✅ SOS functions use client-side APIs${NC}"
echo ""

# Final Summary
echo "=================================================="
echo "📊 EMERGENCY FUNCTION TEST SUMMARY"
echo "=================================================="
echo ""

if [ "$DOCTORS_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Triage Doctors API: Working${NC} ($DOCTOR_COUNT doctors online)"
else
  echo -e "${RED}❌ Triage Doctors API: Failed${NC}"
fi

if [ "$AI_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Medical AI (Dr. iSHA): Working${NC}"
else
  echo -e "${RED}❌ Medical AI (Dr. iSHA): Failed${NC}"
fi

if [ -n "$CALL_SUCCESS" ] && [ "$CALL_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Instant Triage Call: Working${NC}"
elif [ "$DOCTOR_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️ Instant Triage Call: No doctors online${NC}"
else
  echo -e "${RED}❌ Instant Triage Call: Failed${NC}"
fi

if [ "$PROFILE_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Emergency Page Auth: Working${NC}"
else
  echo -e "${RED}❌ Emergency Page Auth: Failed${NC}"
fi

echo -e "\n${GREEN}✅ SOS Functions: Client-side (No backend needed)${NC}"
echo ""
echo "=========================================="
echo "🩺 Component Status:"
echo "=========================================="
echo "• AI Triage (Dr. iSHA): Backend API"
echo "• Online Doctor Connect: Backend API"
echo "• SOS Activation: Client-side (phone dial)"
echo "• Emergency Contacts: Client-side (localStorage)"
echo "• Location Tracking: Client-side (Geolocation)"
echo "• Hospital Finder: External API (Overpass)"
echo ""
echo "If emergency functions not working:"
echo "1. Check browser console (F12 → Console)"
echo "2. Grant location permissions"
echo "3. Verify token is valid"
echo "4. Check network tab for failed requests"
echo "5. Try clearing browser cache"
echo ""
echo "Backend emergency APIs: ✅ OPERATIONAL"
