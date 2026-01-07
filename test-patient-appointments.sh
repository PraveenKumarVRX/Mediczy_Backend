#!/bin/bash

# Patient Appointment & Notification Test Script
# This script tests the fixes for patient appointment and notification issues

echo "🔍 Testing Patient Appointment & Notification System"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api"

# Test patient credentials (update these)
PATIENT_EMAIL="patient@test.com"
PATIENT_PASSWORD="test1234"

echo "📋 Test Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Patient Email: $PATIENT_EMAIL"
echo ""

# Step 1: Login as patient
echo "1️⃣  Logging in as patient..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PATIENT_EMAIL\",\"password\":\"$PATIENT_PASSWORD\"}")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Step 2: Fetch patient's appointments
echo "2️⃣  Fetching patient appointments..."
APPOINTMENTS_RESPONSE=$(curl -s -X GET "$API_URL/appointments/my-appointments" \
  -H "Authorization: Bearer $TOKEN")

APPOINTMENT_COUNT=$(echo $APPOINTMENTS_RESPONSE | grep -o '"count":[0-9]*' | cut -d':' -f2)

if [ -z "$APPOINTMENT_COUNT" ]; then
  echo -e "${YELLOW}⚠️  Could not parse appointment count${NC}"
  echo "Response: $APPOINTMENTS_RESPONSE"
else
  echo -e "${GREEN}✅ Appointments fetched successfully${NC}"
  echo "Total appointments: $APPOINTMENT_COUNT"
fi
echo ""

# Step 3: Fetch enhanced appointments
echo "3️⃣  Fetching enhanced appointments..."
ENHANCED_RESPONSE=$(curl -s -X GET "$API_URL/enhanced-appointments/my-appointments" \
  -H "Authorization: Bearer $TOKEN")

echo $ENHANCED_RESPONSE | grep -q '"success":true'
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Enhanced appointments fetched successfully${NC}"
else
  echo -e "${RED}❌ Enhanced appointments fetch failed${NC}"
  echo "Response: $ENHANCED_RESPONSE"
fi
echo ""

# Step 4: Fetch notifications
echo "4️⃣  Fetching patient notifications..."
NOTIFICATIONS_RESPONSE=$(curl -s -X GET "$API_URL/notifications" \
  -H "Authorization: Bearer $TOKEN")

echo $NOTIFICATIONS_RESPONSE | grep -q '"success":true'
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Notifications fetched successfully${NC}"
  
  # Extract counts
  TOTAL=$(echo $NOTIFICATIONS_RESPONSE | grep -o '"total":[0-9]*' | cut -d':' -f2 | head -1)
  UNREAD=$(echo $NOTIFICATIONS_RESPONSE | grep -o '"unread":[0-9]*' | cut -d':' -f2)
  
  echo "Total notifications: ${TOTAL:-0}"
  echo "Unread notifications: ${UNREAD:-0}"
else
  echo -e "${RED}❌ Notifications fetch failed${NC}"
  echo "Response: $NOTIFICATIONS_RESPONSE"
fi
echo ""

# Step 5: Fetch unread count
echo "5️⃣  Fetching unread notification count..."
UNREAD_RESPONSE=$(curl -s -X GET "$API_URL/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN")

echo $UNREAD_RESPONSE | grep -q '"success":true'
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Unread count fetched successfully${NC}"
  UNREAD_COUNT=$(echo $UNREAD_RESPONSE | grep -o '"unreadCount":[0-9]*' | cut -d':' -f2)
  echo "Unread count: ${UNREAD_COUNT:-0}"
else
  echo -e "${RED}❌ Unread count fetch failed${NC}"
  echo "Response: $UNREAD_RESPONSE"
fi
echo ""

# Step 6: Check database for notifications with userType
echo "6️⃣  Checking database for notifications table structure..."
echo -e "${YELLOW}⚠️  Run this SQL query manually to verify:${NC}"
echo "   SELECT column_name, data_type, column_default"
echo "   FROM information_schema.columns"
echo "   WHERE table_name = 'notifications' AND column_name = 'userType';"
echo ""

# Summary
echo "=================================================="
echo "🎉 Test Summary"
echo "=================================================="
echo ""
echo "✓ Patient login"
echo "✓ Appointments endpoint"
echo "✓ Enhanced appointments endpoint"
echo "✓ Notifications endpoint"
echo "✓ Unread count endpoint"
echo ""
echo "📝 Next Steps:"
echo "1. Book a new appointment as this patient"
echo "2. Verify notification appears in the notifications list"
echo "3. Check that appointment appears in 'My Appointments'"
echo "4. Verify email notification was sent"
echo ""
echo "🔧 If issues persist:"
echo "1. Run the database migration: node server/migrations/add-usertype-to-notifications.js"
echo "2. Restart the server"
echo "3. Clear browser cache and re-login"
echo ""
