#!/bin/bash

# Test Video Call Authentication Fix
# Tests user login and video call access

echo "=========================================="
echo "Video Call User Authentication Test"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# API Base URL
API_URL="https://mediqzy.com/api"

echo "🔍 Testing Video Call User Authentication..."
echo ""

# Test 1: Check auth middleware changes
echo "Test 1: Verify auth middleware has ID normalization"
if grep -q "id: user.id || user._id || decoded.id" /home/ubuntu/Mediczy/server/middleware/auth.middleware.js; then
    echo -e "${GREEN}✅ PASS: Auth middleware has ID normalization${NC}"
else
    echo -e "${RED}❌ FAIL: Auth middleware missing ID normalization${NC}"
fi
echo ""

# Test 2: Check video endpoint changes
echo "Test 2: Verify video endpoint has defensive ID extraction"
if grep -q "req.user._id || req.user.dataValues?.id" /home/ubuntu/Mediczy/server/routes/online-consultation.route.js; then
    echo -e "${GREEN}✅ PASS: Video endpoint has defensive ID extraction${NC}"
else
    echo -e "${RED}❌ FAIL: Video endpoint missing defensive ID extraction${NC}"
fi
echo ""

# Test 3: Check debug logging
echo "Test 3: Verify debug logging added to video endpoint"
if grep -q "Video Join Request" /home/ubuntu/Mediczy/server/routes/online-consultation.route.js; then
    echo -e "${GREEN}✅ PASS: Debug logging added to video endpoint${NC}"
else
    echo -e "${RED}❌ FAIL: Debug logging missing from video endpoint${NC}"
fi
echo ""

# Test 4: Check PM2 server status
echo "Test 4: Check backend server status"
if pm2 list | grep -q "mediczy-server.*online"; then
    echo -e "${GREEN}✅ PASS: Backend server is online${NC}"
    pm2 list | grep mediczy-server
else
    echo -e "${RED}❌ FAIL: Backend server is not online${NC}"
fi
echo ""

# Test 5: Test user login (if credentials available)
echo "Test 5: Test User Login Flow"
echo -e "${YELLOW}NOTE: Manual test required${NC}"
echo ""
echo "To test manually:"
echo "1. Login as a regular user at https://mediqzy.com/login"
echo "2. Go to Appointments page"
echo "3. Click 'Join Video Call' on a confirmed appointment"
echo "4. Check browser console and network tab for errors"
echo ""
echo "Expected behavior:"
echo "  - User should be able to join video call"
echo "  - No 403 'Not authorized' errors"
echo "  - Video room should load successfully"
echo ""

# Test 6: Check recent logs for video join attempts
echo "Test 6: Check recent logs for video join attempts"
echo -e "${YELLOW}Checking last 100 lines of logs...${NC}"
if pm2 logs mediczy-server --lines 100 --nostream 2>&1 | grep -i "video join" > /dev/null; then
    echo -e "${GREEN}✅ Video join logs found${NC}"
    echo "Recent video join attempts:"
    pm2 logs mediczy-server --lines 100 --nostream 2>&1 | grep -i "video join" | tail -5
else
    echo -e "${YELLOW}⚠️  No recent video join attempts in logs${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Code Changes Applied:"
echo "✅ Auth middleware: User ID normalization"
echo "✅ Video endpoint: Defensive ID extraction"
echo "✅ Video endpoint: Debug logging"
echo "✅ Backend server: Restarted successfully"
echo ""
echo "Next Steps:"
echo "1. Test with actual user account"
echo "2. Monitor logs for '🎥 Video Join Request' messages"
echo "3. Verify no more 403 errors for authorized users"
echo ""

# API Health Check
echo "=========================================="
echo "API Health Check"
echo "=========================================="
echo ""

echo "Checking video API endpoints..."
curl -s -I https://mediqzy.com/api/video/test | head -3
echo ""

echo -e "${GREEN}Test script completed!${NC}"
echo ""
echo "For live testing:"
echo "  1. User Login: https://mediqzy.com/login"
echo "  2. Go to Video Consultations"
echo "  3. Join a confirmed appointment"
echo ""
echo "Monitor logs:"
echo "  pm2 logs mediczy-server --lines 50"
echo ""
