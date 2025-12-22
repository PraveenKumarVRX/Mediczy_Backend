#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         MEDICZY PRODUCTION READINESS CHECK                       ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
WARNINGS=0

check() {
    local name=$1
    local status=$2
    local message=$3
    
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}✓${NC} $name"
        [ -n "$message" ] && echo "  $message"
        PASSED=$((PASSED + 1))
    elif [ "$status" = "fail" ]; then
        echo -e "${RED}✗${NC} $name"
        echo "  ${RED}$message${NC}"
        FAILED=$((FAILED + 1))
    else
        echo -e "${YELLOW}⚠${NC} $name"
        echo "  ${YELLOW}$message${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
}

echo "═══════════════════════════════════════════════════════════════════"
echo "  ENVIRONMENT VARIABLES"
echo "═══════════════════════════════════════════════════════════════════"

# Check JWT_SECRET
if [ -n "$JWT_SECRET" ]; then
    check "JWT_SECRET" "pass" "Environment variable set"
else
    check "JWT_SECRET" "warn" "Using fallback secret - SET IN PRODUCTION!"
fi

# Check NODE_ENV
if [ "$NODE_ENV" = "production" ]; then
    check "NODE_ENV" "pass" "Set to production"
else
    check "NODE_ENV" "warn" "Not set to production (current: ${NODE_ENV:-development})"
fi

# Check PORT
if [ -n "$PORT" ]; then
    check "PORT" "pass" "Custom port configured: $PORT"
else
    check "PORT" "pass" "Using default port 8000"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  SECURITY CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"

# Check CORS configuration
if grep -q "cors()" server/app.js 2>/dev/null; then
    if grep -q "origin:" server/app.js 2>/dev/null; then
        check "CORS Configuration" "pass" "Origin restrictions configured"
    else
        check "CORS Configuration" "warn" "CORS allows all origins - restrict in production"
    fi
else
    check "CORS Configuration" "fail" "CORS not configured"
fi

# Check rate limiting
if grep -rq "rate-limit\|rateLimit\|express-rate-limit" server/ 2>/dev/null; then
    check "Rate Limiting" "pass" "Rate limiting implemented"
else
    check "Rate Limiting" "warn" "No rate limiting - add for production"
fi

# Check helmet
if grep -q "helmet" server/app.js 2>/dev/null; then
    check "Helmet Security Headers" "pass" "Helmet middleware configured"
else
    check "Helmet Security Headers" "warn" "Helmet not configured - add for security"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  DATABASE CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"

# Check database connection
if pm2 jlist 2>/dev/null | grep -q "mediczy-server.*online"; then
    check "Database Connection" "pass" "Server running (database connected)"
else
    check "Database Connection" "warn" "Server status unknown"
fi

# Check for database credentials in env
if [ -n "$DB_HOST" ] && [ -n "$DB_USER" ]; then
    check "Database Credentials" "pass" "Using environment variables"
else
    check "Database Credentials" "warn" "Credentials may be hardcoded - use env vars"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  SSL/TLS CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"

# Check for SSL certificates
if [ -f "/etc/ssl/mediczy/certificate.crt" ] || [ -f "ssl/certificate.crt" ]; then
    check "SSL Certificates" "pass" "SSL certificates found"
else
    check "SSL Certificates" "warn" "No SSL certificates - HTTPS required for production"
fi

# Check HTTPS configuration
if grep -rq "https.createServer\|createHttpsServer" server/ 2>/dev/null; then
    check "HTTPS Server" "pass" "HTTPS configured"
else
    check "HTTPS Server" "warn" "Using HTTP only - configure HTTPS for production"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  LOGGING & MONITORING"
echo "═══════════════════════════════════════════════════════════════════"

# Check for logging
if grep -rq "winston\|morgan\|pino" server/ 2>/dev/null || grep -q "console.log" server/app.js 2>/dev/null; then
    check "Logging" "pass" "Logging configured"
else
    check "Logging" "warn" "No logging framework detected"
fi

# Check PM2
if which pm2 >/dev/null 2>&1; then
    check "PM2 Process Manager" "pass" "PM2 installed ($(pm2 -v))"
else
    check "PM2 Process Manager" "fail" "PM2 not installed"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  FILE STRUCTURE"
echo "═══════════════════════════════════════════════════════════════════"

# Check critical files
[ -f "server/app.js" ] && check "Server Entry Point" "pass" "server/app.js exists" || check "Server Entry Point" "fail" "server/app.js missing"
[ -f "package.json" ] && check "Package Configuration" "pass" "package.json exists" || check "Package Configuration" "fail" "package.json missing"
[ -d "server/models" ] && check "Database Models" "pass" "Models directory exists" || check "Database Models" "fail" "Models directory missing"
[ -d "server/routes" ] && check "API Routes" "pass" "Routes directory exists" || check "API Routes" "fail" "Routes directory missing"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
TOTAL=$((PASSED + FAILED + WARNINGS))

echo -e "RESULTS: ${GREEN}$PASSED Passed${NC}, ${YELLOW}$WARNINGS Warnings${NC}, ${RED}$FAILED Critical${NC}"
echo "Total Checks: $TOTAL"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}✗ CRITICAL ISSUES FOUND - FIX BEFORE PRODUCTION${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ WARNINGS FOUND - REVIEW BEFORE PRODUCTION${NC}"
    echo ""
    echo "See PRODUCTION_CHECKLIST.md for detailed steps"
    exit 0
else
    echo -e "${GREEN}✓ ALL CHECKS PASSED - PRODUCTION READY${NC}"
    exit 0
fi
