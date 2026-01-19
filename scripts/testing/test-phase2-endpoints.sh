#!/bin/bash

# Phase 2 Comprehensive Testing Script
# Tests all Medical Records, EHR, and Vital Signs endpoints

set -e

BASE_URL="http://localhost:8000/api"
HOSPITAL_EMAIL="hospital@mediczy.com"
HOSPITAL_PASSWORD="Hospital123"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Phase 2 API Endpoint Testing"
echo "=========================================="
echo ""

# Step 1: Login as Hospital Admin
echo -e "${BLUE}[1/10] Logging in as Hospital Admin...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/hospital/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$HOSPITAL_EMAIL\",
    \"password\": \"$HOSPITAL_PASSWORD\"
  }")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}Failed to get token. Response: $LOGIN_RESPONSE${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Successfully logged in. Token: ${TOKEN:0:20}...${NC}"
HEADERS="-H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json'"

# Test Data - Patient ID (assuming exists from Phase 1)
PATIENT_ID=1
DOCTOR_ID=2

# Step 2: Create Medical Record
echo -e "\n${BLUE}[2/10] Creating Medical Record...${NC}"
MR_RESPONSE=$(curl -s -X POST "$BASE_URL/hospital/practice/medical-records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"patientId\": $PATIENT_ID,
    \"doctorId\": $DOCTOR_ID,
    \"diagnosis\": \"Hypertension with fever\",
    \"treatment\": \"Prescribed Amlodipine 5mg daily and Paracetamol\",
    \"symptoms\": \"Headache, high BP, body pain\",
    \"recordType\": \"consultation\",
    \"vitalSigns\": {
      \"systolic\": 150,
      \"diastolic\": 95,
      \"temperature\": 38.5
    },
    \"prescriptions\": {
      \"medications\": [
        {\"name\": \"Amlodipine\", \"dosage\": \"5mg\", \"frequency\": \"daily\"},
        {\"name\": \"Paracetamol\", \"dosage\": \"500mg\", \"frequency\": \"3x daily\"}
      ]
    }
  }")

echo "Response: $MR_RESPONSE"
MR_ID=$(echo "$MR_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
echo -e "${GREEN}✓ Medical Record created (ID: $MR_ID)${NC}"

# Step 3: Get Medical Records
echo -e "\n${BLUE}[3/10] Fetching Medical Records...${NC}"
RECORDS=$(curl -s -X GET "$BASE_URL/hospital/practice/medical-records?patientId=$PATIENT_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "Total records: $(echo "$RECORDS" | grep -o '"total":[0-9]*' | cut -d':' -f2)"
echo -e "${GREEN}✓ Successfully retrieved medical records${NC}"

# Step 4: Update Medical Record
echo -e "\n${BLUE}[4/10] Updating Medical Record...${NC}"
UPDATE_RESPONSE=$(curl -s -X PATCH "$BASE_URL/hospital/practice/medical-records/$MR_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"diagnosis\": \"Hypertension - controlled with medication\",
    \"treatment\": \"Continue Amlodipine 5mg daily\"
  }")

echo -e "${GREEN}✓ Medical Record updated${NC}"

# Step 5: Create EHR Record
echo -e "\n${BLUE}[5/10] Creating EHR Record...${NC}"
EHR_RESPONSE=$(curl -s -X POST "$BASE_URL/hospital/practice/ehr" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"patientId\": $PATIENT_ID,
    \"height\": 175,
    \"weight\": 82,
    \"bloodType\": \"O+\",
    \"allergies\": {
      \"items\": [\"Penicillin\", \"Aspirin\"]
    },
    \"chronicDiseases\": {
      \"conditions\": [\"Hypertension\", \"Type 2 Diabetes\"]
    },
    \"emergencyContact\": {
      \"name\": \"John Doe\",
      \"phone\": \"9876543210\",
      \"relationship\": \"Brother\"
    },
    \"insuranceDetails\": {
      \"provider\": \"HDFC Ergo\",
      \"policyNumber\": \"POL123456\"
    }
  }")

echo "Response: $EHR_RESPONSE"
echo -e "${GREEN}✓ EHR Record created${NC}"

# Step 6: Get EHR Record
echo -e "\n${BLUE}[6/10] Fetching EHR Record...${NC}"
EHR_GET=$(curl -s -X GET "$BASE_URL/hospital/practice/ehr/$PATIENT_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "EHR Found: $(echo "$EHR_GET" | grep -o '"ehrNumber":"[^"]*')"
echo -e "${GREEN}✓ Successfully retrieved EHR record${NC}"

# Step 7: Update EHR Record
echo -e "\n${BLUE}[7/10] Updating EHR Record...${NC}"
UPDATE_EHR=$(curl -s -X PATCH "$BASE_URL/hospital/practice/ehr/$PATIENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"weight\": 80,
    \"allergies\": {
      \"items\": [\"Penicillin\", \"Aspirin\", \"Sulfa drugs\"]
    },
    \"medications\": {
      \"current\": [\"Amlodipine 5mg\", \"Metformin 500mg\"]
    }
  }")

echo -e "${GREEN}✓ EHR Record updated${NC}"

# Step 8: Record Vital Signs
echo -e "\n${BLUE}[8/10] Recording Vital Signs...${NC}"
VITAL_RESPONSE=$(curl -s -X POST "$BASE_URL/hospital/practice/vitals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"patientId\": $PATIENT_ID,
    \"systolic\": 145,
    \"diastolic\": 92,
    \"temperature\": 37.2,
    \"heartRate\": 88,
    \"respiratoryRate\": 16,
    \"oxygenSaturation\": 98,
    \"weight\": 80,
    \"height\": 175,
    \"notes\": \"Patient BP controlled with current medication\",
    \"recordedBy\": $DOCTOR_ID
  }")

echo "Response: $VITAL_RESPONSE"
echo -e "${GREEN}✓ Vital Signs recorded${NC}"

# Step 9: Get Vital Signs
echo -e "\n${BLUE}[9/10] Fetching Vital Signs...${NC}"
VITALS=$(curl -s -X GET "$BASE_URL/hospital/practice/vitals?patientId=$PATIENT_ID&latest=true" \
  -H "Authorization: Bearer $TOKEN")

echo "Total vitals: $(echo "$VITALS" | grep -o '"total":[0-9]*' | cut -d':' -f2)"
echo -e "${GREEN}✓ Successfully retrieved vital signs${NC}"

# Step 10: Get Latest Vital Signs
echo -e "\n${BLUE}[10/10] Fetching Latest Vital Signs...${NC}"
LATEST=$(curl -s -X GET "$BASE_URL/hospital/practice/vitals?latest=true" \
  -H "Authorization: Bearer $TOKEN")

echo "Latest vitals count: $(echo "$LATEST" | grep -o '"total":[0-9]*' | cut -d':' -f2)"
echo -e "${GREEN}✓ Successfully retrieved latest vital signs${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Phase 2 Testing Complete!${NC}"
echo "=========================================="
