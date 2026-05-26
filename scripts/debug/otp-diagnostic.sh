#!/bin/bash

# OTP Login Diagnostic Script
# Purpose: Check if OTP login is properly configured
# Run: bash otp-diagnostic.sh

echo "🔍 OTP Login Diagnostic Report"
echo "================================"
echo ""
echo "Report Generated: $(date)"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
SUCCESS=0
WARNINGS=0
FAILURES=0

# Helper functions
check_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((SUCCESS++))
}

check_warn() {
    echo -e "${YELLOW}⚠️ WARN${NC}: $1"
    ((WARNINGS++))
}

check_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAILURES++))
}

check_info() {
    echo -e "${BLUE}ℹ️${NC}: $1"
}

echo ""
echo "═══════════════════════════════════════════"
echo "1. BACKEND SERVICE CHECKS"
echo "═══════════════════════════════════════════"
echo ""

# Check if backend is running
if docker ps | grep -q "mediczy-backend"; then
    check_pass "Backend container is running"
else
    check_fail "Backend container is NOT running"
fi

# Check if backend is healthy
if docker exec mediczy-backend curl -s http://localhost:8888/api/health > /dev/null 2>&1; then
    check_pass "Backend health endpoint responding"
else
    check_warn "Backend health endpoint not responding"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "2. DATABASE CHECKS"
echo "═══════════════════════════════════════════"
echo ""

# Check if PostgreSQL is running
if docker ps | grep -q "postgres"; then
    check_pass "PostgreSQL container is running"
else
    check_fail "PostgreSQL container is NOT running"
fi

# Check users table
echo -e "\n${BLUE}Checking for test user (user@mediczy.com)...${NC}"
if docker exec mediczy-backend bash -c 'psql -h postgres -U mediczy -d mediczy -c "SELECT id, email, \"firstName\", status FROM \"Users\" WHERE email = '\''user@mediczy.com'\'';' | grep -q "user@mediczy.com"; then
    check_pass "User user@mediczy.com exists in database"
    # Get status
    USER_STATUS=$(docker exec mediczy-backend bash -c 'psql -h postgres -U mediczy -d mediczy -c "SELECT status FROM \"Users\" WHERE email = '\''user@mediczy.com'\'' LIMIT 1;" | grep -v "status" | tr -d ' ')
    if [ "$USER_STATUS" = "active" ]; then
        check_pass "User status is 'active'"
    else
        check_warn "User status is '$USER_STATUS' (should be 'active')"
    fi
else
    check_fail "User user@mediczy.com NOT found in database"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "3. OTP ENVIRONMENT CONFIGURATION"
echo "═══════════════════════════════════════════"
echo ""

# Check OTP debug response
OTP_DEBUG=$(docker exec mediczy-backend bash -c 'echo $OTP_DEBUG_RESPONSE' 2>/dev/null)
if [ "$OTP_DEBUG" = "true" ]; then
    check_pass "OTP_DEBUG_RESPONSE is enabled"
else
    check_warn "OTP_DEBUG_RESPONSE is disabled (enable for testing)"
fi

# Check n8n configuration
USE_N8N=$(docker exec mediczy-backend bash -c 'echo $USE_N8N_OTP' 2>/dev/null)
if [ "$USE_N8N" = "false" ]; then
    check_warn "n8n OTP is disabled"
elif [ -n "$USE_N8N" ]; then
    check_pass "n8n OTP is configured"
else
    check_warn "n8n OTP configuration not set"
fi

# Check n8n webhook URL
N8N_URL=$(docker exec mediczy-backend bash -c 'echo $N8N_WEBHOOK_URL' 2>/dev/null | sed 's|https://.*@||')
if [ -n "$N8N_URL" ] && [ "$N8N_URL" != "undefined" ]; then
    check_info "n8n webhook URL configured"
else
    check_warn "n8n webhook URL not configured"
fi

# Check email configuration
SMTP_HOST=$(docker exec mediczy-backend bash -c 'echo $SMTP_HOST' 2>/dev/null)
if [ -n "$SMTP_HOST" ] && [ "$SMTP_HOST" != "undefined" ]; then
    check_pass "SMTP configuration detected (email OTP available)"
else
    check_warn "SMTP configuration not found"
fi

# Check SMS/Twilio configuration
TWILIO_SID=$(docker exec mediczy-backend bash -c 'echo $TWILIO_ACCOUNT_SID' 2>/dev/null | head -c 5)
if [ -n "$TWILIO_SID" ] && [ "$TWILIO_SID" != "undef" ]; then
    check_pass "Twilio configuration detected (SMS/WhatsApp OTP available)"
else
    check_warn "Twilio configuration not found"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "4. OTP ENDPOINT CHECKS"
echo "═══════════════════════════════════════════"
echo ""

# Check if endpoints exist
echo -e "\n${BLUE}Testing: POST /api/users/login/send-otp${NC}"
SEND_OTP_RESPONSE=$(curl -s -X POST http://localhost:8888/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "test@test.com"}' \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$SEND_OTP_RESPONSE" | tail -1)
BODY=$(echo "$SEND_OTP_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "400" ]; then
    check_pass "Send OTP endpoint responding (HTTP $HTTP_CODE)"
    if echo "$BODY" | grep -q '"success"'; then
        check_info "Response format is valid JSON"
    fi
else
    check_fail "Send OTP endpoint not responding (HTTP $HTTP_CODE)"
fi

echo -e "\n${BLUE}Testing: POST /api/users/login/verify-otp${NC}"
VERIFY_OTP_RESPONSE=$(curl -s -X POST http://localhost:8888/api/users/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "test@test.com", "code": "000000"}' \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$VERIFY_OTP_RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "400" ]; then
    check_pass "Verify OTP endpoint responding (HTTP $HTTP_CODE)"
else
    check_fail "Verify OTP endpoint not responding (HTTP $HTTP_CODE)"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "5. AUTHENTICATION METHODS CHECK"
echo "═══════════════════════════════════════════"
echo ""

# Test password login (if email/password works, user exists)
echo -e "\n${BLUE}Testing: POST /api/patient/login (email/password)${NC}"
PWD_LOGIN=$(curl -s -X POST http://localhost:8888/api/patient/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@mediczy.com", "password": "test"}' \
  -w "\n%{http_code}" | tail -1)

if [ "$PWD_LOGIN" = "200" ] || [ "$PWD_LOGIN" = "400" ] || [ "$PWD_LOGIN" = "401" ]; then
    check_pass "Password login endpoint accessible"
else
    check_warn "Password login endpoint returned HTTP $PWD_LOGIN"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "6. RECENT LOGS ANALYSIS"
echo "═══════════════════════════════════════════"
echo ""

# Check recent OTP-related logs
echo -e "\n${BLUE}Checking recent OTP logs (last 20 lines)...${NC}"
OTP_LOGS=$(docker logs mediczy-backend 2>&1 | grep -i "otp\|n8n" | tail -10)

if [ -n "$OTP_LOGS" ]; then
    check_pass "Found OTP-related log entries"
    echo -e "${BLUE}Recent OTP logs:${NC}"
    while IFS= read -r line; do
        echo "  $line"
    done <<< "$OTP_LOGS"
else
    check_warn "No recent OTP logs found"
fi

# Check for errors
ERROR_LOGS=$(docker logs mediczy-backend 2>&1 | grep -i "error\|failed\|failed to send" | grep -i otp | tail -5)
if [ -n "$ERROR_LOGS" ]; then
    check_warn "Found OTP-related errors in logs"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "7. OTP CONFIGURATION SUMMARY"
echo "═══════════════════════════════════════════"
echo ""

echo "OTP Delivery Methods Available:"
echo ""
if [ "$OTP_DEBUG" = "true" ]; then
    echo "  ✅ Debug Mode (OTP in response payload)"
fi
if [ "$USE_N8N" != "false" ] && [ -n "$N8N_URL" ]; then
    echo "  ✅ n8n Workflow"
fi
if [ -n "$SMTP_HOST" ] && [ "$SMTP_HOST" != "undefined" ]; then
    echo "  ✅ Email (SMTP)"
fi
if [ -n "$TWILIO_SID" ] && [ "$TWILIO_SID" != "undef" ]; then
    echo "  ✅ SMS/WhatsApp (Twilio)"
fi

# If no delivery methods
if [ "$OTP_DEBUG" != "true" ] && ([ "$USE_N8N" = "false" ] || [ -z "$N8N_URL" ]) && [ -z "$SMTP_HOST" ] && [ -z "$TWILIO_SID" ]; then
    echo -e "  ${RED}❌ NO OTP DELIVERY METHODS CONFIGURED${NC}"
    check_fail "No OTP delivery method is active"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "DIAGNOSTIC SUMMARY"
echo "═══════════════════════════════════════════"
echo ""
echo -e "${GREEN}✅ PASS: $SUCCESS${NC}"
echo -e "${YELLOW}⚠️ WARN: $WARNINGS${NC}"
echo -e "${RED}❌ FAIL: $FAILURES${NC}"
echo ""

if [ $FAILURES -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 OTP Login appears to be fully configured!${NC}"
        echo ""
        echo "Next steps:"
        echo "1. Try OTP login via web: https://app.mediqzy.com"
        echo "2. Check email for OTP"
        echo "3. Enter OTP code to complete login"
    else
        echo -e "${YELLOW}⚠️ OTP Login is mostly configured but may have issues.${NC}"
        echo ""
        echo "Recommended actions:"
        echo "• For testing: Enable OTP_DEBUG_RESPONSE=true"
        echo "• For production: Configure n8n, Email, or Twilio"
        echo "• Check logs: docker logs mediczy-backend | grep -i otp"
    fi
else
    echo -e "${RED}❌ OTP Login has critical issues that need to be fixed.${NC}"
    echo ""
    echo "Required actions:"
    echo "1. Ensure backend container is running"
    echo "2. Create user@mediczy.com if it doesn't exist"
    echo "3. Configure OTP delivery method (n8n, Email, or Twilio)"
    echo "4. Restart backend after configuration changes"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "For detailed troubleshooting:"
echo "  📖 Read: OTP_LOGIN_TROUBLESHOOTING.md"
echo "  🔧 Command: docker logs mediczy-backend | grep -i otp"
echo "═══════════════════════════════════════════"
