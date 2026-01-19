#!/bin/bash

# Doctor Features Test Script
# Tests prescription creation, patient addition, and notifications

echo "🩺 Testing Doctor Features"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api"

# Doctor credentials (update these or pass as arguments)
if [ ! -z "$1" ]; then
  DOCTOR_EMAIL="$1"
else
  DOCTOR_EMAIL="doctor@mediczy.com"
fi

if [ ! -z "$2" ]; then
  DOCTOR_PASSWORD="$2"
else
  DOCTOR_PASSWORD="Doctor@123"
fi

echo "📋 Test Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Doctor Email: $DOCTOR_EMAIL"
echo ""

# Step 1: Login as doctor
echo "1️⃣  Logging in as doctor..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DOCTOR_EMAIL\",\"password\":\"$DOCTOR_PASSWORD\"}")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Doctor login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  echo ""
  echo -e "${YELLOW}💡 Tip: Update doctor credentials or pass as arguments:${NC}"
  echo "   $0 doctor@example.com password"
  exit 1
fi

echo -e "${GREEN}✅ Doctor login successful${NC}"
echo ""

# Step 2: Test creating a patient
echo "2️⃣  Testing patient creation..."
PATIENT_PHONE="+91$(date +%s | tail -c 10)" # Generate unique phone
CREATE_PATIENT_RESPONSE=$(curl -s -X POST "$API_URL/doctors/my-patients/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Test\",
    \"lastName\": \"Patient\",
    \"phoneNumber\": \"$PATIENT_PHONE\",
    \"email\": \"testpatient$(date +%s)@mediczy.com\",
    \"gender\": \"Male\",
    \"dateOfBirth\": \"1990-01-01\"
  }")

if echo "$CREATE_PATIENT_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Patient creation successful${NC}"
  
  # Extract patient details
  PATIENT_ID=$(echo $CREATE_PATIENT_RESPONSE | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  TEMP_PASSWORD=$(echo $CREATE_PATIENT_RESPONSE | grep -o '"tempPassword":"[^"]*' | cut -d'"' -f4)
  
  echo "   Patient ID: $PATIENT_ID"
  echo "   Phone: $PATIENT_PHONE"
  echo "   Temp Password: $TEMP_PASSWORD"
else
  echo -e "${RED}❌ Patient creation failed${NC}"
  echo "   Response: ${CREATE_PATIENT_RESPONSE:0:200}..."
fi
echo ""

# Step 3: Test creating a prescription
echo "3️⃣  Testing prescription creation..."
PRESCRIPTION_RESPONSE=$(curl -s -X POST "$API_URL/prescriptions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"patientId\": ${PATIENT_ID:-1},
    \"diagnosis\": \"Test Diagnosis - Common Cold\",
    \"chiefComplaints\": \"Fever and headache\",
    \"medications\": [
      {
        \"name\": \"Paracetamol\",
        \"dosage\": \"500mg\",
        \"frequency\": \"Three times daily\",
        \"duration\": \"5 days\",
        \"instructions\": \"Take after meals\"
      }
    ],
    \"instructions\": [
      \"Rest well\",
      \"Drink plenty of water\",
      \"Avoid cold foods\"
    ],
    \"vitals\": {
      \"temperature\": \"98.6F\",
      \"bloodPressure\": \"120/80\"
    }
  }")

if echo "$PRESCRIPTION_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Prescription creation successful${NC}"
  
  # Extract prescription details
  PRESCRIPTION_ID=$(echo $PRESCRIPTION_RESPONSE | grep -o '"prescriptionId":"[^"]*' | cut -d'"' -f4)
  
  if [ ! -z "$PRESCRIPTION_ID" ]; then
    echo "   Prescription ID: $PRESCRIPTION_ID"
  fi
else
  echo -e "${RED}❌ Prescription creation failed${NC}"
  echo "   Response: ${PRESCRIPTION_RESPONSE:0:200}..."
fi
echo ""

# Step 4: Fetch doctor's notifications
echo "4️⃣  Testing doctor notifications..."
NOTIFICATIONS_RESPONSE=$(curl -s -X GET "$API_URL/notifications" \
  -H "Authorization: Bearer $TOKEN")

if echo "$NOTIFICATIONS_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Notifications fetch successful${NC}"
  
  TOTAL=$(echo $NOTIFICATIONS_RESPONSE | grep -o '"total":[0-9]*' | cut -d':' -f2 | head -1)
  UNREAD=$(echo $NOTIFICATIONS_RESPONSE | grep -o '"unread":[0-9]*' | cut -d':' -f2)
  
  echo "   Total notifications: ${TOTAL:-0}"
  echo "   Unread notifications: ${UNREAD:-0}"
  
  # Show appointment-related notifications
  APPOINTMENT_COUNT=$(echo $NOTIFICATIONS_RESPONSE | grep -o '"appointment_request"' | wc -l)
  if [ "$APPOINTMENT_COUNT" -gt 0 ]; then
    echo -e "${BLUE}   📅 Appointment notifications: $APPOINTMENT_COUNT${NC}"
  fi
else
  echo -e "${RED}❌ Notifications fetch failed${NC}"
  echo "   Response: ${NOTIFICATIONS_RESPONSE:0:200}..."
fi
echo ""

# Step 5: Fetch doctor's unread count
echo "5️⃣  Testing unread notification count..."
UNREAD_RESPONSE=$(curl -s -X GET "$API_URL/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN")

if echo "$UNREAD_RESPONSE" | grep -q '"success":true'; then
  UNREAD_COUNT=$(echo $UNREAD_RESPONSE | grep -o '"unreadCount":[0-9]*' | cut -d':' -f2)
  echo -e "${GREEN}✅ Unread count: ${UNREAD_COUNT:-0}${NC}"
else
  echo -e "${YELLOW}⚠️  Could not fetch unread count${NC}"
fi
echo ""

# Step 6: Fetch doctor's prescriptions
echo "6️⃣  Testing prescription retrieval..."
PRESCRIPTIONS_LIST=$(curl -s -X GET "$API_URL/prescriptions/doctor" \
  -H "Authorization: Bearer $TOKEN")

if echo "$PRESCRIPTIONS_LIST" | grep -q '"success":true'; then
  PRESCRIPTION_COUNT=$(echo $PRESCRIPTIONS_LIST | grep -o '"count":[0-9]*' | cut -d':' -f2)
  echo -e "${GREEN}✅ Prescriptions retrieved${NC}"
  echo "   Total prescriptions: ${PRESCRIPTION_COUNT:-0}"
else
  echo -e "${YELLOW}⚠️  Could not fetch prescriptions list${NC}"
  echo "   Response: ${PRESCRIPTIONS_LIST:0:100}..."
fi
echo ""

# Step 7: Fetch doctor's patients
echo "7️⃣  Testing patient list retrieval..."
PATIENTS_LIST=$(curl -s -X GET "$API_URL/doctors/my-patients" \
  -H "Authorization: Bearer $TOKEN")

if echo "$PATIENTS_LIST" | grep -q '"success":true\|"patients"'; then
  echo -e "${GREEN}✅ Patient list retrieved${NC}"
  PATIENT_COUNT=$(echo $PATIENTS_LIST | grep -o '"total":[0-9]*' | cut -d':' -f2 | head -1)
  if [ ! -z "$PATIENT_COUNT" ]; then
    echo "   Total patients: $PATIENT_COUNT"
  fi
else
  echo -e "${YELLOW}⚠️  Could not fetch patient list${NC}"
  echo "   Response: ${PATIENTS_LIST:0:100}..."
fi
echo ""

# Summary
echo "=========================="
echo "📊 Test Summary"
echo "=========================="
echo ""

ALL_PASS=true

echo "$LOGIN_RESPONSE" | grep -q '"token"' && echo -e "${GREEN}✓${NC} Doctor login" || { echo -e "${RED}✗${NC} Doctor login"; ALL_PASS=false; }
echo "$CREATE_PATIENT_RESPONSE" | grep -q '"success":true' && echo -e "${GREEN}✓${NC} Create patient" || { echo -e "${RED}✗${NC} Create patient"; ALL_PASS=false; }
echo "$PRESCRIPTION_RESPONSE" | grep -q '"success":true' && echo -e "${GREEN}✓${NC} Create prescription" || { echo -e "${RED}✗${NC} Create prescription"; ALL_PASS=false; }
echo "$NOTIFICATIONS_RESPONSE" | grep -q '"success":true' && echo -e "${GREEN}✓${NC} Fetch notifications" || { echo -e "${RED}✗${NC} Fetch notifications"; ALL_PASS=false; }
echo "$PRESCRIPTIONS_LIST" | grep -q '"success":true' && echo -e "${GREEN}✓${NC} List prescriptions" || { echo -e "${RED}✗${NC} List prescriptions"; ALL_PASS=false; }
echo "$PATIENTS_LIST" | grep -q '"success":true\|"patients"' && echo -e "${GREEN}✓${NC} List patients" || { echo -e "${RED}✗${NC} List patients"; ALL_PASS=false; }

echo ""

if $ALL_PASS; then
  echo -e "${GREEN}🎉 All doctor features working!${NC}"
  echo ""
  echo "📝 What to test manually in browser:"
  echo "1. Login as doctor: $BASE_URL/doctor/login"
  echo "2. Check notifications bell (🔔) - should show appointment requests"
  echo "3. Go to 'My Patients' - add a new patient"
  echo "4. Go to 'Prescriptions' - create a new prescription"
  echo "5. Verify all saves persist after page refresh"
else
  echo -e "${RED}❌ Some tests failed${NC}"
  echo ""
  echo "Please check:"
  echo "1. Server is running: pm2 status"
  echo "2. Database is accessible"
  echo "3. Server logs: pm2 logs mediczy-server"
  echo "4. Doctor account exists with correct credentials"
fi

echo ""
echo "🔧 Debugging:"
echo "  Check logs: pm2 logs mediczy-server"
echo "  Restart: pm2 restart mediczy-server"
echo "  Status: pm2 status"
echo ""
