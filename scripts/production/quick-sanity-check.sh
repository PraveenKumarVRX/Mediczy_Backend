#!/bin/bash

##############################################################################
# QUICK SANITY CHECK - Fast Pre-Deployment Validation
# Runs the most critical checks only (under 30 seconds)
##############################################################################

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         MEDICZY QUICK SANITY CHECK                               ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Load server env when running on production host.
SERVER_ENV="/home/ubuntu/Mediczy/server/.env"
if [ -f "$SERVER_ENV" ]; then
    set -a
    . "$SERVER_ENV"
    set +a
fi

BASE_URL="${BASE_URL:-http://localhost:8888}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

CRITICAL_PASS=0
CRITICAL_FAIL=0

# Check 1: Environment Variables
echo "Checking critical environment..."
if [ "$NODE_ENV" = "production" ]; then
    echo -e "${GREEN}✓${NC} NODE_ENV=production"
    CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
    echo -e "${RED}✗${NC} NODE_ENV not production"
    CRITICAL_FAIL=$((CRITICAL_FAIL + 1))
fi

if [ -n "$JWT_SECRET" ] && [ "$JWT_SECRET" != "mediczy-super-secret-key-2024" ]; then
    echo -e "${GREEN}✓${NC} JWT_SECRET configured"
    CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
    echo -e "${RED}✗${NC} JWT_SECRET not set or using fallback"
    CRITICAL_FAIL=$((CRITICAL_FAIL + 1))
fi

# Check 2: Server Running
echo ""
echo "Checking server..."
if pm2 jlist 2>/dev/null | grep -q "mediczy-server.*online"; then
    echo -e "${GREEN}✓${NC} Server running"
    CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
    echo -e "${RED}✗${NC} Server not running"
    CRITICAL_FAIL=$((CRITICAL_FAIL + 1))
fi

# Check 3: Database Connection
echo ""
echo "Checking database..."
DB_TEST=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$BASE_URL/api/users/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"user@mediczy.com","password":"User123"}' 2>/dev/null || echo "000")

if [ "$DB_TEST" = "200" ] || [ "$DB_TEST" = "401" ]; then
    echo -e "${GREEN}✓${NC} Database connected"
    CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
    echo -e "${RED}✗${NC} Database connection failed"
    CRITICAL_FAIL=$((CRITICAL_FAIL + 1))
fi

# Check 4: Authentication
echo ""
echo "Checking authentication..."
AUTH_TEST=$(curl -s -X POST "$BASE_URL/api/doctors/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"doctor@mediczy.com","password":"Doctor123"}' | jq -r '.token // empty' 2>/dev/null)

if [ -n "$AUTH_TEST" ] && [ "$AUTH_TEST" != "null" ]; then
    echo -e "${GREEN}✓${NC} Authentication working"
    CRITICAL_PASS=$((CRITICAL_PASS + 1))
else
    echo -e "${RED}✗${NC} Authentication failed"
    CRITICAL_FAIL=$((CRITICAL_FAIL + 1))
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "Quick Check: ${GREEN}$CRITICAL_PASS passed${NC}, ${RED}$CRITICAL_FAIL failed${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ $CRITICAL_FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ Quick check passed - run full sanity check for complete validation${NC}"
    echo ""
    echo "Run: ./pre-deploy-sanity-check.sh"
    exit 0
else
    echo -e "${RED}✗ Critical issues found - fix before deployment${NC}"
    echo ""
    echo "Run full check: ./pre-deploy-sanity-check.sh"
    exit 1
fi
