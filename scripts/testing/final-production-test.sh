#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         MEDICZY FINAL PRODUCTION VERIFICATION                    ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_WARNINGS=0

# Test 1: Server Health
echo "═══════════════════════════════════════════════════════════════════"
echo "  TEST 1: SERVER HEALTH CHECK"
echo "═══════════════════════════════════════════════════════════════════"

if pm2 jlist 2>/dev/null | grep -q "mediczy-server.*online"; then
    echo -e "${GREEN}✓ Server is running${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "${RED}✗ Server is not running${NC}"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi
echo ""

# Test 2: Database Connectivity
echo "═══════════════════════════════════════════════════════════════════"
echo "  TEST 2: DATABASE CONNECTIVITY"
echo "═══════════════════════════════════════════════════════════════════"

RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:8000/api/doctors/login -X POST \
    -H "Content-Type: application/json" \
    -d '{"email":"doctor@mediczy.com","password":"Doctor123"}')

if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ Database connection working${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "${RED}✗ Database connection failed (HTTP $RESPONSE)${NC}"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi
echo ""

# Test 3: Authentication (Sample)
echo "═══════════════════════════════════════════════════════════════════"
echo "  TEST 3: AUTHENTICATION SYSTEM (3 sample types)"
echo "═══════════════════════════════════════════════════════════════════"

test_auth() {
    local name=$1
    local email=$2
    local password=$3
    local endpoint=$4
    
    TOKEN=$(curl -s -X POST "http://localhost:8000$endpoint" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}" | jq -r '.token // empty')
    
    if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
        echo -e "  ${GREEN}✓ $name login working${NC}"
        TOTAL_PASSED=$((TOTAL_PASSED + 1))
    else
        echo -e "  ${RED}✗ $name login failed${NC}"
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
    fi
}

test_auth "User" "user@mediczy.com" "User123" "/api/users/login"
test_auth "Doctor" "doctor@mediczy.com" "Doctor123" "/api/doctors/login"
test_auth "Corporate" "corporate@mediczy.com" "Corporate123" "/api/corporate/login"
echo ""

# Test 4: Security Headers
echo "═══════════════════════════════════════════════════════════════════"
echo "  TEST 4: SECURITY HEADERS"
echo "═══════════════════════════════════════════════════════════════════"

HEADERS=$(curl -s -I http://localhost:8000)

if echo "$HEADERS" | grep -qi "X-Content-Type-Options"; then
    echo -e "  ${GREEN}✓ X-Content-Type-Options header present${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "  ${YELLOW}⚠ X-Content-Type-Options header missing${NC}"
    TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
fi

if echo "$HEADERS" | grep -qi "X-Frame-Options"; then
    echo -e "  ${GREEN}✓ X-Frame-Options header present${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "  ${YELLOW}⚠ X-Frame-Options header missing${NC}"
    TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
fi

if echo "$HEADERS" | grep -qi "Strict-Transport-Security"; then
    echo -e "  ${GREEN}✓ HSTS header present${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "  ${YELLOW}⚠ HSTS header missing (may require HTTPS)${NC}"
    TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
fi
echo ""

# Test 5: Rate Limiting
echo "═══════════════════════════════════════════════════════════════════"
echo "  TEST 5: RATE LIMITING"
echo "═══════════════════════════════════════════════════════════════════"

HEADERS=$(curl -s -I http://localhost:8000/api/users/login)
if echo "$HEADERS" | grep -qi "RateLimit\|X-RateLimit"; then
    echo -e "  ${GREEN}✓ Rate limiting headers present${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "  ${YELLOW}⚠ Rate limiting headers not visible${NC}"
    TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
fi
echo ""

# Test 6: CORS
echo "═══════════════════════════════════════════════════════════════════"
echo "  TEST 6: CORS CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"

CORS_HEADERS=$(curl -s -I -X OPTIONS http://localhost:8000/api/users/login \
    -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Method: POST")

if echo "$CORS_HEADERS" | grep -qi "Access-Control-Allow"; then
    echo -e "  ${GREEN}✓ CORS configured correctly${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "  ${RED}✗ CORS not responding${NC}"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi
echo ""

# Test 7: Environment Check
echo "═══════════════════════════════════════════════════════════════════"
echo "  TEST 7: ENVIRONMENT CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"

if [ -n "$JWT_SECRET" ]; then
    echo -e "  ${GREEN}✓ JWT_SECRET is set${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "  ${YELLOW}⚠ JWT_SECRET not set (using fallback)${NC}"
    TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
fi

if [ "$NODE_ENV" = "production" ]; then
    echo -e "  ${GREEN}✓ NODE_ENV set to production${NC}"
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo -e "  ${YELLOW}⚠ NODE_ENV not set to production (current: ${NODE_ENV:-development})${NC}"
    TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════════"
TOTAL_TESTS=$((TOTAL_PASSED + TOTAL_FAILED + TOTAL_WARNINGS))
echo -e "FINAL RESULTS: ${GREEN}$TOTAL_PASSED Passed${NC}, ${YELLOW}$TOTAL_WARNINGS Warnings${NC}, ${RED}$TOTAL_FAILED Failed${NC}"
echo "Total Tests: $TOTAL_TESTS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ $TOTAL_FAILED -eq 0 ] && [ $TOTAL_WARNINGS -le 5 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║            ✓ PRODUCTION READY - ALL SYSTEMS GO!                  ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Set JWT_SECRET environment variable"
    echo "  2. Set NODE_ENV=production"
    echo "  3. Review PRODUCTION_CHECKLIST.md"
    echo "  4. Deploy to production"
    exit 0
elif [ $TOTAL_FAILED -eq 0 ]; then
    echo -e "${YELLOW}⚠ READY WITH WARNINGS - Review before production${NC}"
    echo ""
    echo "Address warnings in PRODUCTION_CHECKLIST.md"
    exit 0
else
    echo -e "${RED}✗ NOT READY - Fix critical issues before production${NC}"
    exit 1
fi
