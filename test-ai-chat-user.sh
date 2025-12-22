#!/bin/bash

echo "🧪 Testing AI Doctor Chat for User Login"
echo "========================================"
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

echo "💬 Step 2: Test AI Doctor Chat"
echo "------------------------------"

# Test AI chat
CHAT_RESPONSE=$(curl -s -X POST "${API_URL}/ai/working-medical-consult" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "I have a headache. What should I do?",
    "language": "en"
  }')

# Check if response is successful
if echo "$CHAT_RESPONSE" | grep -q '"status":"success"'; then
  echo -e "${GREEN}✅ AI Chat working!${NC}"
  echo ""
  echo "📄 Response:"
  echo "$CHAT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CHAT_RESPONSE"
else
  echo -e "${RED}❌ AI Chat failed${NC}"
  echo ""
  echo "📄 Error Response:"
  echo "$CHAT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CHAT_RESPONSE"
  exit 1
fi

echo ""
echo "🎉 Test completed successfully!"
echo ""

# Extract and display the AI response
AI_MESSAGE=$(echo "$CHAT_RESPONSE" | grep -o '"primary_response":"[^"]*' | cut -d'"' -f4)
if [ ! -z "$AI_MESSAGE" ]; then
  echo "🤖 Dr. iSHA says:"
  echo "----------------"
  echo "$AI_MESSAGE"
fi
