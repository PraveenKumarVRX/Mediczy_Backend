#!/bin/bash

# Create Test Patient for Appointment Testing
# This script creates a test patient account that can be used for testing

echo "👤 Creating Test Patient Account"
echo "================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api"

# Test patient details
PATIENT_EMAIL="testpatient@mediczy.com"
PATIENT_PASSWORD="Test@123"
PATIENT_FIRST_NAME="Test"
PATIENT_LAST_NAME="Patient"
PATIENT_PHONE="+919876543210"
PATIENT_DOB="1990-01-01"
PATIENT_GENDER="Male"

echo "Creating patient with:"
echo "  Email: $PATIENT_EMAIL"
echo "  Name: $PATIENT_FIRST_NAME $PATIENT_LAST_NAME"
echo ""

# Try to register the patient
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$PATIENT_EMAIL\",
    \"password\": \"$PATIENT_PASSWORD\",
    \"firstName\": \"$PATIENT_FIRST_NAME\",
    \"lastName\": \"$PATIENT_LAST_NAME\",
    \"phoneNumber\": \"$PATIENT_PHONE\",
    \"dateOfBirth\": \"$PATIENT_DOB\",
    \"gender\": \"$PATIENT_GENDER\"
  }")

# Check if registration was successful
if echo "$REGISTER_RESPONSE" | grep -q '"success":true\|"token":\|"user":'; then
  echo -e "${GREEN}✅ Test patient created successfully!${NC}"
  echo ""
  echo "📋 Test Credentials:"
  echo "   Email: $PATIENT_EMAIL"
  echo "   Password: $PATIENT_PASSWORD"
  echo ""
  echo "💾 Save these credentials for testing!"
  echo ""
  
  # Save to a file
  cat > /home/ubuntu/Mediczy/.test-credentials << EOF
# Test Patient Credentials
PATIENT_EMAIL="$PATIENT_EMAIL"
PATIENT_PASSWORD="$PATIENT_PASSWORD"
EOF
  
  echo "✅ Credentials saved to .test-credentials"
  
elif echo "$REGISTER_RESPONSE" | grep -q 'already exists\|duplicate'; then
  echo -e "${YELLOW}⚠️  Patient already exists${NC}"
  echo ""
  echo "📋 Existing Test Credentials:"
  echo "   Email: $PATIENT_EMAIL"
  echo "   Password: $PATIENT_PASSWORD"
  echo ""
  echo "You can use these credentials for testing."
  
else
  echo -e "${RED}❌ Failed to create test patient${NC}"
  echo "Response: $REGISTER_RESPONSE"
  echo ""
  echo -e "${YELLOW}Please create a patient manually:${NC}"
  echo "1. Go to http://localhost:3000/register"
  echo "2. Fill in the registration form"
  echo "3. Use those credentials in the test script"
  exit 1
fi

echo ""
echo "🧪 Next Steps:"
echo "1. Run the updated test script: ./test-patient-appointments-real.sh"
echo "2. Or login manually to test: http://localhost:3000/login"
echo ""
