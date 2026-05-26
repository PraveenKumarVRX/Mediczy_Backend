#!/bin/bash

echo "════════════════════════════════════════════"
echo "🧪 SANITY CHECK & SMOKE TEST"
echo "════════════════════════════════════════════"
echo ""
echo "Target User: user@mediczy.com"
echo "WhatsApp Phone: 7373007737"
echo "Test Date: $(date)"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Check if user exists
echo "════════════════════════════════════════════"
echo "STEP 1: Database Check - User Exists?"
echo "════════════════════════════════════════════"
echo ""

if docker ps | grep -q "postgres"; then
    echo -e "${BLUE}ℹ️  Querying database for user@mediczy.com...${NC}"
    
    USER_INFO=$(docker exec -i $(docker ps -qf "name=postgres") psql -U mediczy -d mediczy -c \
      "SELECT id, email, \"phoneNumber\", \"firstName\", \"lastName\", status FROM \"Users\" WHERE email = 'user@mediczy.com' LIMIT 1;" 2>/dev/null)
    
    if echo "$USER_INFO" | grep -q "user@mediczy.com"; then
        echo -e "${GREEN}✅ User exists in database${NC}"
        echo "$USER_INFO" | tail -2
    else
        echo -e "${RED}❌ User NOT found in database${NC}"
        echo "Will need to create user first"
    fi
else
    echo -e "${YELLOW}⚠️  PostgreSQL container not found${NC}"
fi

echo ""
echo "════════════════════════════════════════════"
echo "STEP 2: Check Backend Health"
echo "════════════════════════════════════════════"
echo ""

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/api/health)
if [ "$HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Backend is running (HTTP $HEALTH)${NC}"
else
    echo -e "${YELLOW}⚠️  Backend health check returned HTTP $HEALTH${NC}"
fi

echo ""
echo "════════════════════════════════════════════"
echo "STEP 3: OTP Send Test - Email"
echo "════════════════════════════════════════════"
echo ""

echo -e "${BLUE}ℹ️  Testing: POST /api/users/login/send-otp${NC}"
echo "Request: {\"identifier\": \"user@mediczy.com\"}"
echo ""

SEND_RESPONSE=$(curl -s -X POST http://localhost:8888/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@mediczy.com"}')

echo "Response:"
echo "$SEND_RESPONSE" | jq '.' 2>/dev/null || echo "$SEND_RESPONSE"

# Extract OTP if available (debug mode)
OTP=$(echo "$SEND_RESPONSE" | jq -r '.data.otp // empty' 2>/dev/null)
OTP_ID=$(echo "$SEND_RESPONSE" | jq -r '.data.otpId // empty' 2>/dev/null)

if [ -n "$OTP" ]; then
    echo ""
    echo -e "${GREEN}✅ OTP generated (Debug mode enabled): $OTP${NC}"
elif echo "$SEND_RESPONSE" | grep -q '"success":true'; then
    echo ""
    echo -e "${GREEN}✅ OTP send request successful${NC}"
    if [ -n "$OTP_ID" ]; then
        echo -e "${BLUE}ℹ️  OTP ID: $OTP_ID${NC}"
    fi
else
    echo ""
    echo -e "${RED}❌ OTP send failed${NC}"
fi

echo ""
echo "════════════════════════════════════════════"
echo "STEP 4: OTP Send Test - Phone (7373007737)"
echo "════════════════════════════════════════════"
echo ""

echo -e "${BLUE}ℹ️  Testing: POST /api/users/login/send-otp${NC}"
echo "Request: {\"identifier\": \"7373007737\"}"
echo ""

SEND_RESPONSE_PHONE=$(curl -s -X POST http://localhost:8888/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "7373007737"}')

echo "Response:"
echo "$SEND_RESPONSE_PHONE" | jq '.' 2>/dev/null || echo "$SEND_RESPONSE_PHONE"

# Extract OTP if available
OTP_PHONE=$(echo "$SEND_RESPONSE_PHONE" | jq -r '.data.otp // empty' 2>/dev/null)

if [ -n "$OTP_PHONE" ]; then
    echo ""
    echo -e "${GREEN}✅ OTP generated for phone: $OTP_PHONE${NC}"
    OTP=$OTP_PHONE  # Use phone OTP for verify test
elif echo "$SEND_RESPONSE_PHONE" | grep -q '"success":true'; then
    echo ""
    echo -e "${GREEN}✅ OTP send request successful${NC}"
else
    echo ""
    echo -e "${RED}❌ OTP send failed for phone${NC}"
fi

echo ""
echo "════════════════════════════════════════════"
echo "STEP 5: Check n8n/Email Configuration"
echo "════════════════════════════════════════════"
echo ""

if docker ps | grep -q "mediczy-backend"; then
    echo -e "${BLUE}ℹ️  Checking OTP delivery configuration...${NC}"
    
    N8N_STATUS=$(docker exec mediczy-backend bash -c 'echo $USE_N8N_OTP' 2>/dev/null)
    OTP_DEBUG=$(docker exec mediczy-backend bash -c 'echo $OTP_DEBUG_RESPONSE' 2>/dev/null)
    SMTP=$(docker exec mediczy-backend bash -c 'echo $SMTP_HOST' 2>/dev/null)
    
    echo "Configuration:"
    echo "  USE_N8N_OTP: $N8N_STATUS"
    echo "  OTP_DEBUG_RESPONSE: $OTP_DEBUG"
    echo "  SMTP_HOST: $SMTP"
else
    echo -e "${YELLOW}⚠️  Backend container not found${NC}"
fi

echo ""
echo "════════════════════════════════════════════"
echo "STEP 6: OTP Verify Test"
echo "════════════════════════════════════════════"
echo ""

if [ -n "$OTP" ]; then
    echo -e "${BLUE}ℹ️  Testing: POST /api/users/login/verify-otp${NC}"
    echo "Request: {\"identifier\": \"user@mediczy.com\", \"code\": \"$OTP\"}"
    echo ""
    
    VERIFY_RESPONSE=$(curl -s -X POST http://localhost:8888/api/users/login/verify-otp \
      -H "Content-Type: application/json" \
      -d "{\"identifier\": \"user@mediczy.com\", \"code\": \"$OTP\"}")
    
    echo "Response:"
    echo "$VERIFY_RESPONSE" | jq '.' 2>/dev/null || echo "$VERIFY_RESPONSE"
    
    if echo "$VERIFY_RESPONSE" | grep -q '"success":true'; then
        echo ""
        echo -e "${GREEN}✅ OTP verification successful${NC}"
        TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.token // empty' 2>/dev/null)
        if [ -n "$TOKEN" ]; then
            echo -e "${GREEN}✅ JWT Token received${NC}"
            echo "Token (first 50 chars): ${TOKEN:0:50}..."
        fi
    else
        echo ""
        echo -e "${RED}❌ OTP verification failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  OTP not available (debug mode not enabled)${NC}"
    echo "To test verify, manually get OTP from:"
    echo "  - Email inbox for user@mediczy.com"
    echo "  - WhatsApp message to 7373007737"
    echo ""
    echo "Then run: curl -X POST http://localhost:8888/api/users/login/verify-otp \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -d '{\"identifier\": \"user@mediczy.com\", \"code\": \"XXXXXX\"}'"
fi

echo ""
echo "════════════════════════════════════════════"
echo "STEP 7: WhatsApp Configuration Check"
echo "════════════════════════════════════════════"
echo ""

if docker ps | grep -q "mediczy-backend"; then
    echo -e "${BLUE}ℹ️  Checking WhatsApp/SMS services...${NC}"
    
    TWILIO_SID=$(docker exec mediczy-backend bash -c 'echo $TWILIO_ACCOUNT_SID' 2>/dev/null | head -c 10)
    TWILIO_PHONE=$(docker exec mediczy-backend bash -c 'echo $TWILIO_PHONE_NUMBER' 2>/dev/null)
    WHATSAPP=$(docker exec mediczy-backend bash -c 'echo $WHATSAPP_ENABLED' 2>/dev/null)
    
    if [ -n "$TWILIO_SID" ] && [ "$TWILIO_SID" != "undefined" ]; then
        echo -e "${GREEN}✅ Twilio is configured${NC}"
        echo "  Account SID: ${TWILIO_SID}..."
        echo "  Phone: $TWILIO_PHONE"
        echo "  WhatsApp: $WHATSAPP"
        echo ""
        echo "WhatsApp OTP will be sent to: +917373007737"
    else
        echo -e "${YELLOW}⚠️  Twilio not configured${NC}"
        echo "WhatsApp messages will not be sent"
    fi
else
    echo -e "${YELLOW}⚠️  Backend container not found${NC}"
fi

echo ""
echo "════════════════════════════════════════════"
echo "STEP 8: Recent Logs"
echo "════════════════════════════════════════════"
echo ""

if docker ps | grep -q "mediczy-backend"; then
    echo -e "${BLUE}ℹ️  Last 10 OTP-related logs:${NC}"
    docker logs mediczy-backend 2>&1 | grep -i "otp\|whatsapp\|send.*otp\|verify.*otp" | tail -10
else
    echo -e "${YELLOW}⚠️  Backend logs not available${NC}"
fi

echo ""
echo "════════════════════════════════════════════"
echo "📊 SMOKE TEST SUMMARY"
echo "════════════════════════════════════════════"
echo ""
echo "✅ Completed sanity checks for:"
echo "   • User: user@mediczy.com"
echo "   • Phone: 7373007737"
echo ""
echo "📋 What happens next:"
echo "   1. User receives OTP via Email"
echo "   2. User receives OTP via WhatsApp (if configured)"
echo "   3. User enters OTP code"
echo "   4. System validates and issues JWT token"
echo ""
echo "🔍 To monitor delivery:"
echo "   tail -f $(docker inspect mediczy-backend --format='{{.LogPath}}')"
echo ""
echo "📧 Email Address: user@mediczy.com"
echo "📱 WhatsApp Number: +917373007737"
echo ""
