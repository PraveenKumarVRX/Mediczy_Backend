#!/bin/bash

# Patient Appointment & Notification Test Script (Uses Real Credentials)
# This script tests the fixes for patient appointment and notification issues

echo "🔍 Testing Patient Appointment & Notification System"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api"

# Load credentials if available
if [ -f /home/ubuntu/Mediczy/.test-credentials ]; then
  source /home/ubuntu/Mediczy/.test-credentials
else
  # Default credentials
  PATIENT_EMAIL="testpatient@mediczy.com"
  PATIENT_PASSWORD="Test@123"
fi

# Allow override via command line
if [ ! -z "$1" ]; then
  PATIENT_EMAIL="$1"
fi

if [ ! -z "$2" ]; then
  PATIENT_PASSWORD="$2"
fi

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
  echo ""
  echo -e "${YELLOW}💡 Tip: Create a test patient first:${NC}"
  echo "   ./create-test-patient.sh"
  echo ""
  echo "Or provide credentials as arguments:"
  echo "   $0 your@email.com yourpassword"
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo ""

# Step 2: Fetch patient's appointments
echo "2️⃣  Fetching patient appointments..."
APPOINTMENTS_RESPONSE=$(curl -s -X GET "$API_URL/appointments/my-appointments" \
  -H "Authorization: Bearer $TOKEN")

if echo "$APPOINTMENTS_RESPONSE" | grep -q '"count"\|"appointments"'; then
  APPOINTMENT_COUNT=$(echo $APPOINTMENTS_RESPONSE | grep -o '"count":[0-9]*' | cut -d':' -f2)
  echo -e "${GREEN}✅ Appointments endpoint working${NC}"
  echo "   Total appointments: ${APPOINTMENT_COUNT:-0}"
else
  echo -e "${YELLOW}⚠️  Could not parse appointments${NC}"
  echo "   Response: ${APPOINTMENTS_RESPONSE:0:100}..."
fi
echo ""

# Step 3: Fetch enhanced appointments
echo "3️⃣  Fetching enhanced appointments..."
ENHANCED_RESPONSE=$(curl -s -X GET "$API_URL/enhanced-appointments/my-appointments" \
  -H "Authorization: Bearer $TOKEN")

if echo "$ENHANCED_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Enhanced appointments endpoint working${NC}"
  
  # Extract and show appointments
  ENHANCED_COUNT=$(echo $ENHANCED_RESPONSE | grep -o '"total":[0-9]*' | cut -d':' -f2 | head -1)
  if [ ! -z "$ENHANCED_COUNT" ]; then
    echo "   Total appointments: $ENHANCED_COUNT"
  fi
else
  echo -e "${YELLOW}⚠️  Enhanced appointments response unexpected${NC}"
  echo "   Response: ${ENHANCED_RESPONSE:0:100}..."
fi
echo ""

# Step 4: Fetch notifications
echo "4️⃣  Fetching patient notifications..."
NOTIFICATIONS_RESPONSE=$(curl -s -X GET "$API_URL/notifications" \
  -H "Authorization: Bearer $TOKEN")

if echo "$NOTIFICATIONS_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Notifications endpoint working${NC}"
  
  # Extract counts
  TOTAL=$(echo $NOTIFICATIONS_RESPONSE | grep -o '"total":[0-9]*' | cut -d':' -f2 | head -1)
  UNREAD=$(echo $NOTIFICATIONS_RESPONSE | grep -o '"unread":[0-9]*' | cut -d':' -f2)
  
  echo "   Total notifications: ${TOTAL:-0}"
  echo "   Unread notifications: ${UNREAD:-0}"
  
  # Show notification types if any
  if [ ! -z "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
    echo ""
    echo -e "${BLUE}   Recent notifications:${NC}"
    echo "$NOTIFICATIONS_RESPONSE" | grep -o '"title":"[^"]*' | cut -d'"' -f4 | head -3 | while read title; do
      echo "   - $title"
    done
  fi
else
  echo -e "${RED}❌ Notifications fetch failed${NC}"
  echo "   Response: ${NOTIFICATIONS_RESPONSE:0:100}..."
fi
echo ""

# Step 5: Fetch unread count
echo "5️⃣  Fetching unread notification count..."
UNREAD_RESPONSE=$(curl -s -X GET "$API_URL/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN")

if echo "$UNREAD_RESPONSE" | grep -q '"success":true'; then
  UNREAD_COUNT=$(echo $UNREAD_RESPONSE | grep -o '"unreadCount":[0-9]*' | cut -d':' -f2)
  echo -e "${GREEN}✅ Unread count endpoint working${NC}"
  echo "   Unread notifications: ${UNREAD_COUNT:-0}"
else
  echo -e "${YELLOW}⚠️  Unread count response unexpected${NC}"
  echo "   Response: ${UNREAD_RESPONSE:0:100}..."
fi
echo ""

# Step 6: Get available doctors for booking test
echo "6️⃣  Checking available doctors..."
DOCTORS_RESPONSE=$(curl -s -X GET "$API_URL/doctors?limit=5" \
  -H "Authorization: Bearer $TOKEN")

if echo "$DOCTORS_RESPONSE" | grep -q '"doctors"\|"data"'; then
  echo -e "${GREEN}✅ Doctors endpoint working${NC}"
  DOCTOR_COUNT=$(echo $DOCTORS_RESPONSE | grep -o '"total":[0-9]*' | cut -d':' -f2 | head -1)
  echo "   Available doctors: ${DOCTOR_COUNT:-unknown}"
else
  echo -e "${YELLOW}⚠️  Could not fetch doctors${NC}"
fi
echo ""

# Summary
echo "=================================================="
echo "📊 Test Summary"
echo "=================================================="
echo ""

# Check all critical endpoints
ALL_PASS=true

echo "$LOGIN_RESPONSE" | grep -q '"token"' && echo -e "${GREEN}✓${NC} Patient login" || { echo -e "${RED}✗${NC} Patient login"; ALL_PASS=false; }
echo "$APPOINTMENTS_RESPONSE" | grep -q '"count"\|"appointments"' && echo -e "${GREEN}✓${NC} Appointments endpoint" || { echo -e "${RED}✗${NC} Appointments endpoint"; ALL_PASS=false; }
echo "$ENHANCED_RESPONSE" | grep -q '"success":true' && echo -e "${GREEN}✓${NC} Enhanced appointments endpoint" || { echo -e "${RED}✗${NC} Enhanced appointments endpoint"; ALL_PASS=false; }
echo "$NOTIFICATIONS_RESPONSE" | grep -q '"success":true' && echo -e "${GREEN}✓${NC} Notifications endpoint" || { echo -e "${RED}✗${NC} Notifications endpoint"; ALL_PASS=false; }
echo "$UNREAD_RESPONSE" | grep -q '"success":true' && echo -e "${GREEN}✓${NC} Unread count endpoint" || { echo -e "${RED}✗${NC} Unread count endpoint"; ALL_PASS=false; }

echo ""

if $ALL_PASS; then
  echo -e "${GREEN}🎉 All endpoints are working!${NC}"
  echo ""
  echo "📝 Manual Testing Steps:"
  echo "1. Login to web app: $BASE_URL/login"
  echo "   Email: $PATIENT_EMAIL"
  echo "   Password: $PATIENT_PASSWORD"
  echo ""
  echo "2. Book a new appointment"
  echo "3. Check notifications (🔔 bell icon)"
  echo "4. Verify appointment in 'My Appointments'"
  echo "5. Check email for appointment confirmation"
else
  echo -e "${RED}❌ Some endpoints failed${NC}"
  echo ""
  echo "Please check:"
  echo "1. Server is running: pm2 status"
  echo "2. Database is accessible"
  echo "3. Server logs: pm2 logs mediczy-server"
fi

echo ""
echo "🔧 Troubleshooting:"
echo "  Check logs: pm2 logs mediczy-server"
echo "  Restart server: pm2 restart mediczy-server"
echo "  View all processes: pm2 status"
echo ""
