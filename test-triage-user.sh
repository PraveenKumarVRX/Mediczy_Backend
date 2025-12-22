#!/bin/bash

echo "🚨 Testing Emergency Triage for User Login"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# API Base URL
API_URL="http://localhost:8000/api"

echo "📝 Step 1: User Login"
echo "---------------------"

# Login as user
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/users/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@mediczy.com",
    "password": "User123"
  }')

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

echo "🚑 Step 2: Test Emergency Triage"
echo "--------------------------------"

# Test emergency triage
TRIAGE_RESPONSE=$(curl -s -X POST "${API_URL}/medical-ai/emergency-triage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "symptoms": ["severe chest pain", "shortness of breath", "sweating"],
    "description": "I have severe chest pain that started 30 minutes ago, along with difficulty breathing and cold sweats.",
    "duration": "30 minutes",
    "severity": 9
  }')

# Check if response contains error
if echo "$TRIAGE_RESPONSE" | grep -q '"error"'; then
  echo -e "${RED}❌ Triage failed${NC}"
  echo "$TRIAGE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TRIAGE_RESPONSE"
  exit 1
fi

# Check if response contains success indicator
if echo "$TRIAGE_RESPONSE" | grep -q '"urgencyLevel"\|"assessment"\|"recommendations"'; then
  echo -e "${GREEN}✅ Emergency Triage working!${NC}"
  echo ""
  echo "📄 Response:"
  echo "$TRIAGE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TRIAGE_RESPONSE"
  echo ""
  
  # Extract urgency level
  URGENCY=$(echo "$TRIAGE_RESPONSE" | grep -o '"urgencyLevel":"[^"]*' | cut -d'"' -f4)
  if [ ! -z "$URGENCY" ]; then
    echo -e "${YELLOW}⚠️  Urgency Level: $URGENCY${NC}"
  fi
else
  echo -e "${RED}❌ Unexpected response format${NC}"
  echo "$TRIAGE_RESPONSE"
  exit 1
fi

echo ""
echo "🎉 Test completed successfully!"
echo ""

# Also test the consult endpoint (used by Emergency.tsx)
echo "💬 Step 3: Test Medical AI Consult (Emergency Mode)"
echo "---------------------------------------------------"

CONSULT_RESPONSE=$(curl -s -X POST "${API_URL}/medical-ai/consult" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "EMERGENCY TRIAGE: I have severe abdominal pain and vomiting for 3 hours",
    "language": "en",
    "userContext": {
      "emergencyMode": true
    }
  }')

if echo "$CONSULT_RESPONSE" | grep -q '"response"\|"message"'; then
  echo -e "${GREEN}✅ Medical AI Consult working!${NC}"
  echo ""
  echo "📄 Consult Response:"
  echo "$CONSULT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CONSULT_RESPONSE"
else
  echo -e "${YELLOW}⚠️  Consult response format unexpected${NC}"
  echo "$CONSULT_RESPONSE"
fi

echo ""
echo "✅ All triage tests completed!"
