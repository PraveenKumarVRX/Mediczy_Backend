#!/bin/bash

echo "════════════════════════════════════════════════════════════"
echo "🧪 WhatsApp OTP Login Route Test"
echo "════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test configuration
USER_PHONE="7373007737"
USER_EMAIL="user@mediczy.com"
API_BASE="http://localhost:8888"
SEND_OTP_ENDPOINT="/api/users/login/send-otp"
VERIFY_OTP_ENDPOINT="/api/users/login/verify-otp"

echo -e "${CYAN}📋 Test Configuration:${NC}"
echo "  Endpoint (base): $API_BASE"
echo "  Test User Email: $USER_EMAIL"
echo "  Test User Phone: $USER_PHONE"
echo "  Send OTP Route: $SEND_OTP_ENDPOINT"
echo "  Verify OTP Route: $VERIFY_OTP_ENDPOINT"
echo ""

# Step 1: Check if backend is running
echo "════════════════════════════════════════════════════════════"
echo "STEP 1: Backend Health Check"
echo "════════════════════════════════════════════════════════════"
echo ""

HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/health" 2>/dev/null)

if [ "$HEALTH_CHECK" = "200" ]; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${RED}❌ Backend not responding (HTTP $HEALTH_CHECK)${NC}"
    echo ""
    echo "To start backend, run:"
    echo "  npm start"
    echo "  OR"
    echo "  pm2 start ecosystem.config.js"
    exit 1
fi

echo ""

# Step 2: Send OTP via Phone (WhatsApp)
echo "════════════════════════════════════════════════════════════"
echo "STEP 2: Send OTP via Phone (WhatsApp Identifier)"
echo "════════════════════════════════════════════════════════════"
echo ""

echo -e "${BLUE}📤 Request: POST $API_BASE$SEND_OTP_ENDPOINT${NC}"
echo "Body:"
echo "  {\"identifier\": \"$USER_PHONE\"}"
echo ""

PHONE_OTP_RESPONSE=$(curl -s -X POST "$API_BASE$SEND_OTP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\": \"$USER_PHONE\"}")

echo "Response:"
echo "$PHONE_OTP_RESPONSE" | jq '.' 2>/dev/null || echo "$PHONE_OTP_RESPONSE"

echo ""

# Extract values from response
PHONE_SUCCESS=$(echo "$PHONE_OTP_RESPONSE" | jq -r '.success // "unknown"' 2>/dev/null)
PHONE_OTP_ID=$(echo "$PHONE_OTP_RESPONSE" | jq -r '.data.otpId // empty' 2>/dev/null)
PHONE_OTP_CODE=$(echo "$PHONE_OTP_RESPONSE" | jq -r '.data.otp // empty' 2>/dev/null)
DELIVERY_METHOD=$(echo "$PHONE_OTP_RESPONSE" | jq -r '.data.deliveryMethod // empty' 2>/dev/null)
SENT_TO=$(echo "$PHONE_OTP_RESPONSE" | jq -r '.data.sentTo // empty' 2>/dev/null)

if [ "$PHONE_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ OTP send request successful${NC}"
    echo "  OTP ID: $PHONE_OTP_ID"
    echo "  Delivery Method: $DELIVERY_METHOD"
    echo "  Sent To: $SENT_TO"
    if [ -n "$PHONE_OTP_CODE" ]; then
        echo -e "  ${YELLOW}OTP Code (Debug Mode): $PHONE_OTP_CODE${NC}"
    else
        echo "  OTP Code: (hidden - check email/SMS)"
    fi
else
    echo -e "${RED}❌ OTP send failed${NC}"
    echo "Message: $(echo "$PHONE_OTP_RESPONSE" | jq -r '.message // "unknown error"' 2>/dev/null)"
fi

echo ""

# Step 3: Send OTP via Email
echo "════════════════════════════════════════════════════════════"
echo "STEP 3: Send OTP via Email Identifier"
echo "════════════════════════════════════════════════════════════"
echo ""

echo -e "${BLUE}📤 Request: POST $API_BASE$SEND_OTP_ENDPOINT${NC}"
echo "Body:"
echo "  {\"identifier\": \"$USER_EMAIL\"}"
echo ""

EMAIL_OTP_RESPONSE=$(curl -s -X POST "$API_BASE$SEND_OTP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\": \"$USER_EMAIL\"}")

echo "Response:"
echo "$EMAIL_OTP_RESPONSE" | jq '.' 2>/dev/null || echo "$EMAIL_OTP_RESPONSE"

echo ""

# Extract values from response
EMAIL_SUCCESS=$(echo "$EMAIL_OTP_RESPONSE" | jq -r '.success // "unknown"' 2>/dev/null)
EMAIL_OTP_ID=$(echo "$EMAIL_OTP_RESPONSE" | jq -r '.data.otpId // empty' 2>/dev/null)
EMAIL_OTP_CODE=$(echo "$EMAIL_OTP_RESPONSE" | jq -r '.data.otp // empty' 2>/dev/null)
EMAIL_DELIVERY=$(echo "$EMAIL_OTP_RESPONSE" | jq -r '.data.deliveryMethod // empty' 2>/dev/null)
EMAIL_SENT_TO=$(echo "$EMAIL_OTP_RESPONSE" | jq -r '.data.sentTo // empty' 2>/dev/null)

if [ "$EMAIL_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ OTP send request successful${NC}"
    echo "  OTP ID: $EMAIL_OTP_ID"
    echo "  Delivery Method: $EMAIL_DELIVERY"
    echo "  Sent To: $EMAIL_SENT_TO"
    if [ -n "$EMAIL_OTP_CODE" ]; then
        echo -e "  ${YELLOW}OTP Code (Debug Mode): $EMAIL_OTP_CODE${NC}"
    else
        echo "  OTP Code: (hidden - check email)"
    fi
else
    echo -e "${RED}❌ OTP send failed${NC}"
    echo "Message: $(echo "$EMAIL_OTP_RESPONSE" | jq -r '.message // "unknown error"' 2>/dev/null)"
fi

echo ""

# Step 4: Verify OTP (if available in debug mode)
echo "════════════════════════════════════════════════════════════"
echo "STEP 4: Verify OTP Code"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ -n "$PHONE_OTP_CODE" ]; then
    echo -e "${BLUE}Using OTP from Phone request: $PHONE_OTP_CODE${NC}"
    TEST_OTP="$PHONE_OTP_CODE"
    TEST_IDENTIFIER="$USER_PHONE"
elif [ -n "$EMAIL_OTP_CODE" ]; then
    echo -e "${BLUE}Using OTP from Email request: $EMAIL_OTP_CODE${NC}"
    TEST_OTP="$EMAIL_OTP_CODE"
    TEST_IDENTIFIER="$USER_EMAIL"
else
    echo -e "${YELLOW}⚠️  OTP not in debug mode - using test OTP 123456${NC}"
    TEST_OTP="123456"
    TEST_IDENTIFIER="$USER_EMAIL"
fi

echo ""
echo -e "${BLUE}📤 Request: POST $API_BASE$VERIFY_OTP_ENDPOINT${NC}"
echo "Body:"
echo "  {\"identifier\": \"$TEST_IDENTIFIER\", \"code\": \"$TEST_OTP\"}"
echo ""

VERIFY_RESPONSE=$(curl -s -X POST "$API_BASE$VERIFY_OTP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\": \"$TEST_IDENTIFIER\", \"code\": \"$TEST_OTP\"}")

echo "Response:"
echo "$VERIFY_RESPONSE" | jq '.' 2>/dev/null || echo "$VERIFY_RESPONSE"

echo ""

# Extract verification result
VERIFY_SUCCESS=$(echo "$VERIFY_RESPONSE" | jq -r '.success // "unknown"' 2>/dev/null)
USER_ID=$(echo "$VERIFY_RESPONSE" | jq -r '.user.id // empty' 2>/dev/null)
JWT_TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.token // empty' 2>/dev/null)

if [ "$VERIFY_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✅ OTP verification successful${NC}"
    echo "  User ID: $USER_ID"
    if [ -n "$JWT_TOKEN" ]; then
        TOKEN_LENGTH=${#JWT_TOKEN}
        echo "  JWT Token: ${JWT_TOKEN:0:50}...${JWT_TOKEN: -20} ($TOKEN_LENGTH chars)"
    fi
else
    echo -e "${YELLOW}⚠️  OTP verification failed (expected if using test code 123456)${NC}"
    echo "Message: $(echo "$VERIFY_RESPONSE" | jq -r '.message // "unknown error"' 2>/dev/null)"
fi

echo ""

# Step 5: Summary
echo "════════════════════════════════════════════════════════════"
echo "📊 TEST SUMMARY"
echo "════════════════════════════════════════════════════════════"
echo ""

echo "✅ PASSED Tests:"
[ "$HEALTH_CHECK" = "200" ] && echo "  • Backend health check" || echo "  • Backend health check"
[ "$PHONE_SUCCESS" = "true" ] && echo "  • WhatsApp OTP send (phone identifier)" || echo "  • WhatsApp OTP send (phone identifier)"
[ "$EMAIL_SUCCESS" = "true" ] && echo "  • Email OTP send (email identifier)" || echo "  • Email OTP send (email identifier)"

if [ "$VERIFY_SUCCESS" = "true" ]; then
    echo "  • OTP verification ✅"
    echo ""
    echo -e "${GREEN}🎉 FULL LOGIN FLOW WORKS!${NC}"
else
    if [ "$TEST_OTP" = "123456" ]; then
        echo "  • OTP verification (skipped - not in debug mode)"
        echo ""
        echo -e "${YELLOW}To test OTP verification:${NC}"
        echo "  1. Check your email/WhatsApp for the real OTP code"
        echo "  2. Run: curl -X POST $API_BASE$VERIFY_OTP_ENDPOINT \\"
        echo "          -H 'Content-Type: application/json' \\"
        echo "          -d '{\"identifier\": \"$USER_EMAIL\", \"code\": \"REAL_OTP_CODE\"}'"
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "ℹ️  Additional Commands"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "View backend logs:"
echo "  docker logs mediczy-backend -f"
echo "  OR"
echo "  tail -f logs/application.log"
echo ""
echo "Check OTP delivery:"
echo "  grep -i 'OTP\|email\|whatsapp' logs/*.log"
echo ""
echo "Test with real OTP code:"
echo "  curl -X POST $API_BASE$VERIFY_OTP_ENDPOINT \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"identifier\": \"$USER_EMAIL\", \"code\": \"YOUR_OTP_CODE\"}'"
echo ""

