#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
test_pass() {
    echo -e "${GREEN}✅ PASS${NC} - $1"
    ((PASSED++))
}

test_fail() {
    echo -e "${RED}❌ FAIL${NC} - $1"
    ((FAILED++))
}

test_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC} - $1"
    ((WARNINGS++))
}

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        🧪 MEDICZY BOT-AGENT INTEGRATION SANITY TEST          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"

# ============================================================================
# INFRASTRUCTURE TESTS
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🏗️  INFRASTRUCTURE CHECKS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check backend
echo -n "Backend health (http://localhost:8888/health)... "
HEALTH=$(curl -s http://localhost:8888/health 2>/dev/null | jq -r '.status' 2>/dev/null)
if [ "$HEALTH" == "ok" ] || [ "$HEALTH" == "healthy" ]; then
    test_pass "Backend responding"
else
    test_fail "Backend not responding or health check failed"
fi

# Check RocketChat
echo -n "RocketChat version (smart-chat.live)... "
RC_VERSION=$(curl -s -k https://smart-chat.live/api/v1/info 2>/dev/null | jq -r '.version' 2>/dev/null)
if [ -n "$RC_VERSION" ] && [ "$RC_VERSION" != "null" ]; then
    test_pass "RocketChat $RC_VERSION running"
else
    test_warn "RocketChat not accessible"
fi

# Check Docker containers
echo -n "Docker containers (rocketchat & mongodb)... "
ROCKETCHAT_RUNNING=$(docker ps 2>/dev/null | grep -c "rocketchat/rocket.chat")
MONGODB_RUNNING=$(docker ps 2>/dev/null | grep -c "mongodb")
if [ "$ROCKETCHAT_RUNNING" -ge 1 ] && [ "$MONGODB_RUNNING" -ge 1 ]; then
    test_pass "RocketChat and MongoDB containers running"
else
    test_warn "Docker containers not running (may be externalized)"
fi

# Check Redis
echo -n "Redis connectivity (localhost:6379)... "
REDIS_PING=$(redis-cli -h localhost -p 6379 ping 2>/dev/null)
if [ "$REDIS_PING" == "PONG" ]; then
    test_pass "Redis responding"
else
    HEALTH_REDIS=$(curl -s http://localhost:8888/health 2>/dev/null | jq -r '.databases.redis' 2>/dev/null)
    if [ "$HEALTH_REDIS" == "connected" ]; then
        test_pass "Redis connected (via backend health)"
    else
        test_warn "Redis not accessible on localhost:6379"
    fi
fi

# Check PM2
echo -n "PM2 processes... "
PM2_COUNT=$(pm2 list 2>/dev/null | grep -c "online\|running\|unstable")
if [ "$PM2_COUNT" -gt 0 ]; then
    test_pass "PM2 processes running"
else
    test_fail "No PM2 processes running"
fi

# ============================================================================
# SERVICE FILE TESTS
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📁 SERVICE FILES EXIST${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check bot service
echo -n "Bot service (whatsapp-bot.service.js)... "
if [ -f "/home/ubuntu/Mediczy/server/services/whatsapp-bot.service.js" ]; then
    LINES=$(wc -l < /home/ubuntu/Mediczy/server/services/whatsapp-bot.service.js)
    test_pass "Exists ($LINES lines)"
else
    test_fail "Missing"
fi

# Check omnichannel service
echo -n "Omnichannel service (omnichannel-chat.service.js)... "
if [ -f "/home/ubuntu/Mediczy/server/services/omnichannel-chat.service.js" ]; then
    LINES=$(wc -l < /home/ubuntu/Mediczy/server/services/omnichannel-chat.service.js)
    test_pass "Exists ($LINES lines)"
else
    test_fail "Missing"
fi

# Check webhook routes
echo -n "Support chat routes (support-chat.route.js)... "
if [ -f "/home/ubuntu/Mediczy/server/routes/support-chat.route.js" ]; then
    LINES=$(wc -l < /home/ubuntu/Mediczy/server/routes/support-chat.route.js)
    test_pass "Exists ($LINES lines)"
else
    test_fail "Missing"
fi

# ============================================================================
# WEBHOOK ENDPOINT TESTS
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📡 WEBHOOK ENDPOINTS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Test WhatsApp webhook
echo -n "WhatsApp webhook (POST /api/support/webhook/whatsapp)... "
RESPONSE=$(curl -s -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"from":"+441234567890","body":"test"}' \
  --write-out "%{http_code}" -o /tmp/whatsapp_response.json 2>/dev/null)
STATUS_CODE="${RESPONSE: -3}"
if [ "$STATUS_CODE" == "200" ] || [ "$STATUS_CODE" == "201" ]; then
    test_pass "Endpoint responding ($STATUS_CODE)"
else
    test_fail "Endpoint returned $STATUS_CODE"
fi

# Test RocketChat webhook
echo -n "RocketChat webhook (POST /api/support/webhook/rocketchat)... "
RESPONSE=$(curl -s -X POST http://localhost:8888/api/support/webhook/rocketchat \
  -H "Content-Type: application/json" \
  -d '{"room_id":"test","user_id":"test","text":"test"}' \
  --write-out "%{http_code}" -o /tmp/rocketchat_response.json 2>/dev/null)
STATUS_CODE="${RESPONSE: -3}"
if [ "$STATUS_CODE" == "200" ] || [ "$STATUS_CODE" == "201" ]; then
    test_pass "Endpoint responding ($STATUS_CODE)"
else
    test_fail "Endpoint returned $STATUS_CODE"
fi

# ============================================================================
# CONFIGURATION TESTS
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}⚙️  ENVIRONMENT CONFIGURATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check env vars
echo -n "ROCKETCHAT_URL... "
if grep -q "ROCKETCHAT_URL" /home/ubuntu/Mediczy/server/.env; then
    test_pass "Configured"
else
    test_warn "Not found in .env"
fi

echo -n "ROCKETCHAT_ADMIN_USER... "
if grep -q "ROCKETCHAT_ADMIN_USER" /home/ubuntu/Mediczy/server/.env; then
    test_pass "Configured"
else
    test_warn "Not found in .env"
fi

echo -n "ROCKETCHAT_ADMIN_PASSWORD... "
if grep -q "ROCKETCHAT_ADMIN_PASSWORD" /home/ubuntu/Mediczy/server/.env; then
    test_pass "Configured"
else
    test_warn "Not found in .env"
fi

echo -n "DRISHA_AI_API_URL... "
if grep -q "DRISHA_AI_API_URL" /home/ubuntu/Mediczy/server/.env; then
    test_pass "Configured"
else
    test_warn "Not found in .env"
fi

# ============================================================================
# CODE INTEGRATION TESTS
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔗 CODE INTEGRATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check bot service import
echo -n "Bot service import in omnichannel... "
if grep -q "import whatsappBotService from './whatsapp-bot.service.js'" /home/ubuntu/Mediczy/server/services/omnichannel-chat.service.js; then
    test_pass "Imported"
else
    test_fail "Not imported"
fi

# Check bot methods exist
echo -n "Bot method: getBot Response... "
if grep -q "getBotResponse" /home/ubuntu/Mediczy/server/services/whatsapp-bot.service.js; then
    test_pass "Method exists"
else
    test_fail "Method missing"
fi

echo -n "Bot method: determineHandoffNeeded... "
if grep -q "determineHandoffNeeded" /home/ubuntu/Mediczy/server/services/whatsapp-bot.service.js; then
    test_pass "Method exists"
else
    test_fail "Method missing"
fi

echo -n "Omnichannel method: handleWhatsAppMessage... "
if grep -q "async handleWhatsAppMessage" /home/ubuntu/Mediczy/server/services/omnichannel-chat.service.js; then
    test_pass "Method exists"
else
    test_fail "Method missing"
fi

echo -n "Omnichannel method: transferToDepartment... "
if grep -q "async transferToDepartment" /home/ubuntu/Mediczy/server/services/omnichannel-chat.service.js; then
    test_pass "Method exists"
else
    test_fail "Method missing"
fi

# ============================================================================
# ROCKETCHAT FUNCTIONALITY TESTS
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 ROCKETCHAT FUNCTIONALITY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Test RocketChat authentication
echo -n "RocketChat admin authentication... "
AUTH_RESPONSE=$(curl -s -X POST https://smart-chat.live/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"user":"support_admin","password":"Password@1234567"}' \
  -k 2>/dev/null | jq '.status' 2>/dev/null)
if [ "$AUTH_RESPONSE" == '"success"' ]; then
    test_pass "Authentication successful"
else
    test_warn "Authentication failed"
fi

# Test RocketChat channel (#whatsapp)
echo -n "RocketChat #whatsapp channel... "
CHANNELS=$(curl -s -k https://smart-chat.live/api/v1/channels.list \
  -H "X-Auth-Token: uQM8DVr6wFeHwJiZdCMWN6PySPL1MLrcrscpzj2TVgj" \
  -H "X-User-Id: mNXynidBmMpLDv6Fj" \
  2>/dev/null | jq '.channels[] | select(.name=="whatsapp") | .name' 2>/dev/null)
if [ -n "$CHANNELS" ]; then
    test_pass "Channel exists"
else
    test_warn "Channel not found"
fi

# ============================================================================
# DOCUMENTATION TESTS
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📚 DOCUMENTATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

for doc in "BOT_AGENT_INTEGRATION_GUIDE.md" "IMPLEMENTATION_STATUS.md" "SESSION_SUMMARY.md" "bot-agent-integration.test.js"; do
    echo -n "$doc... "
    if [ -f "/home/ubuntu/Mediczy/$doc" ]; then
        LINES=$(wc -l < "/home/ubuntu/Mediczy/$doc")
        test_pass "Exists ($LINES lines)"
    else
        test_warn "Missing"
    fi
done

# ============================================================================
# SYNTAX VALIDATION
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}✅ SYNTAX VALIDATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -n "Bot service syntax... "
if node -c /home/ubuntu/Mediczy/server/services/whatsapp-bot.service.js 2>/dev/null; then
    test_pass "No syntax errors"
else
    test_fail "Syntax errors found"
fi

echo -n "Omnichannel service syntax... "
if node -c /home/ubuntu/Mediczy/server/services/omnichannel-chat.service.js 2>/dev/null; then
    test_pass "No syntax errors"
else
    test_fail "Syntax errors found"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 TEST SUMMARY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

TOTAL=$((PASSED + FAILED + WARNINGS))
PERCENTAGE=$((PASSED * 100 / (PASSED + FAILED)))

echo -e "${GREEN}✅ Passed:${NC}  $PASSED"
echo -e "${RED}❌ Failed:${NC}  $FAILED"
echo -e "${YELLOW}⚠️  Warnings:${NC} $WARNINGS"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Total: $TOTAL | Success Rate: ${PERCENTAGE}%"

if [ "$FAILED" -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL SANITY CHECKS PASSED!${NC}"
    exit 0
else
    echo -e "\n${RED}⚠️  SOME TESTS FAILED - CHECK ERRORS ABOVE${NC}"
    exit 1
fi
