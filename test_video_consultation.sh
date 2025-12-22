#!/bin/bash

# Video Consultation Test Script
echo "================================================"
echo "📹 VIDEO CONSULTATION TEST"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_URL="http://localhost:8000"

echo -e "${BLUE}Step 1: Register test user${NC}"
echo "----------------------------------------"

# Create test user
USER_EMAIL="video_test_user_$(date +%s)@mediczy.com"
USER_PASSWORD="Test@123456"

USER_REGISTER=$(curl -s -X POST "${API_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Video\",
    \"lastName\": \"TestUser\",
    \"email\": \"${USER_EMAIL}\",
    \"password\": \"${USER_PASSWORD}\",
    \"phoneNumber\": \"+919876543210\"
  }")

echo "$USER_REGISTER" | python3 -m json.tool 2>/dev/null || echo "$USER_REGISTER"
echo ""

# Extract token
USER_TOKEN=$(echo "$USER_REGISTER" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('token', ''))" 2>/dev/null)

if [ -z "$USER_TOKEN" ]; then
  echo -e "${YELLOW}User might already exist, trying to login...${NC}"
  
  USER_LOGIN=$(curl -s -X POST "${API_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"${USER_EMAIL}\",
      \"password\": \"${USER_PASSWORD}\"
    }")
  
  USER_TOKEN=$(echo "$USER_LOGIN" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('token', ''))" 2>/dev/null)
fi

if [ -z "$USER_TOKEN" ]; then
  # Try with existing test user
  echo -e "${YELLOW}Using existing test user...${NC}"
  USER_EMAIL="testuser2025@mediczy.com"
  USER_PASSWORD="Test@123456"
  
  USER_LOGIN=$(curl -s -X POST "${API_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"${USER_EMAIL}\",
      \"password\": \"${USER_PASSWORD}\"
    }")
  
  USER_TOKEN=$(echo "$USER_LOGIN" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('token', ''))" 2>/dev/null)
fi

if [ -z "$USER_TOKEN" ]; then
  echo -e "${RED}❌ Failed to get user token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ User authenticated${NC}"
echo "Token: ${USER_TOKEN:0:20}..."
echo ""

echo -e "${BLUE}Step 2: Get available doctors${NC}"
echo "----------------------------------------"

# Get doctors list
DOCTORS=$(curl -s -X GET "${API_URL}/api/doctors" \
  -H "Authorization: Bearer ${USER_TOKEN}")

echo "$DOCTORS" | python3 -m json.tool 2>/dev/null | head -100 || echo "$DOCTORS" | head -100
echo ""

# Extract first doctor ID
DOCTOR_ID=$(echo "$DOCTORS" | python3 -c "import sys, json; data=json.load(sys.stdin); doctors=data.get('doctors', []); print(doctors[0]['_id'] if doctors else '')" 2>/dev/null)

if [ -z "$DOCTOR_ID" ]; then
  DOCTOR_ID="1"
  echo -e "${YELLOW}⚠️  Using default doctor ID: ${DOCTOR_ID}${NC}"
fi

echo -e "${GREEN}Selected Doctor ID: ${DOCTOR_ID}${NC}"
echo ""

echo -e "${BLUE}Step 3: Book online consultation appointment${NC}"
echo "----------------------------------------"

# Book appointment for tomorrow at 2 PM
TOMORROW=$(date -d "tomorrow" +%Y-%m-%d)
APPOINTMENT_TIME="14:00"

APPOINTMENT=$(curl -s -X POST "${API_URL}/api/appointments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -d "{
    \"doctorId\": ${DOCTOR_ID},
    \"appointmentDate\": \"${TOMORROW}\",
    \"appointmentTime\": \"${APPOINTMENT_TIME}\",
    \"consultationType\": \"online\",
    \"symptoms\": \"Testing video consultation and calendar sync\",
    \"reason\": \"Video consultation test\"
  }")

echo "$APPOINTMENT" | python3 -m json.tool 2>/dev/null || echo "$APPOINTMENT"
echo ""

# Extract appointment ID
APPOINTMENT_ID=$(echo "$APPOINTMENT" | python3 -c "import sys, json; data=json.load(sys.stdin); apt=data.get('appointment', {}); print(apt.get('id', ''))" 2>/dev/null)

if [ -z "$APPOINTMENT_ID" ]; then
  echo -e "${RED}❌ Failed to create appointment${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Appointment created: ID ${APPOINTMENT_ID}${NC}"
echo ""

echo -e "${BLUE}Step 4: Download calendar file (.ics)${NC}"
echo "----------------------------------------"

CALENDAR_FILE="appointment_${APPOINTMENT_ID}.ics"

curl -s -X GET "${API_URL}/api/appointments/${APPOINTMENT_ID}/calendar" \
  -H "Authorization: Bearer ${USER_TOKEN}" \
  -o "${CALENDAR_FILE}"

if [ -f "${CALENDAR_FILE}" ]; then
  FILE_SIZE=$(wc -c < "${CALENDAR_FILE}")
  if [ "$FILE_SIZE" -gt 100 ]; then
    echo -e "${GREEN}✅ Calendar file downloaded: ${CALENDAR_FILE}${NC}"
    echo ""
    echo "Calendar file preview:"
    echo "---"
    head -20 "${CALENDAR_FILE}"
    echo "---"
  else
    echo -e "${RED}❌ Calendar file is too small or invalid${NC}"
    cat "${CALENDAR_FILE}"
  fi
else
  echo -e "${RED}❌ Failed to download calendar file${NC}"
fi

echo ""

echo -e "${BLUE}Step 5: Get video consultation link${NC}"
echo "----------------------------------------"

# Try to get video link (this might require the appointment to be closer to scheduled time)
VIDEO_LINK=$(curl -s -X POST "${API_URL}/api/consultation/${APPOINTMENT_ID}/video-link" \
  -H "Authorization: Bearer ${USER_TOKEN}")

echo "$VIDEO_LINK" | python3 -m json.tool 2>/dev/null || echo "$VIDEO_LINK"
echo ""

# Extract meeting link
MEETING_LINK=$(echo "$VIDEO_LINK" | python3 -c "import sys, json; data=json.load(sys.stdin); video=data.get('video', {}); print(video.get('meetingLink', ''))" 2>/dev/null)

if [ -n "$MEETING_LINK" ]; then
  echo -e "${GREEN}✅ Video consultation link: ${MEETING_LINK}${NC}"
else
  echo -e "${YELLOW}⚠️  Video link not available yet (appointment might need to be within consultation window)${NC}"
fi

echo ""
echo "================================================"
echo -e "${GREEN}📹 TEST SUMMARY${NC}"
echo "================================================"
echo ""
echo "User Email: ${USER_EMAIL}"
echo "Doctor ID: ${DOCTOR_ID}"
echo "Appointment ID: ${APPOINTMENT_ID}"
echo "Appointment Date: ${TOMORROW} at ${APPOINTMENT_TIME}"
echo "Calendar File: ${CALENDAR_FILE}"
if [ -n "$MEETING_LINK" ]; then
  echo "Video Link: ${MEETING_LINK}"
fi
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Open ${CALENDAR_FILE} to add to your calendar"
echo "2. Check your email for appointment confirmation with .ics attachment"
echo "3. Access video consultation from:"
echo "   - Frontend: http://localhost:3000/my-bookings"
echo "   - Direct: http://localhost:3000/consultation/${APPOINTMENT_ID}"
if [ -n "$MEETING_LINK" ]; then
  echo "   - Meeting: ${MEETING_LINK}"
fi
echo ""
echo -e "${GREEN}✅ Video consultation test complete!${NC}"
echo ""
