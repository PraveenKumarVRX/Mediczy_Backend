#!/bin/bash

echo "════════════════════════════════════════════════════════"
echo "🔍 WHATSAPP OTP DEBUG - Check Why OTP Not Triggering"
echo "════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "═══════════════════════════════════════════════════════"
echo "STEP 1: Current Twilio Configuration"
echo "═══════════════════════════════════════════════════════"
echo ""

echo -e "${BLUE}Checking .env file for Twilio credentials:${NC}"
grep -E "TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|TWILIO_PHONE|WHATSAPP|OTP_TEMPLATE" .env 2>/dev/null || echo "Not found in .env"

echo ""
echo "Current values:"
echo "  TWILIO_ACCOUNT_SID: $(grep TWILIO_ACCOUNT_SID .env | cut -d'=' -f2 | xargs)"
echo "  TWILIO_AUTH_TOKEN: $(grep TWILIO_AUTH_TOKEN .env | cut -d'=' -f2 | xargs | head -c 20)..."
echo "  TWILIO_PHONE_NUMBER: $(grep TWILIO_PHONE_NUMBER .env | cut -d'=' -f2 | xargs)"
echo "  WHATSAPP_ENABLED: $(grep WHATSAPP_ENABLED .env | cut -d'=' -f2 | xargs)"
echo ""

echo "═══════════════════════════════════════════════════════"
echo "STEP 2: Check OTP Code in signup-verification.service.js"
echo "═══════════════════════════════════════════════════════"
echo ""

if grep -q "throw new Error('WhatsApp not configured')" /workspaces/Mediczy/server/services/signup-verification.service.js; then
    echo -e "${RED}❌ FOUND: Error throw when Twilio not configured${NC}"
    echo ""
    echo "Location: signup-verification.service.js (sendOTPViaWhatsApp method)"
    echo ""
    echo "Code snippet:"
    grep -A 3 "if (!this.twilioClient)" /workspaces/Mediczy/server/services/signup-verification.service.js | head -5
else
    echo -e "${GREEN}✅ No Twilio config check found${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "STEP 3: Check OTP Code in user.route.js"
echo "═══════════════════════════════════════════════════════"
echo ""

if grep -q "signupVerificationService.sendOTPViaWhatsApp" /workspaces/Mediczy/server/routes/user.route.js; then
    echo -e "${YELLOW}⚠️  Using signupVerificationService for login WhatsApp OTP${NC}"
    echo ""
    echo "This requires Twilio to be configured!"
else
    echo -e "${GREEN}Not using signup verification service${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "STEP 4: Check Alternative OTP Services"
echo "═══════════════════════════════════════════════════════"
echo ""

echo "Available OTP Services:"
echo ""

if [ -f "/workspaces/Mediczy/server/services/password-reset.service.js" ]; then
    echo -e "${BLUE}✅ password-reset.service.js${NC} (has WhatsApp OTP)"
    if grep -q "async sendOTPViaWhatsApp" /workspaces/Mediczy/server/services/password-reset.service.js; then
        echo "   - Has sendOTPViaWhatsApp method"
    fi
fi

if [ -f "/workspaces/Mediczy/server/services/whatsapp-production.service.js" ]; then
    echo -e "${BLUE}✅ whatsapp-production.service.js${NC} (production WhatsApp)"
    if grep -q "sendOTP" /workspaces/Mediczy/server/services/whatsapp-production.service.js; then
        echo "   - Has sendOTP method"
    fi
fi

if [ -f "/workspaces/Mediczy/server/services/n8n-otp.service.js" ]; then
    echo -e "${BLUE}✅ n8n-otp.service.js${NC} (n8n webhook delivery)"
    if grep -q "sendWhatsAppOTP" /workspaces/Mediczy/server/services/n8n-otp.service.js; then
        echo "   - Has sendWhatsAppOTP method"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "STEP 5: Root Cause Analysis"
echo "═══════════════════════════════════════════════════════"
echo ""

TWILIO_SID=$(grep "TWILIO_ACCOUNT_SID=" .env | cut -d'=' -f2 | xargs)

if [ -z "$TWILIO_SID" ] || [ "$TWILIO_SID" = "your-twilio-account-sid" ]; then
    echo -e "${RED}❌ PROBLEM IDENTIFIED:${NC}"
    echo ""
    echo "Twilio Account SID is NOT configured or is a placeholder!"
    echo ""
    echo "The login OTP endpoint tries to send WhatsApp messages but:"
    echo "1. The signup-verification service checks for this.twilioClient"
    echo "2. If Twilio credentials are missing → twilioClient is NOT initialized"
    echo "3. When sendOTPViaWhatsApp is called → throws 'WhatsApp not configured' error"
    echo "4. The error is caught but no OTP is actually sent"
else
    echo -e "${YELLOW}⚠️  Twilio is configured, investigating further...${NC}"
    echo ""
    
    # Check if the service is even being used
    if ! grep -q "signupVerificationService.sendOTPViaWhatsApp" /workspaces/Mediczy/server/routes/user.route.js 2>/dev/null; then
        echo "But sendOTPViaWhatsApp is NOT being called in the login endpoint!"
    fi
    
    # Check n8n config
    USE_N8N=$(grep "USE_N8N_OTP" .env | cut -d'=' -f2 | xargs)
    echo "n8n OTP enabled: $USE_N8N"
    
    if [ "$USE_N8N" != "false" ]; then
        N8N_URL=$(grep "N8N_WEBHOOK_URL" .env | cut -d'=' -f2 | xargs)
        if [ -z "$N8N_URL" ] || [ "$N8N_URL" = "https://your-n8n-instance.com/webhook/otp-send" ]; then
            echo -e "${YELLOW}⚠️  n8n URL is not configured or is a placeholder${NC}"
        fi
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "STEP 6: Recovery Options"
echo "═══════════════════════════════════════════════════════"
echo ""

echo "To fix WhatsApp OTP login, choose ONE option:"
echo ""
echo -e "${GREEN}Option 1: Configure Twilio (Proper Solution)${NC}"
echo "  1. Get Twilio credentials from https://console.twilio.com"
echo "  2. Update .env with:"
echo "     TWILIO_ACCOUNT_SID=ACxxxxxxxx..."
echo "     TWILIO_AUTH_TOKEN=auth_token_here"
echo "     TWILIO_PHONE_NUMBER=+1234567890"
echo "     WHATSAPP_ENABLED=true"
echo "  3. Restart backend server"
echo ""

echo -e "${GREEN}Option 2: Enable n8n Integration (Recommended)${NC}"
echo "  1. Set up n8n webhook for OTP delivery"
echo "  2. Update .env with:"
echo "     USE_N8N_OTP=true"
echo "     N8N_WEBHOOK_URL=https://your-n8n.com/webhook/..."
echo "  3. Restart backend server"
echo ""

echo -e "${GREEN}Option 3: Use Email-Only OTP (Interim)${NC}"
echo "  1. Modify sendOTPViaWhatsApp to not throw error"
echo "  2. Add fallback to email for WhatsApp requests"
echo ""

echo -e "${YELLOW}Option 4: Enable Debug Mode (Testing)${NC}"
echo "  1. Set OTP_DEBUG_RESPONSE=true in .env"
echo "  2. OTP will be returned in API response"
echo "  3. Backend won't attempt actual delivery"
echo ""

